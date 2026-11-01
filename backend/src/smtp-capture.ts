import { parseAttachments } from './email-attachments.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import PostalMime from 'postal-mime';
import type { FastifyInstance } from 'fastify';
import type { Access } from './access.js';
import { HttpError } from './access.js';
import type { ResourceRepository } from './resources.js';
import type { EmailMessageRepository } from './email.js';
import { extractFromEmail } from './email.js';
import type { RateLimitRepository } from './rate-limit.js';
export interface SmtpCaptureConfig {
    port: number;
    host: string;
    publicHost: string;
    publicPort: number;
    certPath?: string;
    keyPath?: string;
    local?: boolean;
}
export function registerSmtpCapture(
    app: FastifyInstance,
    access: Access,
    resources: ResourceRepository,
    messages: EmailMessageRepository,
    limits: RateLimitRepository,
    config?: SmtpCaptureConfig,
) {
    const settings = (id: string, password?: string) => ({
        host: config!.publicHost,
        port: config!.publicPort,
        secure: !config!.local,
        username: id,
        ...(password ? { password } : {}),
    });
    app.post('/api/smtp-inboxes', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        if (!config) throw new HttpError(503, 'SMTP capture is not configured on this server.');
        const allocation = await access.allocation(request);
        await access.rate(request, true);
        const created = await resources.create(
            'email',
            {
                smtpCapture: true,
                name: 'SMTP capture',
                smtp: { host: config.publicHost, port: config.publicPort, secure: !config.local },
            },
            undefined,
            { ...allocation, visibility: 'private' },
        );
        if (!created) throw new HttpError(503, 'Inbox capacity reached.');
        return reply.code(201).send({
            id: created.id,
            expiresAt: created.expiresAt,
            smtp: settings(created.id, created.accessToken),
        });
    });
    app.get<{ Params: { id: string } }>('/api/smtp-inboxes/:id', async (request) => {
        const actor = await access.scope(request, 'resources:read');
        const inbox = await resources.read(
            request.params.id,
            'email',
            '',
            actor.identity?.account.id,
        );
        if (!inbox?.payload.smtpCapture)
            throw new HttpError(404, 'SMTP inbox unavailable or access denied.');
        return {
            id: inbox.id,
            expiresAt: inbox.expiresAt,
            smtp: config
                ? settings(inbox.id)
                : { ...(inbox.payload.smtp as object), username: inbox.id },
            enabled: Boolean(config),
        };
    });
    app.post<{ Params: { id: string } }>('/api/smtp-inboxes/:id/rotate', async (request) => {
        const actor = await access.scope(request, 'resources:write');
        const inbox = await resources.read(
            request.params.id,
            'email',
            '',
            actor.identity?.account.id,
        );
        if (!config || !inbox?.payload.smtpCapture)
            throw new HttpError(404, 'SMTP inbox unavailable or access denied.');
        const sharing = await resources.setSharing(
            inbox.id,
            'email',
            '',
            'private',
            actor.identity!.account.id,
        );
        return { smtp: settings(inbox.id, sharing!.accessToken) };
    });
    if (!config) return;
    if (!config.local && (!config.certPath || !config.keyPath))
        throw new Error('Public SMTP capture requires TLS certificate and key paths.');
    const server = new SMTPServer({
        name: config.publicHost,
        secure: !config.local,
        ...(config.local
            ? { allowInsecureAuth: true, disabledCommands: ['STARTTLS'] }
            : { cert: readFileSync(config.certPath!), key: readFileSync(config.keyPath!) }),
        size: 128 * 1024,
        maxClients: 20,
        socketTimeout: 30000,
        logger: false,
        onAuth(auth, session, callback) {
            void (async () => {
                if (await limits.consume(`smtp-auth:${session.remoteAddress}`, 30))
                    return callback(new Error('Authentication rate limited.'));
                if (
                    typeof auth.username !== 'string' ||
                    typeof auth.password !== 'string' ||
                    !/^[a-f0-9-]{36}$/i.test(auth.username) ||
                    !/^[A-Za-z0-9_-]{43}$/.test(auth.password)
                )
                    return callback(new Error('Invalid capture credentials.'));
                const inbox = await resources.peek(auth.username, 'email', {
                    token: auth.password,
                });
                if (!inbox?.payload.smtpCapture)
                    return callback(new Error('Invalid capture credentials.'));
                session.capturePassword = auth.password;
                return callback(null, { user: inbox.id });
            })().catch(() => callback(new Error('Capture unavailable.')));
        },
        onData(stream, session, callback) {
            let finished = false;
            const respond = callback;
            callback = (error) => {
                if (!finished) {
                    finished = true;
                    respond(error);
                }
            };
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on('data', (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes <= 128 * 1024) chunks.push(chunk);
            });
            stream.once('error', () => callback(new Error('Message could not be read.')));
            stream.once('end', () => {
                void (async () => {
                    if (bytes > 128 * 1024 || stream.sizeExceeded)
                        return callback(
                            Object.assign(new Error('Message exceeds 128 KiB.'), {
                                responseCode: 552,
                            }),
                        );
                    const id = String(session.user);
                    const password = session.capturePassword;
                    const current =
                        typeof password === 'string'
                            ? await resources.peek(id, 'email', { token: password })
                            : undefined;
                    if (!current?.payload.smtpCapture)
                        return callback(new Error('Capture expired or credentials changed.'));
                    if (await limits.consume(`smtp-data:${current.ownerId}`, 30))
                        return callback(new Error('Capture rate limited.'));
                    const parsed = await PostalMime.parse(Buffer.concat(chunks));
                    const text = (parsed.text ?? '').slice(0, 65536),
                        html = (parsed.html ?? '').slice(0, 65536);
                    const extraction = extractFromEmail(parsed.subject ?? '', text, html);
                    const attachmentInput = parseAttachments(
                        (parsed.attachments ?? []).map((item) => {
                            const bytes =
                                typeof item.content === 'string'
                                    ? Buffer.from(item.content)
                                    : item.content instanceof ArrayBuffer
                                      ? Buffer.from(item.content)
                                      : Buffer.from(item.content);
                            return {
                                filename: item.filename ?? '',
                                mimeType: item.mimeType,
                                size: bytes.length,
                                base64: bytes.toString('base64'),
                            };
                        }),
                        Boolean(current.ownerId),
                    );
                    const result = await messages.record(
                        id,
                        {
                            id: randomUUID(),
                            direction: 'inbound',
                            receivedAt: new Date().toISOString(),
                            from: parsed.from?.address ?? '',
                            to: (parsed.to ?? [])
                                .map((to) => ('address' in to ? to.address : ''))
                                .join(', '),
                            subject: (parsed.subject ?? '').slice(0, 998),
                            text,
                            html,
                            ...extraction,
                            attachments: attachmentInput.attachments,
                            ...(parsed.messageId ? { messageId: parsed.messageId } : {}),
                        },
                        attachmentInput.bodies,
                    );
                    callback(result === 'full' ? new Error('Capture inbox is full.') : null);
                })().catch(() => callback(new Error('Message capture failed.')));
            });
        },
    });
    server.on('error', () => app.log.error('SMTP capture listener failed.'));
    app.addHook(
        'onReady',
        () =>
            new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(config.port, config.host, () => {
                    server.removeListener('error', reject);
                    resolve();
                });
            }),
    );
    app.addHook('onClose', () => new Promise<void>((resolve) => server.close(() => resolve())));
}
declare module 'smtp-server' {
    interface SMTPServerSession {
        capturePassword?: string;
    }
}
