import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { HttpError, resourceToken } from './access.js';
import type { Access } from './access.js';
import type { ResourceRepository } from './resources.js';
import { isUuid } from './security.js';
import type { Waiters } from './waiting.js';
import { waitSeconds } from './waiting.js';

export const EMAIL_MESSAGE_LIMIT = 100;
const TEXT_LIMIT = 64 * 1024;
const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

/** Addresses encode the inbox UUID (base32, 26 characters), so routing needs no lookup table. */
export function emailLocalPart(id: string): string {
    const bytes = Buffer.from(id.replace(/-/g, ''), 'hex');
    let bits = 0,
        value = 0,
        output = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits) output += alphabet[(value << (5 - bits)) & 31];
    return output;
}

export function emailInboxId(localPart: string): string | undefined {
    const local = localPart.toLowerCase();
    if (!/^[a-z2-7]{26}$/.test(local)) return undefined;
    let bits = 0,
        value = 0;
    const bytes: number[] = [];
    for (const character of local) {
        value = (value << 5) | alphabet.indexOf(character);
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    const hex = Buffer.from(bytes.slice(0, 16)).toString('hex');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return isUuid(id) ? id : undefined;
}

export interface EmailLink {
    url: string;
    kind: 'verification' | 'other';
}

export interface EmailMessage {
    id: string;
    receivedAt: string;
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: EmailLink[];
    attachments: { filename: string; mimeType: string; size: number }[];
}

const codeWords =
    /(code|otp|one[- ]time|verification|verify|passcode|pin|security|login|sign[- ]?in|confirm)/i;
const verificationLink =
    /(verify|verification|confirm|activate|magic|login|log-in|signin|sign-in|token|reset|auth|invite|onboard)/i;

/** Pulls one-time codes and links out of a message without any AI. */
export function extractFromEmail(subject: string, text: string, html = '') {
    const codes: string[] = [];
    const scan = `${subject}\n${text}`;
    for (const match of scan.matchAll(/(?<![\w-])([A-Z0-9]{4,8}|\d{3}[ -]\d{3})(?![\w-])/g)) {
        const code = match[1]!;
        if (!/\d/.test(code) || /^(19|20)\d\d$/.test(code)) continue;
        const near = scan.slice(Math.max(0, match.index! - 80), match.index! + code.length + 40);
        if (codeWords.test(near) && !codes.includes(code)) codes.push(code);
    }
    const urls = new Set<string>();
    for (const match of `${text}\n${html}`.matchAll(/https?:\/\/[^\s"'<>)\]]+/g))
        urls.add(match[0].replace(/&amp;/g, '&').replace(/[.,;:]+$/, ''));
    const links: EmailLink[] = [...urls]
        .filter((url) => !/unsubscribe|list-manage|preferences/i.test(url))
        .slice(0, 20)
        .map((url) => ({ url, kind: verificationLink.test(url) ? 'verification' : 'other' }));
    links.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'verification' ? -1 : 1));
    return { codes: codes.slice(0, 5), links };
}

type MaybePromise<T> = T | Promise<T>;
export interface EmailMessageRepository {
    record(resourceId: string, message: EmailMessage): MaybePromise<'stored' | 'full'>;
    list(resourceId: string): MaybePromise<EmailMessage[]>;
    count(resourceId: string): MaybePromise<number>;
}

export class MemoryEmailMessages implements EmailMessageRepository {
    private readonly messages = new Map<string, EmailMessage[]>();
    record(resourceId: string, message: EmailMessage) {
        const list = this.messages.get(resourceId) ?? [];
        if (list.length >= EMAIL_MESSAGE_LIMIT) return 'full' as const;
        list.push(message);
        this.messages.set(resourceId, list);
        return 'stored' as const;
    }
    list(resourceId: string) {
        return [...(this.messages.get(resourceId) ?? [])];
    }
    count(resourceId: string) {
        return this.messages.get(resourceId)?.length ?? 0;
    }
}

export class PostgresEmailMessages implements EmailMessageRepository {
    constructor(private readonly pool: Pool) {}
    async record(resourceId: string, message: EmailMessage) {
        const result = await this.pool.query(
            `INSERT INTO email_messages (resource_id, message)
             SELECT id, $2::jsonb FROM temporary_resources
             WHERE id = $1 AND kind = 'email' AND expires_at > clock_timestamp()
               AND (SELECT count(*) FROM email_messages WHERE resource_id = $1) < $3`,
            [resourceId, JSON.stringify(message), EMAIL_MESSAGE_LIMIT],
        );
        return result.rowCount ? ('stored' as const) : ('full' as const);
    }
    async list(resourceId: string) {
        const result = await this.pool.query<{ message: EmailMessage }>(
            'SELECT message FROM email_messages WHERE resource_id = $1 ORDER BY sequence',
            [resourceId],
        );
        return result.rows.map((row) => row.message);
    }
    async count(resourceId: string) {
        const result = await this.pool.query<{ count: string }>(
            'SELECT count(*) FROM email_messages WHERE resource_id = $1',
            [resourceId],
        );
        return Number(result.rows[0]!.count);
    }
}

/** Accepts only requests signed by the Email Worker within the last five minutes. */
export function verifyIngest(secret: string, timestamp: unknown, signature: unknown, body: Buffer) {
    if (typeof timestamp !== 'string' || typeof signature !== 'string') return false;
    const sent = Number(timestamp);
    if (!Number.isFinite(sent) || Math.abs(Date.now() - sent * 1000) > 300000) return false;
    const expected = createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(body)
        .digest('hex');
    const given = signature.replace(/^sha256=/, '');
    return (
        given.length === expected.length &&
        timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    );
}

const text = (value: unknown, limit: number) =>
    typeof value === 'string' ? value.slice(0, limit) : '';

const pause = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        });
    });

