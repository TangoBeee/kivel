import { requireEmailInbox } from './access.js';
import {
    createHmac,
    timingSafeEqual,
    createCipheriv,
    createDecipheriv,
    hkdfSync,
    randomBytes,
} from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Access } from './access.js';
import { HttpError } from './errors.js';
import type { ResourceRepository } from './resources.js';
import type { EmailMessageRepository } from './email.js';
import { isUuid } from './security.js';

export const MESSAGE_ATTACHMENT_BYTES = 5 * 1048576;
export const INBOX_ATTACHMENT_BYTES = 25 * 1048576;
export interface AttachmentBody {
    id: string;
    base64: string;
}
export interface EmailAttachment {
    id?: string;
    filename: string;
    mimeType: string;
    size: number;
}
export function parseAttachments(input: unknown, owned: boolean) {
    if (input === undefined) return { attachments: [], bodies: [] };
    if (!Array.isArray(input) || input.length > 20)
        throw new HttpError(400, 'attachments must contain at most 20 files.');
    let total = 0;
    const bodies: AttachmentBody[] = [];
    const attachments: EmailAttachment[] = input.map((value) => {
        if (
            !value ||
            typeof value !== 'object' ||
            typeof value.filename !== 'string' ||
            typeof value.mimeType !== 'string' ||
            typeof value.size !== 'number' ||
            !Number.isSafeInteger(value.size) ||
            value.size < 0
        )
            throw new HttpError(
                400,
                'Each attachment needs filename, mimeType and a nonnegative integer size.',
            );
        let data: Buffer | undefined;
        if (value.base64 !== undefined) {
            if (
                typeof value.base64 !== 'string' ||
                value.base64.length > Math.ceil(MESSAGE_ATTACHMENT_BYTES / 3) * 4
            )
                throw new HttpError(413, 'Message attachments exceed 5 MiB.');
            data = Buffer.from(value.base64, 'base64');
            if (data.toString('base64') !== value.base64 || data.length !== value.size)
                throw new HttpError(400, 'Attachment Base64 and size must match.');
        }
        total += value.size;
        if (total > MESSAGE_ATTACHMENT_BYTES)
            throw new HttpError(413, 'Message attachments exceed 5 MiB.');
        const id = data && owned ? crypto.randomUUID() : undefined;
        if (id) bodies.push({ id, base64: data!.toString('base64') });
        return {
            ...(id ? { id } : {}),
            filename:
                value.filename
                    .replace(/[\x00-\x1f\x7f]/g, '')
                    .slice(0, 200)
                    .toWellFormed() || 'attachment',
            mimeType: value.mimeType
                .replace(/[\x00-\x1f\x7f]/g, '')
                .slice(0, 100)
                .toWellFormed(),
            size: value.size,
        };
    });
    return { attachments, bodies };
}
export function attachmentTicket(
    secret: string,
    ticket: string,
    inbox: string,
    message: string,
    attachment: string,
    expires: number,
) {
    return createHmac('sha256', secret)
        .update(`email-attachment-v2:${ticket}:${inbox}:${message}:${attachment}:${expires}`)
        .digest('base64url');
}
export function registerEmailAttachments(
    app: FastifyInstance,
    access: Access,
    resources: ResourceRepository,
    messages: EmailMessageRepository,
    secret: string,
    reconcile: (owner: string) => Promise<void>,
) {
    const ticketKey = Buffer.from(
        // The salt is the old name on purpose: changing it would make stored attachment owners unreadable.
        hkdfSync('sha256', secret, 'socket.help', 'email-attachment-owner-v2', 32),
    );
    interface Route {
        Params: { id: string; messageId: string; attachmentId: string };
        Querystring: { expires?: string; signature?: string; ticket?: string };
    }
    const valid = (params: Route['Params']) => {
        if (!Object.values(params).every(isUuid))
            throw new HttpError(404, 'Attachment unavailable or access denied.');
    };
    const metadataPath = '/api/email-inboxes/:id/messages/:messageId/attachments/:attachmentId';
    app.get<Route>(metadataPath, async (request) => {
        valid(request.params);
        const actor = await access.workspace(request, 'resources:read'),
            owner = actor.identity.account.id;
        const { id, messageId, attachmentId } = request.params;
        requireEmailInbox(actor.identity, id);
        await reconcile(owner);
        const inbox = await resources.read(id, 'email', '', owner);
        if (!inbox || inbox.ownerId !== owner)
            throw new HttpError(404, 'Attachment unavailable or access denied.');
        const attachment = await messages.attachment(id, messageId, attachmentId);
        if (!attachment) throw new HttpError(404, 'Attachment unavailable or access denied.');
        const expires = Math.floor(Date.now() / 1000) + 120;
        const nonce = randomBytes(12),
            cipher = createCipheriv('aes-256-gcm', ticketKey, nonce);
        cipher.setAAD(Buffer.from(`${id}:${messageId}:${attachmentId}:${expires}`));
        const ticket = Buffer.concat([
            nonce,
            cipher.update(owner),
            cipher.final(),
            cipher.getAuthTag(),
        ]).toString('base64url');
        const signature = attachmentTicket(secret, ticket, id, messageId, attachmentId, expires);
        const path = `/api/email-inboxes/${id}/messages/${messageId}/attachments/${attachmentId}/download`;
        return {
            filename: attachment.filename,
            size: attachment.bytes.length,
            expiresAt: new Date(expires * 1000).toISOString(),
            downloadUrl: `${access.origin}${path}?${new URLSearchParams({ expires: String(expires), ticket, signature })}`,
        };
    });
    app.get<Route>(`${metadataPath}/download`, async (request, reply) => {
        valid(request.params);
        const { expires: raw, signature = '', ticket = '' } = request.query,
            expires = Number(raw);
        const { id, messageId, attachmentId } = request.params;
        if (
            !/^[A-Za-z0-9_-]{86}$/.test(ticket) ||
            !Number.isSafeInteger(expires) ||
            expires <= Date.now() / 1000 ||
            expires > Date.now() / 1000 + 120 ||
            !/^[A-Za-z0-9_-]{43}$/.test(signature)
        )
            throw new HttpError(404, 'Attachment link expired or unavailable.');
        const expected = attachmentTicket(secret, ticket, id, messageId, attachmentId, expires);
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
            throw new HttpError(404, 'Attachment link expired or unavailable.');
        let owner: string;
        try {
            const bytes = Buffer.from(ticket, 'base64url'),
                decipher = createDecipheriv('aes-256-gcm', ticketKey, bytes.subarray(0, 12));
            decipher.setAAD(Buffer.from(`${id}:${messageId}:${attachmentId}:${expires}`));
            decipher.setAuthTag(bytes.subarray(-16));
            owner = Buffer.concat([
                decipher.update(bytes.subarray(12, -16)),
                decipher.final(),
            ]).toString('utf8');
            if (!isUuid(owner)) throw new Error();
        } catch {
            throw new HttpError(404, 'Attachment link expired or unavailable.');
        }
        await reconcile(owner);
        const inbox = await resources.read(id, 'email', '', owner);
        if (!inbox || inbox.ownerId !== owner)
            throw new HttpError(404, 'Attachment link expired or unavailable.');
        const attachment = await messages.attachment(id, messageId, attachmentId);
        if (!attachment) throw new HttpError(404, 'Attachment link expired or unavailable.');
        return reply
            .type('application/octet-stream')
            .header(
                'Content-Disposition',
                `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(attachment.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
            )
            .header('X-Content-Type-Options', 'nosniff')
            .header(
                'Content-Security-Policy',
                "default-src 'none'; sandbox; frame-ancestors 'none'",
            )
            .header('Cache-Control', 'no-store')
            .header('Referrer-Policy', 'no-referrer')
            .send(attachment.bytes);
    });
}
