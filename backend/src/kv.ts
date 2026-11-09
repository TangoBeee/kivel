import { requireWorkspace } from './access.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { plans, type PlanId } from '@kivel.io/tools/plans';
import { checkLimit } from './errors.js';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import { transaction } from './database.js';

export const MAX_VALUE_BYTES = 256 * 1024;
const NAME = /^[A-Za-z0-9._:-]{1,64}$/;
const KEY = /^[A-Za-z0-9._:/-]{1,200}$/;

export interface MemoryEntry {
    namespace: string;
    key: string;
    value: unknown;
    bytes: number;
    updatedAt: string;
    expiresAt?: string;
}

type MaybePromise<T> = T | Promise<T>;
export interface MemoryRepository {
    set(accountId: string, entry: Omit<MemoryEntry, 'updatedAt'>, plan: PlanId): MaybePromise<void>;
    get(accountId: string, namespace: string, key: string): MaybePromise<MemoryEntry | undefined>;
    list(accountId: string, namespace: string, prefix: string): MaybePromise<MemoryEntry[]>;
    delete(accountId: string, namespace: string, key: string): MaybePromise<boolean>;
    usage(accountId: string): MaybePromise<number>;
    deleteExpired(): MaybePromise<void>;
}

const live = (entry: MemoryEntry) => !entry.expiresAt || Date.parse(entry.expiresAt) > Date.now();

export class MemoryKv implements MemoryRepository {
    private readonly entries = new Map<string, Map<string, MemoryEntry>>();
    private account(accountId: string) {
        let map = this.entries.get(accountId);
        if (!map) this.entries.set(accountId, (map = new Map()));
        return map;
    }
    set(accountId: string, entry: Omit<MemoryEntry, 'updatedAt'>, plan: PlanId) {
        const map = this.account(accountId);
        const id = `${entry.namespace}\u0000${entry.key}`;
        const previous = this.get(accountId, entry.namespace, entry.key)?.bytes ?? 0;
        checkLimit(plan, 'memory.bytes', this.usage(accountId), entry.bytes - previous);
        map.set(id, { ...entry, updatedAt: new Date().toISOString() });
    }
    get(accountId: string, namespace: string, key: string) {
        const entry = this.entries.get(accountId)?.get(`${namespace}\u0000${key}`);
        return entry && live(entry) ? entry : undefined;
    }
    list(accountId: string, namespace: string, prefix: string) {
        return [...(this.entries.get(accountId)?.values() ?? [])]
            .filter((entry) => entry.namespace === namespace && entry.key.startsWith(prefix))
            .filter(live)
            .sort((a, b) => a.key.localeCompare(b.key))
            .slice(0, 200);
    }
    delete(accountId: string, namespace: string, key: string) {
        return this.entries.get(accountId)?.delete(`${namespace}\u0000${key}`) ?? false;
    }
    usage(accountId: string) {
        let total = 0;
        for (const entry of this.entries.get(accountId)?.values() ?? [])
            if (live(entry)) total += entry.bytes;
        return total;
    }
    deleteExpired() {
        for (const map of this.entries.values())
            for (const [id, entry] of map) if (!live(entry)) map.delete(id);
    }
}

interface Row {
    namespace: string;
    key: string;
    value: unknown;
    bytes: number;
    updated_at: Date;
    expires_at: Date | null;
}
const fromRow = (row: Row): MemoryEntry => ({
    namespace: row.namespace,
    key: row.key,
    value: row.value,
    bytes: row.bytes,
    updatedAt: row.updated_at.toISOString(),
    ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
});
const unexpired = '(expires_at IS NULL OR expires_at > clock_timestamp())';

