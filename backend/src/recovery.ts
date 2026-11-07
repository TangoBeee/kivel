import { clientKey } from './security.js';
import { isDisposableEmail } from './disposable.js';
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
    randomInt,
} from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Access, HttpError } from './access.js';
import { passwordHash, verifyPassword } from './identity.js';
import type { RateLimitRepository } from './rate-limit.js';
import type { RecoveryRepository, Purpose } from './recovery-store.js';
import type { MailSender, MailMessage } from './mail.js';

export function emailAddress(value: unknown): string {
    if (typeof value !== 'string') throw new HttpError(400, 'Enter a valid email address.');
    const email = value.trim().toLowerCase();
    if (
        email.length > 254 ||
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
            email,
        )
    )
        throw new HttpError(400, 'Enter a valid email address.');
    if (isDisposableEmail(email))
        throw new HttpError(
            400,
            'Use an email address you keep. Temporary inbox services are not accepted.',
        );
    return email;
}
export function validPassword(value: unknown): asserts value is string {
    if (typeof value !== 'string' || Buffer.byteLength(value) < 8 || Buffer.byteLength(value) > 256)
        throw new HttpError(400, 'Use a password between 8 and 256 UTF-8 bytes.');
}
const bodyObject = (body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new HttpError(400, 'Provide a JSON object.');
    return body as Record<string, unknown>;
};
export class RecoveryService {
    private key: Buffer;
    private busy: Promise<void> | undefined;
    private stopped = false;
    private timer: ReturnType<typeof setInterval> | undefined;
    private hashing = false;
    constructor(
        readonly store: RecoveryRepository,
        private sender: MailSender | undefined,
        secret: string,
        private origin: string,
        private limits: RateLimitRepository,
        private failed: () => void,
    ) {
        this.key = createHash('sha256').update(`socket-help:recovery:${secret}`).digest();
    }
    get enabled() {
        return !!this.sender;
    }
    start() {
        this.timer = setInterval(() => this.kick(), this.enabled ? 1000 : 60000);
        this.timer.unref();
        this.kick();
    }
    private seal(value: MailMessage) {
        const iv = randomBytes(12),
            cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    }
    private open(value: Buffer): MailMessage {
        const cipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12));
        cipher.setAuthTag(value.subarray(12, 28));
        return JSON.parse(
            Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString(),
        );
    }
    private hash(purpose: Purpose, binding: string, code: string) {
        return createHmac('sha256', this.key).update(`${purpose}:${binding}:${code}`).digest();
    }
    private async allowance(ip: string, email: string) {
        if (!this.enabled)
            throw new HttpError(
                503,
                'Email delivery is temporarily unavailable. Please try again later.',
            );
        const address = createHash('sha256').update(email).digest('hex');
        const policies: [string, number, number][] = [
            [`mail-ip:${ip}`, 10, 3600000],
            [`mail-address:${address}`, 3, 3600000],
            [`mail-cooldown:${address}`, 1, 60000],
        ];
        for (const [key, count, window] of policies)
            if (await this.limits.consume(key, count, window)) return false;
        return true;
    }
    private async issue(
        userId: string,
        email: string,
        currentPassword: string,
        purpose: Purpose,
        username?: string,
    ) {
        // The global send budget is spent only on messages that are actually queued.
        if (await this.limits.consume('mail-global', 100, 3600000)) return;
        const code = String(randomInt(100000000)).padStart(8, '0');
        await this.store.issue({
            userId,
            email,
            purpose,
            passwordHash: currentPassword,
            hash: this.hash(purpose, purpose === 'verify' ? userId : email, code),
            expires: Date.now() + 900000,
            payload: this.seal({
                to: email,
                subject:
                    purpose === 'verify' ? 'Verify your Kivel email' : 'Reset your Kivel password',
                text: `${username ? `Account: ${username}\n\n` : ''}Your ${purpose === 'verify' ? 'email verification' : 'password reset'} code is:\n\n${code}\n\nEnter this code at ${this.origin}/account/. It expires in 15 minutes and works once.\n\n${purpose === 'reset' ? 'Resetting your password signs out all sessions and revokes your API keys.\n\n' : ''}If you did not request this, ignore this email.`,
            }),
        });
        this.kick();
    }
    async registration(userId: string, email: string, currentPassword: string, ip: string) {
        await this.store.contact(userId, email);
        if (this.enabled) await this.verification(userId, email, currentPassword, ip);
    }
    async verification(userId: string, email: string, currentPassword: string, ip: string) {
        if (await this.allowance(ip, email))
            await this.issue(userId, email, currentPassword, 'verify');
    }
    private kick() {
        if (this.busy || this.stopped) return;
        this.busy = (async () => {
            await this.store.cleanup();
            if (!this.sender) return;
            for (let index = 0; index < 5 && !this.stopped; index++) {
                const job = await this.store.claim();
                if (!job) break;
                let sent = false;
                try {
                    await this.sender!.send(this.open(job.payload));
                    sent = true;
                } catch {
                    this.failed();
                }
                await this.store.finish(job.id, sent);
            }
        })()
            .catch(() => this.failed())
            .finally(() => {
                this.busy = undefined;
            });
    }
    async close() {
        this.stopped = true;
        clearInterval(this.timer);
        await this.busy;
        this.sender?.close();
    }
    register(app: FastifyInstance, access: Access) {
        const checkOrigin = (request: FastifyRequest) => {
            if (request.headers.origin !== this.origin)
                throw new HttpError(403, 'Open this form on Kivel to continue.');
        };
        const attempts = async (request: FastifyRequest) => {
            checkOrigin(request);
            const retry = await this.limits.consume(
                `recovery-attempt:${clientKey(request.ip)}`,
                20,
                900000,
            );
            if (retry)
                throw new HttpError(429, 'Too many recovery attempts. Try again later.', retry);
        };
        app.get('/api/auth/recovery', async () => ({ enabled: this.enabled }));
        app.get('/api/account/recovery', async (request) => ({
            ...(await this.store.status(
                (await access.require(request, 'account:read', true)).userId,
            )),
            enabled: this.enabled,
        }));
        app.post('/api/account/email', { bodyLimit: 4096 }, async (request, reply) => {
            await attempts(request);
            const identity = await access.require(request, 'account:read', true),
                body = bodyObject(request.body),
                email = emailAddress(body.email);
            validPassword(body.password);
            if (this.hashing)
                throw new HttpError(503, 'Account security is busy. Try again shortly.', 5);
            this.hashing = true;
            try {
                const user = await access.identities.findUser(identity.username);
                const passwordSnapshot = user?.passwordHash;
                if (!user || !(await verifyPassword(body.password, passwordSnapshot!)))
                    throw new HttpError(401, 'Password is incorrect.');
                await this.verification(
                    identity.userId,
                    email,
                    passwordSnapshot!,
                    clientKey(request.ip),
                );
                return reply.code(202).send({
                    message:
                        'Check your email for a verification code. Allow a minute before requesting another.',
                });
            } finally {
                this.hashing = false;
            }
        });
        app.post('/api/account/email/verify', { bodyLimit: 4096 }, async (request, reply) => {
            await attempts(request);
            const identity = await access.require(request, 'account:read', true),
                body = bodyObject(request.body);
            const code = this.code(body.code);
            if (
                !(await this.store.consume(
                    identity.userId,
                    null,
                    'verify',
                    this.hash('verify', identity.userId, code),
                ))
            )
                throw new HttpError(
                    400,
                    'The code is incorrect, expired, or already used. Request a new code if needed.',
                );
            return reply.code(204).send();
        });
        app.post('/api/auth/password/forgot', { bodyLimit: 4096 }, async (request, reply) => {
            checkOrigin(request);
            const email = emailAddress(bodyObject(request.body).email),
                start = Date.now();
            if (await this.allowance(clientKey(request.ip), email)) {
                const user = await this.store.recipient(email);
                if (user)
                    await this.issue(user.userId, email, user.passwordHash, 'reset', user.username);
            }
            await delay(Math.max(0, 250 - (Date.now() - start)));
            return reply.code(202).send({
                message:
                    'If this email has a verified account, a reset code will arrive shortly. Allow a minute before requesting another.',
            });
        });
        app.post('/api/auth/password/reset', { bodyLimit: 4096 }, async (request, reply) => {
            await attempts(request);
            const body = bodyObject(request.body),
                email = emailAddress(body.email),
                code = this.code(body.code);
            validPassword(body.password);
            if (this.hashing)
                throw new HttpError(503, 'Account security is busy. Try again shortly.', 5);
            this.hashing = true;
            try {
                if (
                    !(await this.store.consume(
                        null,
                        email,
                        'reset',
                        this.hash('reset', email, code),
                        await passwordHash(body.password),
                    ))
                )
                    throw new HttpError(
                        400,
                        'The code is incorrect, expired, or already used. Request a new code if needed.',
                    );
                return reply.header('Set-Cookie', access.cookie('', true)).code(204).send();
            } finally {
                this.hashing = false;
            }
        });
    }
    private code(value: unknown) {
        if (typeof value !== 'string' || !/^\d{8}$/.test(value))
            throw new HttpError(400, 'Enter the eight-digit code from your email.');
        return value;
    }
}