interface EmailContext {
    app: FastifyInstance;
    access: Access;
    resources: ResourceRepository;
    messages: EmailMessageRepository;
    waiters: Waiters;
    mailDomain?: string;
    ingestSecret?: string;
}

export function registerEmail({
    app,
    access,
    resources,
    messages,
    waiters,
    mailDomain,
    ingestSecret,
}: EmailContext) {
    const configured = () => {
        if (!mailDomain) throw new HttpError(503, 'Email inboxes are not configured here yet.');
        return mailDomain;
    };
    const address = (id: string) => `${emailLocalPart(id)}@${configured()}`;
    async function owned(request: import('fastify').FastifyRequest, id: string) {
        const actor = await access.actor(request);
        const inbox = await resources.read(
            id,
            'email',
            resourceToken(request),
            actor.identity?.account.id,
        );
        if (!inbox) throw new HttpError(404, 'Email inbox unavailable or access denied.');
        return { inbox, actor };
    }

    app.post(
        '/api/email-inboxes',
        {
            onRequest: async (request) => {
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            configured();
            // Anyone can send mail to the address; reading always needs the management token.
            const query = (request.query ?? {}) as Record<string, unknown>;
            const created = await resources.create(
                'email',
                {},
                undefined,
                await access.allocation(request, { ...query, visibility: 'public' }),
            );
            if (!created)
                return reply
                    .code(503)
                    .send({ error: 'Temporary resource capacity reached. Try again later.' });
            const { accessToken: _unused, ...credentials } = created;
            return reply.code(201).send({ ...credentials, address: address(created.id) });
        },
    );

    app.get<{ Params: { id: string } }>('/api/email-inboxes/:id', async (request) => {
        const { inbox } = await owned(request, request.params.id);
        return {
            id: inbox.id,
            address: address(inbox.id),
            expiresAt: inbox.expiresAt,
            persistent: inbox.persistent,
            messageCount: await messages.count(inbox.id),
            messageLimit: EMAIL_MESSAGE_LIMIT,
        };
    });

    app.get<{ Params: { id: string } }>('/api/email-inboxes/:id/messages', async (request) => {
        const { inbox } = await owned(request, request.params.id);
        return { messages: await messages.list(inbox.id) };
    });

    app.get<{
        Params: { id: string };
        Querystring: { after?: string; timeoutSeconds?: string };
    }>('/api/email-inboxes/:id/wait', async (request) => {
        const { inbox, actor } = await owned(request, request.params.id);
        const deadline = Date.now() + waitSeconds(request.query.timeoutSeconds) * 1000;
        const abort = new AbortController();
        request.raw.once('close', () => abort.abort());
        return waiters.run(actor.quotaKey, async () => {
            let seen = -1;
            for (;;) {
                const count = await messages.count(inbox.id);
                if (count !== seen) {
                    seen = count;
                    const list = await messages.list(inbox.id);
                    const after = request.query.after;
                    const index = after ? list.findIndex((message) => message.id === after) : -1;
                    const fresh = list.slice(index + 1);
                    if (fresh.length) return { timedOut: false, messages: fresh };
                }
                if (abort.signal.aborted || Date.now() + 500 > deadline)
                    return { timedOut: true, messages: [] };
                await pause(500, abort.signal);
            }
        });
    });

    app.delete<{ Params: { id: string } }>('/api/email-inboxes/:id', async (request, reply) => {
        const actor = await access.actor(request);
        const deleted = await resources.delete(
            request.params.id,
            'email',
            resourceToken(request),
            actor.identity?.account.id,
        );
        return deleted
            ? reply.code(204).send()
            : reply.code(404).send({ error: 'Email inbox unavailable or access denied.' });
    });

    // Mail arrives from the Cloudflare Email Worker, signed with the shared ingest secret.
    app.register(async (ingest) => {
        ingest.removeAllContentTypeParsers();
        ingest.addContentTypeParser(
            '*',
            { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
            (_r, body, done) => done(null, body),
        );
        ingest.post('/hooks/email', async (request, reply) => {
            if (!ingestSecret || !mailDomain)
                return reply.code(503).send({ error: 'Email ingest is not configured.' });
            const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
            if (
                !verifyIngest(
                    ingestSecret,
                    request.headers['x-socket-timestamp'],
                    request.headers['x-socket-signature'],
                    raw,
                )
            )
                return reply.code(401).send({ error: 'Invalid signature.' });
            let input: Record<string, unknown>;
            try {
                input = JSON.parse(raw.toString('utf8'));
            } catch {
                return reply.code(400).send({ error: 'Invalid JSON.' });
            }
            const to = text(input.to, 320).toLowerCase();
            const [local, domain] = to.split('@');
            const id = local && domain === mailDomain ? emailInboxId(local) : undefined;
            if (!id) return reply.code(404).send({ error: 'Unknown address.' });
            const exists = await resources.peek(id, 'email', {});
            if (!exists) return reply.code(404).send({ error: 'Unknown address.' });
            const subject = text(input.subject, 998);
            const body = text(input.text, TEXT_LIMIT);
            const html = text(input.html, TEXT_LIMIT);
            const message: EmailMessage = {
                id: crypto.randomUUID(),
                receivedAt: new Date().toISOString(),
                from: text(input.from, 320),
                to,
                subject,
                text: body,
                ...(html ? { html } : {}),
                ...extractFromEmail(subject, body, html),
                attachments: (Array.isArray(input.attachments) ? input.attachments : [])
                    .slice(0, 20)
                    .map((item: Record<string, unknown>) => ({
                        filename: text(item?.filename, 200),
                        mimeType: text(item?.mimeType, 100),
                        size: Number(item?.size) || 0,
                    })),
            };
            const stored = await messages.record(id, message);
            return stored === 'stored'
                ? reply.code(202).send({ stored: true })
                : reply.code(429).send({ error: 'This inbox is full.' });
        });
    });
}