export class PostgresKv implements MemoryRepository {
    constructor(private readonly pool: Pool) {}
    set(accountId: string, entry: Omit<MemoryEntry, 'updatedAt'>, plan: PlanId) {
        return transaction(this.pool, async (client) => {
            // One writer per account at a time keeps the storage total exact.
            await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
            const { rows } = await client.query<{ total: string; previous: string }>(
                `SELECT COALESCE(sum(bytes), 0) AS total,
                        COALESCE(sum(bytes) FILTER (WHERE namespace = $2 AND key = $3), 0) AS previous
                 FROM kv_entries WHERE account_id = $1 AND ${unexpired} AND namespace NOT LIKE '$%'`,
                [accountId, entry.namespace, entry.key],
            );
            const { total, previous } = rows[0]!;
            checkLimit(plan, 'memory.bytes', Number(total), entry.bytes - Number(previous));
            await client.query(
                `INSERT INTO kv_entries (account_id, namespace, key, value, bytes, expires_at, updated_at)
                 VALUES ($1, $2, $3, $4::jsonb, $5, $6, clock_timestamp())
                 ON CONFLICT (account_id, namespace, key) DO UPDATE SET value = EXCLUDED.value,
                    bytes = EXCLUDED.bytes, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`,
                [
                    accountId,
                    entry.namespace,
                    entry.key,
                    JSON.stringify(entry.value),
                    entry.bytes,
                    entry.expiresAt ?? null,
                ],
            );
        });
    }
    async get(accountId: string, namespace: string, key: string) {
        const result = await this.pool.query<Row>(
            `SELECT * FROM kv_entries WHERE account_id = $1 AND namespace = $2 AND key = $3 AND ${unexpired}`,
            [accountId, namespace, key],
        );
        return result.rows[0] ? fromRow(result.rows[0]) : undefined;
    }
    async list(accountId: string, namespace: string, prefix: string) {
        const result = await this.pool.query<Row>(
            `SELECT * FROM kv_entries WHERE account_id = $1 AND namespace = $2 AND starts_with(key, $3)
             AND ${unexpired} ORDER BY key LIMIT 200`,
            [accountId, namespace, prefix],
        );
        return result.rows.map(fromRow);
    }
    async delete(accountId: string, namespace: string, key: string) {
        const result = await this.pool.query(
            'DELETE FROM kv_entries WHERE account_id = $1 AND namespace = $2 AND key = $3',
            [accountId, namespace, key],
        );
        return result.rowCount === 1;
    }
    async usage(accountId: string) {
        const result = await this.pool.query<{ total: string | null }>(
            `SELECT sum(bytes) AS total FROM kv_entries WHERE account_id = $1 AND ${unexpired} AND namespace NOT LIKE '$%'`,
            [accountId],
        );
        return Number(result.rows[0]!.total ?? 0);
    }
    async deleteExpired() {
        await this.pool.query('DELETE FROM kv_entries WHERE expires_at <= clock_timestamp()');
    }
}

/** Agent memory: small JSON values per workspace, grouped in namespaces. Needs an account. */
export function registerKv(app: FastifyInstance, access: Access, kv: MemoryRepository) {
    async function account(request: FastifyRequest, write: boolean) {
        const actor = await access.scope(request, write ? 'resources:write' : 'resources:read');
        requireWorkspace(actor);
        return { accountId: actor.identity.account.id, plan: actor.plan };
    }
    const names = (namespace: string, key?: string) => {
        if (!NAME.test(namespace))
            throw new HttpError(
                400,
                'Namespaces use 1-64 letters, digits, dots, colons, dashes or underscores.',
            );
        if (key !== undefined && !KEY.test(key))
            throw new HttpError(
                400,
                'Keys use 1-200 letters, digits, dots, colons, slashes, dashes or underscores.',
            );
    };
    type Route = { Params: { namespace: string; '*': string } };
    app.put<Route>('/api/memory/:namespace/*', async (request) => {
        const { accountId, plan } = await account(request, true);
        const key = request.params['*'];
        names(request.params.namespace, key);
        const body = request.body as { value?: unknown; ttlSeconds?: unknown } | undefined;
        if (!body || !Object.hasOwn(body, 'value'))
            throw new HttpError(400, 'Send {"value": …} with any JSON value.');
        const bytes = Buffer.byteLength(JSON.stringify(body.value));
        if (bytes > MAX_VALUE_BYTES) throw new HttpError(413, 'Values are limited to 256 KiB.');
        let expiresAt: string | undefined;
        if (body.ttlSeconds !== undefined) {
            const ttl = Number(body.ttlSeconds);
            if (!Number.isInteger(ttl) || ttl < 1 || ttl > 365 * 86400)
                throw new HttpError(400, 'ttlSeconds must be between 1 and 31,536,000.');
            expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        }
        await kv.set(
            accountId,
            {
                namespace: request.params.namespace,
                key,
                value: body.value,
                bytes,
                ...(expiresAt ? { expiresAt } : {}),
            },
            plan,
        );
        return {
            namespace: request.params.namespace,
            key,
            bytes,
            ...(expiresAt ? { expiresAt } : {}),
        };
    });
    app.get<Route>('/api/memory/:namespace/*', async (request) => {
        const { accountId } = await account(request, false);
        names(request.params.namespace, request.params['*']);
        const entry = await kv.get(accountId, request.params.namespace, request.params['*']);
        if (!entry) throw new HttpError(404, 'No value is stored under that key.');
        return entry;
    });
    app.get<{ Params: { namespace: string }; Querystring: { prefix?: string } }>(
        '/api/memory/:namespace',
        async (request) => {
            const { accountId, plan } = await account(request, false);
            names(request.params.namespace);
            const prefix = String(request.query.prefix ?? '').slice(0, 200);
            const entries = await kv.list(accountId, request.params.namespace, prefix);
            return {
                keys: entries.map(({ value: _value, ...meta }) => meta),
                usedBytes: await kv.usage(accountId),
                limitBytes: plans[plan].memoryBytes,
            };
        },
    );
    app.delete<Route>('/api/memory/:namespace/*', async (request, reply) => {
        const { accountId } = await account(request, true);
        names(request.params.namespace, request.params['*']);
        return (await kv.delete(accountId, request.params.namespace, request.params['*']))
            ? reply.code(204).send()
            : reply.code(404).send({ error: 'No value is stored under that key.' });
    });
}
