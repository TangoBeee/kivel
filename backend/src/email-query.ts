import { createHash } from 'node:crypto';
import { HttpError } from './errors.js';
import type { EmailMessage } from './email.js';

export const emailFilterFields = [
    'from',
    'mailFrom',
    'subject',
    'text',
    'hasCode',
    'hasLink',
    'hasAttachment',
] as const;
const textFields = ['from', 'mailFrom', 'subject', 'text'] as const;
const booleanFields = ['hasCode', 'hasLink', 'hasAttachment'] as const;

export function emailQuery(
    inboxId: string,
    mode: 'search' | 'wait',
    query: Record<string, unknown>,
) {
    const filters: Partial<Record<(typeof emailFilterFields)[number], string>> = {};
    for (const field of emailFilterFields) {
        const value = query[field];
        if (value === undefined) continue;
        if (
            typeof value !== 'string' ||
            !value.trim() ||
            value.length > 254 ||
            (booleanFields.some((key) => key === field) && value !== 'true' && value !== 'false')
        )
            throw new HttpError(400, `Invalid email filter: ${field}.`);
        filters[field] = value.trim().toLowerCase();
    }
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new HttpError(400, 'Choose an email page size from 1 to 50.');
    const fingerprint = createHash('sha256')
        .update(JSON.stringify([inboxId, mode, filters]))
        .digest('base64url');
    const cursor = query.cursor;
    let after: string | undefined;
    if (cursor !== undefined) {
        if (typeof cursor !== 'string' || cursor.length > 90)
            throw new HttpError(400, 'Use the cursor returned for this inbox and these filters.');
        const parts = cursor.split('.');
        if (
            parts.length !== 2 ||
            !/^\d{1,19}$/.test(parts[0]!) ||
            parts[1] !== fingerprint ||
            BigInt(parts[0]!) > 9223372036854775807n
        )
            throw new HttpError(400, 'Use the cursor returned for this inbox and these filters.');
        after = parts[0];
    }
    function matches(message: EmailMessage) {
        const mailbox = (address: string) =>
            (/<([^<>]+)>$/.exec(address)?.[1] ?? address).trim().toLowerCase();
        return (
            textFields.every((key) => {
                const filter = filters[key];
                if (filter === undefined) return true;
                const value = message[key] ?? '';
                return key === 'from' || key === 'mailFrom'
                    ? mailbox(value) === filter
                    : value.toLowerCase().includes(filter);
            }) &&
            (filters.hasCode === undefined ||
                Boolean(message.codes?.length) === (filters.hasCode === 'true')) &&
            (filters.hasLink === undefined ||
                Boolean(message.links?.length) === (filters.hasLink === 'true')) &&
            (filters.hasAttachment === undefined ||
                Boolean(message.attachments?.length) === (filters.hasAttachment === 'true'))
        );
    }
    return { after, limit, cursor: (sequence: string) => `${sequence}.${fingerprint}`, matches };
}
