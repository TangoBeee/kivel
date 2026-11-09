import type { PlanId } from '@kivel.io/tools/plans';
import { checkLimit } from './errors.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from './database.js';
import { HttpError } from './access.js';

export interface EmailAddress {
    id: string;
    address: string;
    ownerId: string;
    resourceId: string | null;
    tier: 'free' | 'paid';
    createdAt: string;
    expiresAt: string | null;
    pausedAt: string | null;
    retiredAt: string | null;
}
type MaybePromise<T> = T | Promise<T>;
export interface EmailAddressRepository {
    claim(
        address: Omit<EmailAddress, 'id' | 'resourceId' | 'pausedAt' | 'retiredAt'>,
        plan: PlanId,
    ): MaybePromise<EmailAddress>;
    save(address: EmailAddress): MaybePromise<void>;
    list(ownerId?: string): MaybePromise<EmailAddress[]>;
    find(address: string): MaybePromise<EmailAddress | undefined>;
}
const taken = () =>
    new HttpError(
        409,
        'This address is unavailable. Choose another name; retired addresses are never reused.',
    );

export class MemoryEmailAddresses implements EmailAddressRepository {
    private rows = new Map<string, EmailAddress>();
    claim(input: Omit<EmailAddress, 'id' | 'resourceId' | 'pausedAt' | 'retiredAt'>, plan: PlanId) {
        if (this.rows.has(input.address)) throw taken();
        const count = this.list(input.ownerId).filter(
            (row) => !row.pausedAt && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()),
        ).length;
        checkLimit(plan, 'email.inboxes', count);
        const row: EmailAddress = {
            ...input,
            id: randomUUID(),
            resourceId: null,
            pausedAt: null,
            retiredAt: null,
        };
        this.rows.set(input.address, structuredClone(row));
        return row;
    }
    save(row: EmailAddress) {
        if (!this.rows.get(row.address)?.retiredAt)
            this.rows.set(row.address, structuredClone(row));
    }
    list(ownerId?: string) {
        return [...this.rows.values()]
            .filter((row) => !row.retiredAt && (!ownerId || row.ownerId === ownerId))
            .map((row) => structuredClone(row));
    }
    find(address: string) {
        const row = this.rows.get(address);
        return row && structuredClone(row);
    }
}

export class PostgresEmailAddresses implements EmailAddressRepository {
    constructor(private pool: Pool) {}
    async claim(
        input: Omit<EmailAddress, 'id' | 'resourceId' | 'pausedAt' | 'retiredAt'>,
        plan: PlanId,
    ) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 14))', [
                input.ownerId,
            ]);
            const count = await client.query(
                'SELECT count(*)::integer AS count FROM email_addresses WHERE owner_id = $1 AND retired_at IS NULL AND paused_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp())',
                [input.ownerId],
            );
            checkLimit(plan, 'email.inboxes', count.rows[0].count);
            const row: EmailAddress = {
                ...input,
                id: randomUUID(),
                resourceId: null,
                pausedAt: null,
                retiredAt: null,
            };
            const result = await client.query(
                'INSERT INTO email_addresses (id, address, owner_id, tier, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (address) DO NOTHING RETURNING id',
                [row.id, row.address, row.ownerId, row.tier, row.createdAt, row.expiresAt],
            );
            if (!result.rowCount) throw taken();
            return row;
        });
    }
    async save(row: EmailAddress) {
        await this.pool.query(
            'UPDATE email_addresses SET resource_id=$2, tier=$3, expires_at=$4, paused_at=$5, retired_at=$6 WHERE id=$1 AND retired_at IS NULL',
            [row.id, row.resourceId, row.tier, row.expiresAt, row.pausedAt, row.retiredAt],
        );
    }
    async list(ownerId?: string) {
        const result = await this.pool.query(
            'SELECT * FROM email_addresses WHERE retired_at IS NULL AND ($1::uuid IS NULL OR owner_id=$1)',
            [ownerId ?? null],
        );
        return result.rows.map(fromRow);
    }
    async find(address: string) {
        const result = await this.pool.query('SELECT * FROM email_addresses WHERE address=$1', [
            address,
        ]);
        return result.rows[0] && fromRow(result.rows[0]);
    }
}
function fromRow(row: Record<string, any>): EmailAddress {
    return {
        id: row.id,
        address: row.address,
        ownerId: row.owner_id,
        resourceId: row.resource_id,
        tier: row.tier,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at?.toISOString() ?? null,
        pausedAt: row.paused_at?.toISOString() ?? null,
        retiredAt: row.retired_at?.toISOString() ?? null,
    };
}

const reserved = new Set([
    'admin',
    'administrator',
    'postmaster',
    'abuse',
    'support',
    'security',
    'billing',
    'root',
    'hostmaster',
    'webmaster',
    'info',
    'contact',
    'noreply',
    'no-reply',
    'mailer-daemon',
    'unsubscribe',
    'dmarc',
    'socket',
    'kivel',
    'test',
    'help',
    'team',
    'sales',
    'listmaster',
    'mail',
    'bounces',
    'verify',
    'kivel',
]);
export function customEmailLocalPart(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(value) ||
        value.length < 3 ||
        reserved.has(value) ||
        value.includes('--') ||
        /^[a-z2-7]{26}$/.test(value)
    )
        throw new HttpError(
            400,
            'Choose 3–48 lowercase letters, numbers or single hyphens. Administrative and reserved names are unavailable.',
        );
    return value;
}
