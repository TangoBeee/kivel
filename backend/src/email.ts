import type { ThreadMessage } from './email-threading.js';
import {
    inboundEmailAllowed,
    emailRules,
    emptyEmailRules,
    groupEmailThreads,
    pageEmailThreads,
} from './email-threading.js';
import type { EmailRules } from './email-threading.js';
import { inboxRuleLimits } from '@kivel/tools/billing-plans';
import {
    parseAttachments,
    INBOX_ATTACHMENT_BYTES,
    MESSAGE_ATTACHMENT_BYTES,
} from './email-attachments.js';
import type { AttachmentBody, EmailAttachment } from './email-attachments.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { HttpError, resourceToken } from './access.js';
import type { Access } from './access.js';
import type { ResourceRepository } from './resources.js';
import { MAX_RESOURCE_BYTES } from './resources.js';
import { isUuid } from './security.js';
import type { Waiters } from './waiting.js';
import { waitSeconds } from './waiting.js';
import { load } from 'cheerio';
import { transaction } from './database.js';
import { randomUUID } from 'node:crypto';
import { plans } from '@kivel/tools/plans';
import { entitlement } from './entitlements.js';
import { effectivePlan } from './identity.js';
import { customEmailLocalPart } from './email-addresses.js';
import type { EmailAddressRepository } from './email-addresses.js';
import { EmailLifecycle, PERMANENT_EMAIL_EXPIRY } from './email-lifecycle.js';
import { publicRequest, publicUrl } from './public-network.js';
import type { ForwardSend } from './forwarding.js';

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
    mailFrom?: string;
    to: string;
    cc?: string[];
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: EmailLink[];
    attachments: EmailAttachment[];
    direction?: 'inbound' | 'outbound';
    deliveryStatus?: 'pending' | 'sent';
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
}

const codeWords =
    /(code|otp|one[- ]time|verification|verify|passcode|pin|security|login|sign[- ]?in|confirm)/i;
const verificationLink =
    /(verify|verification|confirm|activate|magic|login|log-in|signin|sign-in|token|reset|auth|invite|onboard)/i;

