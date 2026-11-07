import { emailAddressPattern, emailAllowed, emailApprovalRequired } from './email-threading.js';
import type { EmailRules } from './email-threading.js';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { load } from 'cheerio';
import { plans } from '@socket-help/tools/plans';
import { HttpError } from './access.js';
import type { Access, Actor } from './access.js';
import type { ResourceInfo } from './resources.js';
import type { EmailAddress } from './email-addresses.js';
import type { EmailMessageRepository, EmailMessage } from './email.js';

import type { RecoveryRepository } from './recovery-store.js';
import type { RateLimitRepository } from './rate-limit.js';
import { isUuid } from './security.js';
import { postfixAgentSender } from './email-transport.js';
import { newSendJob } from './email-sending-store.js';
import type { EmailSendingRepository } from './email-sending-store.js';

export interface AgentEmailConfig {
    host: string;
    port: number;
    enabled: boolean;
}
export type AgentEmailSend = (
    body: Record<string, unknown>,
    idempotencyKey: string,
) => Promise<{ id: string }>;
export { postfixAgentSender } from './email-transport.js';
export function bounceAddress(secret: string, id: string, index: number) {
    const mac = createHmac('sha256', secret)
        .update(`bounce:${id}:${index}`)
        .digest('base64url')
        .slice(0, 16);
    return `bounces+${id}-${index}-${mac}@socketspace.xyz`;
}
export async function receiveEmailFeedback(
    store: EmailSendingRepository,
    secret: string,
    input: Record<string, unknown>,
) {
    const match = /^bounces\+([a-f0-9-]{36})-(\d)-([A-Za-z0-9_-]{16})@socketspace\.xyz$/.exec(
        String(input.to),
    );
    if (!match || !isUuid(match[1]!)) return false;
    const expected = bounceAddress(secret, match[1]!, Number(match[2]));
    if (
        String(input.to).length !== expected.length ||
        !timingSafeEqual(Buffer.from(String(input.to)), Buffer.from(expected))
    )
        return true;
    const feedback = input.feedback as { type?: string; recipient?: string } | undefined;
    if (!feedback || !['bounce', 'complaint', 'complaint-review'].includes(feedback.type ?? ''))
        return true;
    const existing = await store.find(match[1]!);
    if (!existing) return true;
    await store.withOwner(existing.ownerId, async (session) => {
        const job = await session.job(existing.key);
        const recipient = job?.recipients[Number(match[2])];
        if (
            !job ||
            !recipient ||
            !recipient.attemptedAt ||
            feedback.recipient?.toLowerCase() !== recipient.address
        )
            return;
        if (feedback.type !== 'bounce') {
            recipient.complained = true;
            recipient.complaintReportedAt = new Date().toISOString();
            await session.save(job);
            return;
        }
        recipient.bounced = true;
        await session.suppress(recipient.address, 'bounce');
        await session.save(job);
        const stats = await session.reputation();
        if (stats.sent >= 20 && stats.bounced / stats.sent > 0.05)
            await session.suspend('Bounce rate exceeds 5% over 30 days (at least 20 recipients)');
    });
    return true;
}
function recipientAddress(value: unknown) {
    if (typeof value !== 'string' || value.length > 254 || !emailAddressPattern.test(value))
        throw new HttpError(400, 'Provide plain recipient email addresses without display names.');
    return value.toLowerCase();
}
export function validateEmailContent(
    value: unknown,
    recipientLimit: number,
    byteLimit = 1024 * 1024,
) {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some(
            (key) => !['to', 'cc', 'subject', 'text', 'html', 'replyTo'].includes(key),
        )
    )
        throw new HttpError(
            400,
            'Provide to, subject, text or html, and optionally cc and replyTo.',
        );
    const input = value as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(input)) + 1024 > byteLimit)
        throw new HttpError(
            413,
            `Message and delivery headers must fit within ${byteLimit / 1024} KiB.`,
        );
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const cc = input.cc === undefined ? [] : Array.isArray(input.cc) ? input.cc : [input.cc];
    if (!to.length || to.length + cc.length > recipientLimit)
        throw new HttpError(
            400,
            `This plan allows at most ${recipientLimit} recipients per message, including cc.`,
        );
    const recipients = [...to, ...cc].map(recipientAddress);
    if (new Set(recipients).size !== recipients.length)
        throw new HttpError(400, 'List each recipient once.');
    if (
        typeof input.subject !== 'string' ||
        !input.subject.trim() ||
        input.subject.length > 998 ||
        /[\r\n\x00]/.test(input.subject)
    )
        throw new HttpError(400, 'Provide a subject of 1–998 characters without line breaks.');
    if (
        (input.text !== undefined && typeof input.text !== 'string') ||
        (input.html !== undefined && typeof input.html !== 'string') ||
        (!(typeof input.text === 'string' && input.text.trim()) &&
            !(typeof input.html === 'string' && input.html.trim()))
    )
        throw new HttpError(400, 'Provide a non-empty text or html body.');
    if (
        input.replyTo !== undefined &&
        (typeof input.replyTo !== 'string' || !isUuid(input.replyTo))
    )
        throw new HttpError(400, 'replyTo must be a received message ID in this inbox.');
    return {
        to: recipients.slice(0, to.length),
        cc: recipients.slice(to.length),
        subject: input.subject,
        ...(typeof input.text === 'string' ? { text: input.text } : {}),
        ...(typeof input.html === 'string' ? { html: input.html } : {}),
        ...(typeof input.replyTo === 'string' ? { replyTo: input.replyTo } : {}),
    };
}
export type EmailContent = ReturnType<typeof validateEmailContent>;
const footer = 'Sent by an AI agent through socket.help.';
const messageId = (value: unknown): value is string =>
    typeof value === 'string' && /^<[^<>\s\x00-\x1f\x7f]{1,900}>$/.test(value);

