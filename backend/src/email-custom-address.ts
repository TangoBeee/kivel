import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import type { Pool } from 'pg';
import { HttpError } from './errors.js';

export interface CustomEmailAddress {
    inboxId: string;
    ownerId: string;
    address: string;
    version: string;
    verifiedAt: string;
}

export class CustomEmailAddresses {
    private rows = new Map<string, CustomEmailAddress>();

    constructor(private pool?: Pool) {}

    async find(value: string, by: 'address' | 'inboxId' = 'address') {
        if (!this.pool)
            return by === 'inboxId'
                ? this.rows.get(value)
                : [...this.rows.values()].find((item) => item.address === value);
        const { rows } = await this.pool.query<CustomEmailAddress>(
            `SELECT inbox_id AS "inboxId",owner_id AS "ownerId",address,version,verified_at AS "verifiedAt"
             FROM email_custom_addresses WHERE ${by === 'address' ? 'address' : 'inbox_id'}=$1`,
            [value],
        );
        return rows[0];
    }

    async set(inboxId: string, ownerId: string, address: string, rotate = false) {
        const current = this.rows.get(inboxId);
        if (current && current.address !== address)
            throw new HttpError(
                409,
                'Remove the existing custom address before adding a different one.',
            );
        const version = current && !rotate ? current.version : randomUUID();
        const record = { inboxId, ownerId, address, version, verifiedAt: new Date().toISOString() };
        if (this.pool) {
            const { rows } = await this.pool
                .query<CustomEmailAddress>(
                    `INSERT INTO email_custom_addresses (inbox_id,owner_id,address,version,verified_at)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (inbox_id) DO UPDATE
                 SET version=CASE WHEN $6 THEN EXCLUDED.version ELSE email_custom_addresses.version END,
                     verified_at=EXCLUDED.verified_at
                 WHERE email_custom_addresses.address=EXCLUDED.address
                 RETURNING inbox_id AS "inboxId",owner_id AS "ownerId",address,version,verified_at AS "verifiedAt"`,
                    [inboxId, ownerId, address, version, record.verifiedAt, rotate],
                )
                .catch((error) => {
                    if (error.code === '23505' || error.code === '23503')
                        throw new HttpError(409, 'This custom address or inbox is unavailable.');
                    throw error;
                });
            if (!rows[0])
                throw new HttpError(409, 'This inbox already has a different custom address.');
            return rows[0];
        }
        if (
            [...this.rows.values()].some(
                (item) => item.address === address && item.inboxId !== inboxId,
            )
        )
            throw new HttpError(409, 'This custom address is unavailable.');
        this.rows.set(inboxId, record);
        return record;
    }

    async delete(inboxId: string) {
        if (this.pool)
            await this.pool.query('DELETE FROM email_custom_addresses WHERE inbox_id=$1', [
                inboxId,
            ]);
        else this.rows.delete(inboxId);
    }
}

export function customAddress(value: unknown, defaultDomain: string) {
    if (typeof value !== 'string' || value.length > 320)
        throw new HttpError(400, 'Enter an email address on a dedicated subdomain you control.');
    const [local, rawDomain, extra] = value.trim().toLowerCase().split('@');
    const domain =
        rawDomain && /^[\p{L}\p{N}.\p{M}-]+$/u.test(rawDomain) && domainToASCII(rawDomain);
    if (
        extra !== undefined ||
        !local ||
        !/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(local) ||
        local.includes('..') ||
        !domain ||
        domain.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
            domain,
        ) ||
        ['kivel.io', defaultDomain].some(
            (reserved) => domain === reserved || domain.endsWith('.' + reserved),
        ) ||
        local.length + domain.length + 1 > 254
    )
        throw new HttpError(400, 'Enter an email address on a dedicated subdomain you control.');
    return `${local}@${domain}`;
}

export const routeKey = (secret: string, record: CustomEmailAddress) =>
    createHmac('sha256', secret)
        .update(`email-custom-route:${record.inboxId}:${record.version}:${record.address}`)
        .digest('base64url');

export function ownershipRecord(secret: string, inboxId: string, address: string) {
    return {
        type: 'TXT' as const,
        name: `_kivel-mail.${address.split('@')[1]}`,
        value:
            'kivel=' +
            createHmac('sha256', secret)
                .update(`email-custom-ownership:${inboxId}:${address}`)
                .digest('base64url'),
    };
}

export async function checkCustomAddress(record: ReturnType<typeof ownershipRecord>) {
    const dns = new Resolver({ timeout: 1600, tries: 1 });
    const lookup = <T>(promise: Promise<T[]>): Promise<T[]> =>
        promise.catch((error) => {
            if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') return [];
            throw new HttpError(503, 'DNS is unavailable. Try again shortly.');
        });
    const [txt, mx] = await Promise.all([
        lookup(dns.resolveTxt(record.name)),
        lookup(dns.resolveMx(record.name.slice('_kivel-mail.'.length))),
    ]);
    return {
        ownership: txt.some((chunks) => chunks.join('') === record.value),
        routing:
            mx.length > 0 &&
            mx.every(({ exchange }) => /^route[123]\.mx\.cloudflare\.net\.?$/i.test(exchange)),
    };
}

export function routedMessageId(inboxId: string, raw: Buffer) {
    const bytes = createHash('sha256').update(inboxId).update(raw).digest().subarray(0, 16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