/** Pulls one-time codes and links out of a message without any AI. */
export function extractFromEmail(subject: string, text: string, html = '') {
    const codes: string[] = [];
    const readable = text || load(html).text();
    const scan = `${subject}\n${readable}`.replace(/\u00a0/g, ' ');
    for (const match of scan.matchAll(
        /(?<![\w-])([A-Z0-9]{4}-[A-Z0-9]{4}|[A-Z0-9]{4,8}|\d{3}[ -]\d{3})(?![\w-])/g,
    )) {
        const code = match[1]!;
        if ((!/\d/.test(code) && !/^[A-Z]{4}-[A-Z]{4}$/.test(code)) || /^(19|20)\d\d$/.test(code))
            continue;
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
    attachment(
        resourceId: string,
        messageId: string,
        attachmentId: string,
    ): MaybePromise<{ filename: string; bytes: Buffer } | undefined>;
    record(
        resourceId: string,
        message: EmailMessage,
        bodies?: AttachmentBody[],
    ): MaybePromise<'stored' | 'full'>;
    list(resourceId: string): MaybePromise<EmailMessage[]>;
    threadMessages(resourceId: string): MaybePromise<ThreadMessage[]>;
    count(resourceId: string): MaybePromise<number>;
    cursor(resourceId: string): MaybePromise<string>;
    delete(resourceId: string): MaybePromise<void>;
    replace(resourceId: string, id: string, message: EmailMessage): MaybePromise<void>;
}

interface StoredEmailMessage extends EmailMessage {
    attachmentBodies?: AttachmentBody[];
}
function publicMessage(message: StoredEmailMessage): EmailMessage {
    const { attachmentBodies: _, ...value } = message;
    return structuredClone(value);
}
function attachmentFile(message: StoredEmailMessage | undefined, id: string) {
    const body = message?.attachmentBodies?.find((body) => body.id === id),
        meta = message?.attachments.find((item) => item.id === id);
    return body && meta
        ? { filename: meta.filename, bytes: Buffer.from(body.base64, 'base64') }
        : undefined;
}
const bodyBytes = (bodies: AttachmentBody[] = []) =>
    bodies.reduce((sum, body) => sum + Buffer.byteLength(body.base64, 'base64'), 0);
export class MemoryEmailMessages implements EmailMessageRepository {
    private readonly messages = new Map<string, StoredEmailMessage[]>();
    private budget?: (id: string, bytes: number) => boolean;
    private live?: (id: string) => boolean;
    setBudget(budget: (id: string, bytes: number) => boolean, live: (id: string) => boolean) {
        this.budget = budget;
        this.live = live;
    }
    cleanup() {
        for (const id of this.messages.keys())
            if (this.live && !this.live(id)) this.messages.delete(id);
    }
    attachment(resourceId: string, messageId: string, attachmentId: string) {
        return attachmentFile(
            this.messages.get(resourceId)?.find((message) => message.id === messageId),
            attachmentId,
        );
    }
    record(
        resourceId: string,
        input: EmailMessage,
        bodies: AttachmentBody[] = [],
    ): MaybePromise<'stored' | 'full'> {
        const message: StoredEmailMessage = {
            ...input,
            ...(bodies.length ? { attachmentBodies: bodies } : {}),
        };
        const list = this.messages.get(resourceId) ?? [];
        if (list.some((item) => item.id === message.id)) return 'stored' as const;
        if (
            list.length >= EMAIL_MESSAGE_LIMIT ||
            list.reduce((sum, message) => sum + bodyBytes(message.attachmentBodies), 0) +
                bodyBytes(bodies) >
                INBOX_ATTACHMENT_BYTES
        )
            return 'full' as const;
        try {
            if (this.budget && !this.budget(resourceId, Buffer.byteLength(JSON.stringify(message))))
                return 'full' as const;
        } catch {
            return 'full' as const;
        }
        list.push(structuredClone(message));
        this.messages.set(resourceId, list);
        return 'stored' as const;
    }
    list(resourceId: string) {
        return (this.messages.get(resourceId) ?? []).map(publicMessage);
    }
    threadMessages(resourceId: string) {
        return this.messages.get(resourceId) ?? [];
    }
    cursor(resourceId: string) {
        return this.messages.get(resourceId)?.at(-1)?.id ?? '';
    }
    count(resourceId: string) {
        return this.messages.get(resourceId)?.length ?? 0;
    }
    delete(resourceId: string) {
        const bytes = (this.messages.get(resourceId) ?? []).reduce(
            (sum, message) => sum + Buffer.byteLength(JSON.stringify(message)),
            0,
        );
        if (bytes) this.budget?.(resourceId, -bytes);
        this.messages.delete(resourceId);
    }
    replace(resourceId: string, id: string, message: EmailMessage) {
        const list = this.messages.get(resourceId);
        const index = list?.findIndex((item) => item.id === id) ?? -1;
        if (list && index !== -1) {
            const stored = {
                ...message,
                ...(list[index]?.attachmentBodies
                    ? { attachmentBodies: list[index]!.attachmentBodies }
                    : {}),
            };
            const delta =
                Buffer.byteLength(JSON.stringify(stored)) -
                Buffer.byteLength(JSON.stringify(list[index]));
            if (this.budget && !this.budget(resourceId, delta))
                throw new HttpError(429, 'Mail storage allowance reached.');
            list[index] = structuredClone(stored);
        }
    }
}

export class PostgresEmailMessages implements EmailMessageRepository {
    constructor(
        private readonly pool: Pool,
        private maxBytes = MAX_RESOURCE_BYTES,
    ) {}
    async attachment(resourceId: string, messageId: string, attachmentId: string) {
        const row = (
            await this.pool.query(
                "SELECT message FROM email_messages WHERE resource_id=$1 AND message->>'id'=$2",
                [resourceId, messageId],
            )
        ).rows[0];
        return attachmentFile(row?.message, attachmentId);
    }
    async record(resourceId: string, input: EmailMessage, bodies: AttachmentBody[] = []) {
        const message = { ...input, ...(bodies.length ? { attachmentBodies: bodies } : {}) };
        return transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM resource_usage WHERE id=1 FOR UPDATE');
            const parent = await client.query(
                "SELECT id FROM temporary_resources WHERE id=$1 AND kind='email' AND expires_at > clock_timestamp() FOR UPDATE",
                [resourceId],
            );
            if (!parent.rowCount) return 'full' as const;
            if (
                (
                    await client.query(
                        "SELECT 1 FROM email_messages WHERE resource_id=$1 AND message->>'id'=$2",
                        [resourceId, message.id],
                    )
                ).rowCount
            )
                return 'stored' as const;
            const count = Number(
                (
                    await client.query(
                        'SELECT count(*) AS count FROM email_messages WHERE resource_id=$1',
                        [resourceId],
                    )
                ).rows[0].count,
            );
            if (count >= EMAIL_MESSAGE_LIMIT) return 'full' as const;
            const used = Number(
                (
                    await client.query(
                        "SELECT COALESCE(sum((meta->>'size')::bigint),0) AS bytes FROM email_messages m CROSS JOIN LATERAL jsonb_array_elements(m.message->'attachments') meta WHERE m.resource_id=$1 AND meta ? 'id'",
                        [resourceId],
                    )
                ).rows[0].bytes,
            );
            if (used + bodyBytes(bodies) > INBOX_ATTACHMENT_BYTES) return 'full' as const;
            const bytes = Number(
                (await client.query('SELECT octet_length($1::jsonb::text) AS bytes', [message]))
                    .rows[0].bytes,
            );
            const reserved = await client.query(
                'UPDATE resource_usage SET stored_bytes=stored_bytes+$1 WHERE id=1 AND stored_bytes+$1 <= $2 RETURNING id',
                [bytes, this.maxBytes],
            );
            if (!reserved.rowCount) return 'full' as const;
            await client.query(
                'UPDATE temporary_resources SET stored_bytes=stored_bytes+$2 WHERE id=$1',
                [resourceId, bytes],
            );
            const result = await client.query(
                `INSERT INTO email_messages (resource_id, message, stored_bytes)
             SELECT id, $2::jsonb, octet_length($2::jsonb::text) FROM temporary_resources
             WHERE id = $1 AND kind = 'email' AND expires_at > clock_timestamp()
               AND (SELECT count(*) FROM email_messages WHERE resource_id = $1) < $3`,
                [resourceId, JSON.stringify(message), EMAIL_MESSAGE_LIMIT],
            );
            if (!result.rowCount) throw new Error('Mail storage reservation lost.');
            return 'stored' as const;
        }).catch((error) => {
            if (error instanceof Error && error.message === 'account_storage_limit')
                return 'full' as const;
            throw error;
        });
    }
    async list(resourceId: string) {
        const result = await this.pool.query<{ message: EmailMessage }>(
            "SELECT message - 'attachmentBodies' AS message FROM email_messages WHERE resource_id = $1 ORDER BY sequence",
            [resourceId],
        );
        return result.rows.map((row) => row.message);
    }
    async threadMessages(resourceId: string) {
        const result = await this.pool.query<{ message: ThreadMessage }>(
            `SELECT jsonb_build_object('id', message->'id', 'receivedAt', message->'receivedAt',
                'from', message->'from', 'to', message->'to', 'cc', message->'cc',
                'subject', message->'subject', 'direction', message->'direction', 'messageId', message->'messageId',
                'inReplyTo', message->'inReplyTo', 'references', message->'references') AS message
             FROM email_messages WHERE resource_id = $1 ORDER BY sequence`,
            [resourceId],
        );
        return result.rows.map((row) => row.message);
    }
    async cursor(resourceId: string) {
        return (
            await this.pool.query(
                'SELECT COALESCE(max(sequence),0)::text AS cursor FROM email_messages WHERE resource_id=$1',
                [resourceId],
            )
        ).rows[0].cursor as string;
    }
    async count(resourceId: string) {
        const result = await this.pool.query<{ count: string }>(
            'SELECT count(*) FROM email_messages WHERE resource_id = $1',
            [resourceId],
        );
        return Number(result.rows[0]!.count);
    }
    async delete(resourceId: string) {
        await transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM resource_usage WHERE id=1 FOR UPDATE');
            const parent = await client.query(
                'SELECT id FROM temporary_resources WHERE id=$1 FOR UPDATE',
                [resourceId],
            );
            const rows = await client.query(
                'DELETE FROM email_messages WHERE resource_id=$1 RETURNING stored_bytes',
                [resourceId],
            );
            const bytes = rows.rows.reduce((sum, row) => sum + Number(row.stored_bytes), 0);
            if (parent.rowCount && bytes) {
                await client.query(
                    'UPDATE resource_usage SET stored_bytes=stored_bytes-$1 WHERE id=1',
                    [bytes],
                );
                await client.query(
                    'UPDATE temporary_resources SET stored_bytes=stored_bytes-$2 WHERE id=$1',
                    [resourceId, bytes],
                );
            }
        });
    }
    async replace(resourceId: string, id: string, message: EmailMessage) {
        await transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM resource_usage WHERE id=1 FOR UPDATE');
            const parent = await client.query(
                'SELECT id FROM temporary_resources WHERE id=$1 FOR UPDATE',
                [resourceId],
            );
            if (!parent.rowCount) return;
            const old = (
                await client.query(
                    "SELECT stored_bytes,message->'attachmentBodies' AS bodies FROM email_messages WHERE resource_id=$1 AND message->>'id'=$2",
                    [resourceId, id],
                )
            ).rows[0];
            if (!old) return;
            if (old.bodies)
                message = { ...message, attachmentBodies: old.bodies } as StoredEmailMessage;
            const bytes = Number(
                (await client.query('SELECT octet_length($1::jsonb::text) AS bytes', [message]))
                    .rows[0].bytes,
            );
            const delta = bytes - Number(old.stored_bytes);
            const reserved = await client.query(
                'UPDATE resource_usage SET stored_bytes=stored_bytes+$1 WHERE id=1 AND stored_bytes+$1 <= $2 RETURNING id',
                [delta, this.maxBytes],
            );
            if (!reserved.rowCount) throw new HttpError(429, 'Mail storage allowance reached.');
            await client.query(
                'UPDATE temporary_resources SET stored_bytes=stored_bytes+$2 WHERE id=$1',
                [resourceId, delta],
            );
            await client.query(
                "UPDATE email_messages SET message=$3,stored_bytes=$4 WHERE resource_id=$1 AND message->>'id'=$2",
                [resourceId, id, message, bytes],
            );
        });
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