interface Context {
    app: FastifyInstance;
    access: Access;
    messages: EmailMessageRepository;
    recovery: RecoveryRepository;
    limits: RateLimitRepository;
    store: EmailSendingRepository;
    secret: string;
    config?: AgentEmailConfig;
    send?: AgentEmailSend;
    owned: (
        request: FastifyRequest,
        id: string,
    ) => Promise<{ inbox: ResourceInfo; actor: Actor; row: EmailAddress | undefined }>;
}
export function registerEmailSending({
    app,
    access,
    messages,
    recovery,
    limits,
    store,
    secret,
    config,
    owned,
    send = config ? postfixAgentSender(config) : undefined,
}: Context) {
    let inflight = 0;
    const sign = (id: string, index: number) =>
        createHmac('sha256', secret).update(`unsubscribe:${id}:${index}`).digest('base64url');
    const cleanup = setInterval(() => {
        void store.cleanup().catch(() => app.log.error('Email sending cleanup failed.'));
    }, 3600000).unref();
    app.addHook('onClose', async () => {
        clearInterval(cleanup);
    });
    // What the dashboard shows next to the sending limits.
    app.get('/api/email-sending/usage', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        const [day, month] = await store.withOwner(actor.identity.account.id, (session) =>
            Promise.all([session.usage(), session.usage('month')]),
        );
        return {
            day,
            month,
            perDay: plans[actor.plan].emailsPerDay,
            perMonth: plans[actor.plan].emailsPerMonth,
        };
    });
    async function deliverEmail(
        { inbox, actor, row }: Awaited<ReturnType<Context['owned']>>,
        value: unknown,
        delivery: string | undefined | { draftId: string; approved: boolean },
    ) {
        const draft = typeof delivery === 'object' ? delivery : undefined;
        const key = draft ? `draft:${draft.draftId}` : delivery;
        if (
            (inbox.payload.emailRules as EmailRules | undefined)?.requireApproval &&
            !draft?.approved
        )
            throw new HttpError(403, emailApprovalRequired);
        if (!config?.enabled || !send)
            throw new HttpError(
                503,
                'Agent email sending is disabled. The operator must configure the separate agent-mail domain and enable sending.',
            );
        if (!row || row.pausedAt || row.retiredAt || !row.address.endsWith('@socketspace.xyz'))
            throw new HttpError(403, 'Sending requires an active, owned socketspace.xyz inbox.');
        const input = validateEmailContent(value, plans[actor.plan].emailRecipients);
        const recipients = [...input.to, ...input.cc];
        for (const recipient of recipients)
            if (
                !emailAllowed(
                    recipient,
                    inbox.payload.emailRules as EmailRules | undefined,
                    'outbound',
                )
            )
                throw new HttpError(403, 'A recipient is blocked by this inbox’s outbound rules.');
        if (typeof key !== 'string' || (!draft && !/^[A-Za-z0-9_-]{16,100}$/.test(key)))
            throw new HttpError(
                400,
                'Provide a unique Idempotency-Key header (16–100 letters, numbers, hyphens or underscores). Reuse it only when retrying the same message.',
            );
        if (actor.plan === 'free') {
            const owner = (await access.identities.members(row.ownerId)).find(
                (member) => member.role === 'owner',
            );
            if (!owner || !(await recovery.status(owner.userId)).verifiedAt)
                throw new HttpError(
                    403,
                    'The workspace owner must verify their account email before Free email sending is enabled.',
                );
        }
        let references: string[] = [];
        if (input.replyTo !== undefined) {
            const received = (await messages.list(inbox.id)).find(
                (message) => message.id === input.replyTo && message.direction !== 'outbound',
            );
            if (!received || !messageId(received.messageId))
                throw new HttpError(
                    400,
                    'That received message is unavailable or lacks a valid Message-ID for threading.',
                );
            references = [
                ...(received.references ?? []).filter(messageId).slice(-9),
                received.messageId,
            ];
        }
        const plain = `${typeof input.text === 'string' ? input.text : load(String(input.html)).text()}\n\n${footer}`;
        const html = typeof input.html === 'string' ? `${input.html}<p>${footer}</p>` : undefined;
        if (
            Buffer.byteLength(plain) +
                Buffer.byteLength(html ?? '') +
                Buffer.byteLength(input.subject) +
                4096 >
            1024 * 1024
        )
            throw new HttpError(
                413,
                'Rendered text, HTML and delivery headers must fit within 1 MiB.',
            );
        const retryAfter = await limits.consume(
            `email-send:${actor.quotaKey}`,
            plans[actor.plan].emailsPerMinute,
        );
        if (retryAfter) throw new HttpError(429, 'Email sending rate limit reached.', retryAfter);
        if (inflight >= 4)
            throw new HttpError(
                503,
                'Email delivery is busy. Retry with the same Idempotency-Key.',
                2,
            );
        inflight++;
        try {
            return await store.withOwner(row.ownerId, async (session) => {
                const reputation = await session.reputation();
                if (reputation.suspended)
                    throw new HttpError(
                        403,
                        `Workspace sending is suspended: ${reputation.suspended}. Contact support@socket.help.`,
                    );
                for (const address of recipients)
                    if (await session.blocked(address))
                        throw new HttpError(
                            403,
                            'A recipient is suppressed because of a bounce, complaint or unsubscribe.',
                        );
                const hash = createHash('sha256')
                    .update(
                        JSON.stringify({
                            inbox: inbox.id,
                            recipients,
                            ...(input.cc.length ? { cc: input.cc } : {}),
                            subject: input.subject,
                            text: input.text ?? null,
                            html: input.html ?? null,
                            references,
                        }),
                    )
                    .digest('hex');
                let job = await session.job(key);
                if (job && job.hash !== hash)
                    throw new HttpError(
                        409,
                        'This Idempotency-Key already belongs to a different message.',
                    );
                if (job?.status === 'sent')
                    return {
                        httpStatus: 200,
                        id: job.id,
                        status: 'sent',
                        providerIds: job.recipients.map((recipient) => recipient.providerId),
                    };
                if (
                    job &&
                    (job.status === 'failed' ||
                        job.recipients.some(
                            (recipient) => recipient.attemptedAt && !recipient.providerId,
                        ))
                )
                    throw new HttpError(
                        409,
                        'This send has an uncertain relay outcome. Inspect the mail queue before creating another message; retrying could send a duplicate.',
                    );
                if (!job) {
                    if (
                        (await session.usage('month')) + recipients.length >
                        plans[actor.plan].emailsPerMonth
                    )
                        throw new HttpError(
                            429,
                            `Monthly email allowance reached (${plans[actor.plan].emailsPerMonth} recipient deliveries, UTC calendar month).`,
                        );
                    if (
                        (await session.usage()) + recipients.length >
                        plans[actor.plan].emailsPerDay
                    )
                        throw new HttpError(
                            429,
                            `Daily email allowance reached (${plans[actor.plan].emailsPerDay} recipient deliveries, UTC reset).`,
                        );
                    job = newSendJob({
                        ownerId: row.ownerId,
                        inboxId: inbox.id,
                        key,
                        hash,
                        recipients: recipients.map((address) => ({ address })),
                    });
                    await session.save(job);
                }
                const message: EmailMessage = {
                    id: job.id,
                    direction: 'outbound',
                    deliveryStatus: 'pending',
                    receivedAt: job.createdAt,
                    from: row.address,
                    to: input.to.join(', '),
                    ...(input.cc.length ? { cc: input.cc } : {}),
                    subject: input.subject as string,
                    text: plain,
                    ...(html ? { html } : {}),
                    ...(references.length ? { references, inReplyTo: references.at(-1)! } : {}),
                    codes: [],
                    links: [],
                    attachments: [],
                };
                if ((await messages.record(inbox.id, message)) === 'full') {
                    job.status = 'failed';
                    await session.save(job);
                    throw new HttpError(
                        409,
                        'This inbox is full. Create another inbox before sending.',
                    );
                }
                for (const [index, recipient] of job.recipients.entries()) {
                    if (recipient.providerId) continue;
                    recipient.attemptedAt = new Date().toISOString();
                    await session.save(job);
                    try {
                        const receipt = await send(
                            {
                                from: row.address,
                                ...(input.cc.length
                                    ? { to: input.to, cc: input.cc }
                                    : { to: [recipient.address] }),
                                subject: input.subject,
                                text: plain,
                                ...(html ? { html } : {}),
                                envelope: {
                                    from: bounceAddress(secret, job.id, index),
                                    to: [recipient.address],
                                },
                                messageId: `<${job.id}.${index}@socketspace.xyz>`,
                                headers: {
                                    'List-Unsubscribe': `<${access.origin}/email/unsubscribe/${job.id}/${index}/${sign(job.id, index)}>`,
                                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                                    ...(references.length
                                        ? {
                                              'In-Reply-To': references.at(-1),
                                              References: references.join(' '),
                                          }
                                        : {}),
                                },
                            },
                            `${job.id}-${index}`,
                        );
                        recipient.providerId = receipt.id;
                        await session.save(job);
                    } catch (error) {
                        if (
                            error instanceof HttpError &&
                            error.statusCode === 422 &&
                            !job.recipients.some((value) => value.providerId)
                        )
                            job.status = 'failed';
                        await session.save(job);
                        throw error instanceof HttpError
                            ? error
                            : new HttpError(
                                  502,
                                  'Delivery outcome is uncertain. Retry only with the same Idempotency-Key.',
                              );
                    }
                }
                job.status = 'sent';
                await session.save(job);
                await messages.replace(inbox.id, job.id, {
                    ...message,
                    deliveryStatus: 'sent',
                });
                return {
                    httpStatus: 202,
                    id: job.id,
                    status: 'sent',
                    providerIds: job.recipients.map((recipient) => recipient.providerId),
                };
            });
        } finally {
            inflight--;
        }
    }
    app.post<{ Params: { id: string } }>(
        '/api/email-inboxes/:id/send',
        { bodyLimit: 1024 * 1024 },
        async (request, reply) => {
            const context = await owned(request, request.params.id);
            if (context.actor.identity) await access.require(request, 'resources:write');
            const { httpStatus, ...result } = await deliverEmail(
                context,
                request.body,
                typeof request.headers['idempotency-key'] === 'string'
                    ? request.headers['idempotency-key']
                    : undefined,
            );
            return reply.code(httpStatus).send(result);
        },
    );
    app.register(async (unsubscribe) => {
        unsubscribe.removeAllContentTypeParsers();
        unsubscribe.addContentTypeParser(
            '*',
            { parseAs: 'buffer', bodyLimit: 4096 },
            (_r, body, done) => done(null, body),
        );
        unsubscribe.route<{ Params: { id: string; index: string; signature: string } }>({
            method: ['GET', 'POST'],
            url: '/email/unsubscribe/:id/:index/:signature',
            handler: async (request, reply) => {
                const { id, index, signature } = request.params;
                const expected = sign(id, Number(index));
                if (
                    !isUuid(id) ||
                    !/^\d$/.test(index) ||
                    signature.length !== expected.length ||
                    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
                )
                    throw new HttpError(404, 'Unsubscribe link unavailable.');
                const job = await store.find(id),
                    recipient = job?.recipients[Number(index)];
                if (!job || !recipient) throw new HttpError(404, 'Unsubscribe link unavailable.');
                reply.header('X-Robots-Tag', 'noindex, nofollow');
                if (request.method === 'POST') {
                    await store.withOwner(job.ownerId, (session) =>
                        session.suppress(recipient.address, 'unsubscribe'),
                    );
                    return reply
                        .type('text/html')
                        .send(
                            '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribed · socket.help</title><main><h1>You are unsubscribed.</h1><p>This workspace cannot send you more agent email.</p></main></html>',
                        );
                }
                return reply
                    .type('text/html')
                    .send(
                        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe · socket.help</title><main><h1>Stop email from this workspace?</h1><form method="post"><button>Unsubscribe</button></form></main></html>',
                    );
            },
        });
    });
    return deliverEmail;
}