const pause = (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => {});

interface EmailContext {
    app: FastifyInstance;
    access: Access;
    resources: ResourceRepository;
    messages: EmailMessageRepository;
    waiters: Waiters;
    mailDomain?: string;
    ingestSecret?: string;
    addresses: EmailAddressRepository;
    forwardSend?: ForwardSend;
    sendingEnabled?: boolean;
    feedback?: (input: Record<string, unknown>) => Promise<boolean>;
}

export function registerEmail({
    app,
    access,
    resources,
    messages,
    waiters,
    mailDomain,
    ingestSecret,
    addresses,
    forwardSend = (url, signal, options) => publicRequest(url, signal, { ...options, body: false }),
    sendingEnabled = false,
    feedback,
}: EmailContext) {
    const lifecycle = new EmailLifecycle(addresses, resources, access.identities, messages);
    const cleanup = setInterval(() => {
        void lifecycle
            .reconcile()
            .then(() => {
                if (messages instanceof MemoryEmailMessages) messages.cleanup();
            })
            .catch(() => app.log.error('Email lifecycle cleanup failed.'));
    }, 30000);
    cleanup.unref();
    app.addHook('onReady', () => lifecycle.reconcile());
    app.addHook('onClose', async () => {
        clearInterval(cleanup);
        await lifecycle.reconcile();
    });
    const configured = () => {
        if (!mailDomain) throw new HttpError(503, 'Email inboxes are not configured here yet.');
        return mailDomain;
    };
    const address = (id: string) => `${emailLocalPart(id)}@${configured()}`;
    async function owned(
        request: import('fastify').FastifyRequest,
        id: string,
        token = resourceToken(request),
    ) {
        const actor = await access.actor(request);
        return { ...(await resolveInbox(id, actor.identity?.account.id, token)), actor };
    }
    async function resolveInbox(id: string, ownerId?: string, token = '') {
        if (ownerId) await lifecycle.reconcile(ownerId);
        const inbox = await resources.read(id, 'email', token, ownerId);
        if (!inbox) throw new HttpError(404, 'Email inbox unavailable or access denied.');
        const row =
            typeof inbox.payload.address === 'string'
                ? await addresses.find(inbox.payload.address)
                : undefined;
        if (row?.retiredAt) throw new HttpError(404, 'Email inbox unavailable or access denied.');
        return { inbox, row };
    }

    app.post(
        '/api/email-inboxes',
        {
            onRequest: async (request) => {
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            const actor = await access.workspace(request, 'resources:write');
            const plan = entitlement(actor.identity, 'emailInbox', access.origin);
            configured();
            const query = (request.query ?? {}) as Record<string, unknown>;
            const body = request.body ?? {};
            if (typeof body !== 'object' || Array.isArray(body))
                throw new HttpError(400, 'Provide email inbox settings as an object.');
            const input = { ...query, ...body } as Record<string, unknown>;
            if (input.localPart !== undefined)
                entitlement(actor.identity, 'customEmailAddress', access.origin);
            const activeDays = Number(input.activeDays ?? 3);
            if (!Number.isInteger(activeDays) || activeDays < 1 || activeDays > 7)
                throw new HttpError(400, 'activeDays must be between 1 and 7.');
            if (input.ttlSeconds !== undefined || input.persistent !== undefined)
                throw new HttpError(
                    400,
                    'Email inboxes use activeDays (1–7) on Free and remain active while paid. Use activeDays instead of ttlSeconds or persistent.',
                );
            const ownerId = actor.identity!.account.id;
            await lifecycle.reconcile(ownerId);
            const permanent = plan === 'pro' || plan === 'team';
            const expiresAt = permanent
                ? null
                : new Date(Date.now() + activeDays * 86400000).toISOString();
            const local =
                input.localPart === undefined
                    ? emailLocalPart(randomUUID())
                    : customEmailLocalPart(input.localPart);
            const row = await addresses.claim(
                {
                    address: `${local}@${configured()}`,
                    ownerId,
                    tier: permanent ? 'paid' : 'free',
                    createdAt: new Date().toISOString(),
                    expiresAt,
                },
                plans[plan].emailInboxes,
            );
            try {
                const allocation = await access.allocation(request, { visibility: 'private' });
                const created = await resources.create(
                    'email',
                    { address: row.address },
                    undefined,
                    {
                        ...allocation,
                        expiresAt: expiresAt ?? PERMANENT_EMAIL_EXPIRY,
                        persistent: permanent,
                    },
                );
                if (!created)
                    throw new HttpError(503, 'Email inbox capacity reached. Try again later.');
                row.resourceId = created.id;
                await addresses.save(row);
                const { accessToken: _unused, ...credentials } = created;
                return reply.code(201).send({
                    ...credentials,
                    address: row.address,
                    expiresAt,
                    persistent: permanent,
                    status: 'active',
                });
            } catch (error) {
                await lifecycle.retire(row);
                throw error;
            }
        },
    );

    app.get<{ Params: { id: string } }>('/api/email-inboxes/:id', async (request) => {
        const { inbox, row } = await owned(request, request.params.id);
        return {
            id: inbox.id,
            address: inbox.payload.smtpCapture ? null : (row?.address ?? address(inbox.id)),
            expiresAt: row ? row.expiresAt : inbox.expiresAt,
            persistent: inbox.persistent,
            status: row?.pausedAt ? 'paused' : 'active',
            forwardingUrl: inbox.payload.forwardingUrl ?? null,
            lastForward: inbox.payload.lastForward ?? null,
            messageCount: await messages.count(inbox.id),
            messageLimit: EMAIL_MESSAGE_LIMIT,
            sendingEnabled: sendingEnabled && !inbox.payload.smtpCapture,
        };
    });

    app.get('/api/email-inboxes', async (request) => {
        const identity = await access.require(request, 'resources:read');
        await lifecycle.reconcile(identity.account.id);
        return {
            inboxes: (await addresses.list(identity.account.id))
                .filter((row) => row.resourceId)
                .map((row) => ({
                    id: row.resourceId,
                    address: row.address,
                    expiresAt: row.expiresAt,
                    persistent: row.tier === 'paid',
                    status: row.pausedAt ? 'paused' : 'active',
                })),
        };
    });

    app.get<{ Params: { id: string } }>('/api/email-inboxes/:id/rules', async (request) => {
        await access.require(request, 'resources:read');
        const { inbox } = await owned(request, request.params.id);
        return {
            rules: {
                ...emptyEmailRules,
                ...(inbox.payload.emailRules as Partial<EmailRules> | undefined),
            },
        };
    });
    app.put<{ Params: { id: string } }>('/api/email-inboxes/:id/rules', async (request) => {
        const human = await access.require(request, 'resources:write', true);
        if (!['owner', 'admin'].includes(human.role))
            throw new HttpError(403, 'Only workspace owners and admins can change inbox rules.');
        const { inbox, actor } = await owned(request, request.params.id);
        if (inbox.payload.smtpCapture)
            throw new HttpError(400, 'Address rules apply to email inboxes.');
        const rules = emailRules(request.body, inboxRuleLimits[actor.plan]);
        const result = await resources.update(
            inbox.id,
            'email',
            '',
            { emailRules: rules },
            human.account.id,
            true,
        );
        if (result === 'not-found') throw new HttpError(404, 'Email inbox unavailable.');
        if (result === 'full') throw new HttpError(409, 'Workspace storage is full.');
        return { rules };
    });
    type Page = { cursor?: string; limit?: string };
    const threads = async (id: string) => groupEmailThreads(await messages.threadMessages(id), id);
    app.get<{ Params: { id: string }; Querystring: Page }>(
        '/api/email-inboxes/:id/threads',
        async (request) => {
            await access.require(request, 'resources:read');
            const { inbox } = await owned(request, request.params.id);
            return pageEmailThreads(await threads(inbox.id), request.query);
        },
    );
    app.get<{ Querystring: Page }>('/api/email-threads', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        await lifecycle.reconcile(actor.identity.account.id);
        const inboxes = (await addresses.list(actor.identity.account.id)).filter(
            (row) => row.resourceId,
        );
        const all = [];
        for (const inbox of inboxes) all.push(...(await threads(inbox.resourceId!)));
        return pageEmailThreads(all, request.query);
    });
    app.get<{ Params: { id: string; threadId: string } }>(
        '/api/email-inboxes/:id/threads/:threadId',
        async (request) => {
            await access.require(request, 'resources:read');
            const { inbox } = await owned(request, request.params.id);
            const thread = groupEmailThreads(await messages.list(inbox.id), inbox.id).find(
                (item) => item.id === request.params.threadId,
            );
            if (!thread) throw new HttpError(404, 'Email thread unavailable.');
            return thread;
        },
    );
    app.put<{ Params: { id: string } }>('/api/email-inboxes/:id/forwarding', async (request) => {
        const caller = await access.workspace(request, 'resources:write');
        entitlement(caller.identity, 'webhookForwarding', access.origin);
        const { inbox, actor } = await owned(request, request.params.id);
        if (inbox.payload.smtpCapture)
            throw new HttpError(
                400,
                'SMTP capture does not forward mail. Read or wait for captured messages instead.',
            );
        const input = request.body as { url?: unknown } | null;
        let url: string | null = null;
        if (input?.url !== null) {
            if (typeof input?.url !== 'string' || input.url.length > 2048)
                throw new HttpError(
                    400,
                    'Provide a public webhook URL, or null to disable forwarding.',
                );
            try {
                url = publicUrl(input.url).href;
            } catch {
                throw new HttpError(400, 'Forwarding requires a public HTTP(S) webhook URL.');
            }
            if (new URL(url).hostname === new URL(access.origin).hostname)
                throw new HttpError(400, 'Forward to your own endpoint, not Kivel.');
        }
        await resources.update(
            inbox.id,
            'email',
            resourceToken(request),
            { forwardingUrl: url },
            actor.identity?.account.id,
            true,
        );
        return { forwardingUrl: url };
    });

    app.post<{ Params: { id: string } }>('/api/email-inboxes/:id/renew', async (request) => {
        const { inbox, row } = await owned(request, request.params.id);
        if (!row || row.tier === 'free')
            throw new HttpError(
                409,
                'Free inboxes cannot be extended. Upgrade before expiry to keep this address, or create a new inbox after it expires.',
            );
        if (row.pausedAt)
            throw new HttpError(402, 'Restore your paid subscription to reactivate this address.');
        return { id: inbox.id, expiresAt: null, persistent: true };
    });

    app.delete<{ Params: { id: string } }>(
        '/api/email-inboxes/:id/messages',
        async (request, reply) => {
            await access.scope(request, 'resources:write');
            const { inbox } = await owned(request, request.params.id);
            await messages.delete(inbox.id);
            return reply.code(204).send();
        },
    );
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
            let seen: string | undefined;
            for (;;) {
                const state = await owned(request, request.params.id);
                if (state.row?.pausedAt)
                    throw new HttpError(
                        409,
                        'This email address is paused. Restore your subscription to receive mail.',
                    );
                const cursor = await messages.cursor(inbox.id);
                if (cursor !== seen) {
                    seen = cursor;
                    const list = await messages.list(inbox.id);
                    const after = request.query.after;
                    const index = after ? list.findIndex((message) => message.id === after) : -1;
                    const fresh = list
                        .slice(index + 1)
                        .filter((message) => message.direction !== 'outbound');
                    if (fresh.length) return { timedOut: false, messages: fresh };
                }
                if (abort.signal.aborted || Date.now() + 500 > deadline)
                    return { timedOut: true, messages: [] };
                await pause(500, abort.signal);
            }
        });
    });

    app.delete<{ Params: { id: string } }>('/api/email-inboxes/:id', async (request, reply) => {
        const { actor, row } = await owned(request, request.params.id);
        if (row) {
            await lifecycle.retire(row);
            return reply.code(204).send();
        }
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
        const active = new Set<FastifyRequest>();
        ingest.addHook('onRequest', async (request, reply) => {
            const length = request.headers['content-length'];
            // Unknown lengths use the large lane, so chunked uploads cannot bypass its limit.
            const small =
                typeof length === 'string' && /^\d+$/.test(length) && Number(length) <= 256 * 1024;
            if (small) return;
            if (active.size >= 4)
                return reply
                    .header('Retry-After', '2')
                    .code(503)
                    .send({ error: 'Email ingestion is busy. Retry shortly.' });
            active.add(request);
        });
        ingest.addHook('onResponse', async (request) => {
            active.delete(request);
        });
        ingest.addHook('onRequestAbort', async (request) => {
            active.delete(request);
        });
        ingest.removeAllContentTypeParsers();
        ingest.addContentTypeParser(
            '*',
            { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 },
            (_r, body, done) => done(null, body),
        );
        ingest.post('/hooks/email', async (request, reply) => {
            if (!ingestSecret || !mailDomain)
                return reply.code(503).send({ error: 'Email ingest is not configured.' });
            const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
            if (
                !verifyIngest(
                    ingestSecret,
                    request.headers['x-kivel-timestamp'],
                    request.headers['x-kivel-signature'],
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
            if (input.rawSize !== undefined) {
                if (!Number.isSafeInteger(input.rawSize) || Number(input.rawSize) < 0)
                    throw new HttpError(400, 'rawSize must be a nonnegative integer.');
                if (Number(input.rawSize) > MESSAGE_ATTACHMENT_BYTES)
                    throw new HttpError(413, 'Message exceeds 5 MiB.');
            }
            if (feedback && (await feedback(input)))
                return reply.code(202).send({ received: true });
            const to = text(input.to, 320).toLowerCase();
            const [local, domain] = to.split('@');
            const row = domain === mailDomain ? await addresses.find(to) : undefined;
            if (row) await lifecycle.reconcile(row.ownerId);
            const current = row ? await addresses.find(to) : undefined;
            if (current?.retiredAt || current?.pausedAt)
                return reply.code(404).send({ error: 'Unknown address.' });
            const id =
                current?.resourceId ??
                (local && domain === mailDomain && !row ? emailInboxId(local) : undefined);
            if (!id) return reply.code(404).send({ error: 'Unknown address.' });
            const exists = await resources.peek(
                id,
                'email',
                current ? { ownerId: current.ownerId } : {},
            );
            if (!exists) return reply.code(404).send({ error: 'Unknown address.' });
            const from = typeof input.from === 'string' ? input.from : '';
            const mailFrom = typeof input.mailFrom === 'string' ? input.mailFrom : '';
            if (
                !inboundEmailAllowed(
                    from,
                    mailFrom,
                    exists.payload.emailRules as EmailRules | undefined,
                )
            )
                return reply.code(202).send({ stored: false });
            const subject = text(input.subject, 998);
            const body = text(input.text, TEXT_LIMIT);
            const html = text(input.html, TEXT_LIMIT);
            const attachmentInput = parseAttachments(input.attachments, Boolean(exists.ownerId));
            if (
                Buffer.byteLength(subject + body + html) +
                    attachmentInput.attachments.reduce((sum, file) => sum + file.size, 0) >
                MESSAGE_ATTACHMENT_BYTES
            )
                throw new HttpError(413, 'Message exceeds 5 MiB.');
            const message: EmailMessage = {
                id: crypto.randomUUID(),
                receivedAt: new Date().toISOString(),
                from: from.slice(0, 320),
                ...(typeof input.mailFrom === 'string' ? { mailFrom: mailFrom.slice(0, 320) } : {}),
                to,
                ...(Array.isArray(input.cc)
                    ? {
                          cc: input.cc
                              .filter(
                                  (value): value is string =>
                                      typeof value === 'string' && value.length <= 254,
                              )
                              .slice(0, 30),
                      }
                    : {}),
                subject,
                direction: 'inbound',
                ...(typeof input.messageId === 'string' &&
                /^<[^<>\s\x00-\x1f\x7f]{1,900}>$/.test(input.messageId)
                    ? { messageId: input.messageId }
                    : {}),
                ...(typeof input.inReplyTo === 'string' &&
                /^<[^<>\s\x00-\x1f\x7f]{1,900}>$/.test(input.inReplyTo)
                    ? { inReplyTo: input.inReplyTo }
                    : {}),
                ...(Array.isArray(input.references)
                    ? {
                          references: input.references
                              .filter(
                                  (value): value is string =>
                                      typeof value === 'string' &&
                                      /^<[^<>\s\x00-\x1f\x7f]{1,900}>$/.test(value),
                              )
                              .slice(-10),
                      }
                    : {}),
                text: body,
                ...(html ? { html } : {}),
                ...extractFromEmail(subject, body, html),
                attachments: attachmentInput.attachments,
            };
            const stored = await messages.record(id, message, attachmentInput.bodies);
            const owner = exists.ownerId
                ? await access.identities.account(exists.ownerId)
                : undefined;
            if (
                stored === 'stored' &&
                typeof exists.payload.forwardingUrl === 'string' &&
                owner &&
                ['pro', 'team'].includes(effectivePlan(owner))
            ) {
                let outcome: Record<string, unknown>;
                try {
                    const response = await forwardSend(
                        exists.payload.forwardingUrl,
                        AbortSignal.timeout(5000),
                        {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json',
                                'x-kivel-email-id': message.id,
                            },
                            requestBody: JSON.stringify({
                                type: 'email.received',
                                inboxId: id,
                                message,
                            }),
                        },
                    );
                    outcome = { status: response.status, at: new Date().toISOString() };
                } catch {
                    outcome = {
                        error: 'Webhook delivery failed. Read the message from this inbox; forwarding is not retried.',
                        at: new Date().toISOString(),
                    };
                }
                await resources.update(
                    id,
                    'email',
                    '',
                    { lastForward: outcome },
                    exists.ownerId,
                    true,
                );
            }
            return stored === 'stored'
                ? reply.code(202).send({ stored: true })
                : reply.code(429).send({ error: 'This inbox is full.' });
        });
    });
    return { owned, resolveInbox, lifecycle };
}
