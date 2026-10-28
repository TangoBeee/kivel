import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './database.js';
import { DELIVERY_LIMIT, INBOX_TTL_MS, resolveLimits } from './inboxes.js';
import type {
    CapturedRequest,
    CaptureResult,
    InboxRepository,
    InboxDelivery,
    InboxResponse,
    StoreLimits,
} from './inboxes.js';
import { RATE_WINDOW_MS } from './rate-limit.js';
import type { RateLimitRepository } from './rate-limit.js';
import { sharingCredentials, publicAccessAllowed, tokenHash } from './sharing.js';
import type { PublicAccess, Visibility } from './sharing.js';
import { ownsOrToken } from './allocations.js';
import type { AllocationContext } from './allocations.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest();

interface InboxRow {
    visibility: Visibility;
    access_token_hash: Buffer | null;
    access_version: string;
    id: string;
    token_hash: Buffer;
    expires_at: Date;
    request_count: number;
    stored_bytes: string;
    owner_id: string | null;
    quota_key: Buffer | null;
    created_at: Date;
    persistent: boolean;
    request_limit: number;
    byte_limit: string;
    response: InboxResponse | null;
    forward_url: string | null;
}

export class PostgresInboxStore implements InboxRepository {
    private readonly limits: Required<StoreLimits>;

    constructor(
        private readonly pool: Pool,
        private caps: StoreLimits = {},
        private requireAllocation = false,
    ) {
        this.limits = resolveLimits(caps);
    }

    async ping(): Promise<void> {
        await this.pool.query('SELECT 1');
    }

    private async expire(client: PoolClient): Promise<void> {
        const removed = await client.query<{ stored_bytes: string }>(
            'DELETE FROM inboxes WHERE expires_at <= clock_timestamp() RETURNING stored_bytes',
        );
        if (removed.rowCount) {
            const bytes = removed.rows.reduce((total, row) => total + Number(row.stored_bytes), 0);
            await client.query(
                'UPDATE platform_usage SET inbox_count = inbox_count - $1, stored_bytes = stored_bytes - $2 WHERE id = 1',
                [removed.rowCount, bytes],
            );
        }
    }

    private async mutate<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        return transaction(this.pool, async (client) => {
            // One shared lock keeps quotas consistent across application replicas.
            await client.query('SELECT id FROM platform_usage WHERE id = 1 FOR UPDATE');
            await this.expire(client);
            return operation(client);
        });
    }

    private async authorized(
        id: string,
        token: string,
        client: Pool | PoolClient = this.pool,
        ownerId?: string,
    ): Promise<InboxRow | undefined> {
        const result = UUID.test(id)
            ? await client.query<InboxRow>(
                  'SELECT * FROM inboxes WHERE id = $1 AND expires_at > clock_timestamp()',
                  [id],
              )
            : { rows: [] };
        const inbox = result.rows[0];
        return ownsOrToken(inbox?.owner_id ?? undefined, ownerId, () =>
            timingSafeEqual(hash(token), inbox?.token_hash ?? Buffer.alloc(32)),
        )
            ? inbox
            : undefined;
    }

    async has(id: string, access: PublicAccess = {}): Promise<boolean> {
        if (!UUID.test(id)) return false;
        const result = await this.pool.query(
            "SELECT id FROM inboxes WHERE id = $1 AND expires_at > clock_timestamp() AND (visibility = 'public' OR access_token_hash = $2 OR owner_id = $3::uuid)",
            [id, tokenHash(access.token ?? ''), access.ownerId ?? null],
        );
        return result.rowCount === 1;
    }

    async create(allocation?: AllocationContext) {
        if (this.requireAllocation && !allocation) throw new Error('A quota context is required.');
        return this.mutate(async (client) => {
            const usage = await client.query('SELECT inbox_count FROM platform_usage WHERE id = 1');
            if (usage.rows[0].inbox_count >= this.limits.maxInboxes) return null;
            const id = randomUUID();
            const inspectionToken = randomBytes(32).toString('base64url');
            const { accessToken, ...sharing } = sharingCredentials(allocation?.visibility);
            const result = await client.query<{ expires_at: Date }>(
                "INSERT INTO inboxes (id, token_hash, expires_at, owner_id, quota_key, persistent, request_limit, byte_limit, visibility, access_token_hash, access_version) VALUES ($1, $2, COALESCE($4::timestamptz, clock_timestamp() + $3 * INTERVAL '1 millisecond'), $5, $6, $7, $8, $9, $10, $11, $12) RETURNING expires_at",
                [
                    id,
                    hash(inspectionToken),
                    INBOX_TTL_MS,
                    allocation?.expiresAt ?? null,
                    allocation?.ownerId ?? null,
                    allocation ? Buffer.from(allocation.quotaKey, 'hex') : null,
                    allocation?.persistent ?? false,
                    Math.min(
                        allocation?.requestLimit ?? this.limits.maxRequestsPerInbox,
                        this.caps.maxRequestsPerInbox ?? Infinity,
                    ),
                    Math.min(
                        allocation?.byteLimit ?? this.limits.maxInboxBytes,
                        this.caps.maxInboxBytes ?? Infinity,
                    ),
                    sharing.visibility,
                    sharing.accessHash,
                    sharing.accessVersion,
                ],
            );
            await client.query(
                'UPDATE platform_usage SET inbox_count = inbox_count + 1 WHERE id = 1',
            );
            return {
                id,
                inspectionToken,
                expiresAt: result.rows[0]!.expires_at.toISOString(),
                visibility: sharing.visibility,
                accessVersion: sharing.accessVersion,
                ...(accessToken ? { accessToken } : {}),
            };
        });
    }

    async capture(
        id: string,
        input: Omit<CapturedRequest, 'id' | 'timestamp'>,
        access: PublicAccess = {},
    ): Promise<CaptureResult> {
        if (!UUID.test(id)) return { status: 'not-found' };
        return this.mutate(async (client) => {
            const result = await client.query<InboxRow>(
                'SELECT * FROM inboxes WHERE id = $1 AND expires_at > clock_timestamp()',
                [id],
            );
            const inbox = result.rows[0];
            if (
                !inbox ||
                !publicAccessAllowed(
                    inbox.visibility,
                    inbox.access_token_hash,
                    inbox.owner_id ?? undefined,
                    access,
                )
            )
                return { status: 'not-found' };
            const request: CapturedRequest = {
                ...input,
                id: randomUUID(),
                timestamp: new Date().toISOString(),
            };
            const record = JSON.stringify(request);
            const bytes = Buffer.byteLength(record);
            if (
                inbox.request_count >= inbox.request_limit ||
                Number(inbox.stored_bytes) + bytes > Number(inbox.byte_limit)
            ) {
                return { status: 'inbox-full' };
            }
            const usage = await client.query(
                'SELECT stored_bytes FROM platform_usage WHERE id = 1',
            );
            if (Number(usage.rows[0].stored_bytes) + bytes > this.limits.maxTotalBytes)
                return { status: 'storage-full' };
            await client.query(
                'INSERT INTO captured_requests (id, inbox_id, record, stored_bytes) VALUES ($1, $2, $3, $4)',
                [request.id, id, record, bytes],
            );
            await client.query(
                'UPDATE inboxes SET request_count = request_count + 1, stored_bytes = stored_bytes + $2 WHERE id = $1',
                [id, bytes],
            );
            await client.query(
                'UPDATE platform_usage SET stored_bytes = stored_bytes + $1 WHERE id = 1',
                [bytes],
            );
            return {
                status: 'captured',
                requestId: request.id,
                ...(inbox.response ? { response: inbox.response } : {}),
                ...(inbox.forward_url ? { forwardUrl: inbox.forward_url } : {}),
                ...(inbox.owner_id ? { ownerId: inbox.owner_id } : {}),
            };
        });
    }

    async info(id: string, token: string, ownerId?: string) {
        const inbox = await this.authorized(id, token, this.pool, ownerId);
        if (!inbox) return undefined;
        return {
            visibility: inbox.visibility,
            accessVersion: inbox.access_version,
            id: inbox.id,
            expiresAt: inbox.expires_at.toISOString(),
            requestCount: inbox.request_count,
            storedBytes: Number(inbox.stored_bytes),
            ...(inbox.quota_key
                ? {
                      createdAt: inbox.created_at.toISOString(),
                      persistent: inbox.persistent,
                      requestLimit: inbox.request_limit,
                      byteLimit: Number(inbox.byte_limit),
                  }
                : {}),
            ...(inbox.owner_id ? { ownerId: inbox.owner_id } : {}),
            ...(inbox.response ? { response: inbox.response } : {}),
            ...(inbox.forward_url ? { forwardUrl: inbox.forward_url } : {}),
        };
    }

    async setForward(id: string, token: string, url: string | null, ownerId?: string) {
        const inbox = await this.authorized(id, token, this.pool, ownerId);
        if (!inbox) return false;
        const result = await this.pool.query('UPDATE inboxes SET forward_url = $2 WHERE id = $1', [
            id,
            url,
        ]);
        return result.rowCount === 1;
    }

    async recordDelivery(id: string, delivery: InboxDelivery) {
        if (!UUID.test(id)) return;
        // Same trim as mock calls: the DELETE sees the table before this INSERT.
        await this.pool.query(
            `WITH added AS (
                INSERT INTO inbox_deliveries (inbox_id, delivery)
                SELECT id, $2::jsonb FROM inboxes WHERE id = $1
                RETURNING inbox_id
            )
            DELETE FROM inbox_deliveries WHERE inbox_id IN (SELECT inbox_id FROM added)
                AND sequence <= (
                    SELECT sequence FROM inbox_deliveries WHERE inbox_id = $1
                    ORDER BY sequence DESC OFFSET $3 LIMIT 1
                )`,
            [id, JSON.stringify(delivery), DELIVERY_LIMIT - 1],
        );
    }

    async listDeliveries(id: string, token: string, ownerId?: string) {
        const inbox = await this.authorized(id, token, this.pool, ownerId);
        if (!inbox) return undefined;
        const result = await this.pool.query<{ delivery: InboxDelivery }>(
            'SELECT delivery FROM inbox_deliveries WHERE inbox_id = $1 ORDER BY sequence',
            [id],
        );
        return result.rows.map((row) => row.delivery);
    }

    async setResponse(
        id: string,
        token: string,
        response: InboxResponse | null,
        ownerId?: string,
    ): Promise<boolean> {
        const inbox = await this.authorized(id, token, this.pool, ownerId);
        if (!inbox) return false;
        const result = await this.pool.query('UPDATE inboxes SET response = $2 WHERE id = $1', [
            id,
            response,
        ]);
        return result.rowCount === 1;
    }

    async listRequests(
        id: string,
        token: string,
        ownerId?: string,
    ): Promise<CapturedRequest[] | undefined> {
        const inbox = await this.authorized(id, token, this.pool, ownerId);
        if (!inbox) return undefined;
        const result = await this.pool.query<{ record: string }>(
            'SELECT record FROM captured_requests WHERE inbox_id = $1 ORDER BY sequence',
            [id],
        );
        return result.rows.map((row) => JSON.parse(row.record) as CapturedRequest);
    }

    async delete(id: string, token: string, ownerId?: string): Promise<boolean> {
        return this.mutate(async (client) => {
            const inbox = await this.authorized(id, token, client, ownerId);
            if (!inbox) return false;
            await client.query('DELETE FROM inboxes WHERE id = $1', [id]);
            await client.query(
                'UPDATE platform_usage SET inbox_count = inbox_count - 1, stored_bytes = stored_bytes - $1 WHERE id = 1',
                [inbox.stored_bytes],
            );
            return true;
        });
    }

    async deleteExpired(): Promise<void> {
        await this.mutate(async () => {});
    }
    async renew(
        id: string,
        token: string,
        expiresAt: string,
        ownerId?: string,
        persistent = false,
    ) {
        return this.mutate(async (client) => {
            const inbox = await this.authorized(id, token, client, ownerId);
            if (!inbox) return false;
            await client.query(
                'UPDATE inboxes SET expires_at = $1, persistent = $2 WHERE id = $3',
                [expiresAt, persistent, id],
            );
            return true;
        });
    }
    async setSharing(id: string, token: string, visibility: Visibility, ownerId?: string) {
        return this.mutate(async (client) => {
            const inbox = await this.authorized(id, token, client, ownerId);
            if (!inbox) return undefined;
            const { accessToken, ...sharing } = sharingCredentials(visibility);
            await client.query(
                'UPDATE inboxes SET visibility = $1, access_token_hash = $2, access_version = $3 WHERE id = $4',
                [visibility, sharing.accessHash, sharing.accessVersion, id],
            );
            return {
                visibility,
                accessVersion: sharing.accessVersion,
                ...(accessToken ? { accessToken } : {}),
            };
        });
    }
    async listOwned(ownerId: string) {
        if (!UUID.test(ownerId)) return [];
        const result = await this.pool.query<InboxRow>(
            'SELECT * FROM inboxes WHERE owner_id = $1 AND expires_at > clock_timestamp() ORDER BY created_at DESC',
            [ownerId],
        );
        return result.rows.map((row) => ({
            visibility: row.visibility,
            accessVersion: row.access_version,
            id: row.id,
            expiresAt: row.expires_at.toISOString(),
            requestCount: row.request_count,
            storedBytes: Number(row.stored_bytes),
            createdAt: row.created_at.toISOString(),
            persistent: row.persistent,
            ownerId: row.owner_id!,
            requestLimit: row.request_limit,
            byteLimit: Number(row.byte_limit),
        }));
    }
}

export class PostgresRateLimiter implements RateLimitRepository {
    constructor(private readonly pool: Pool) {}

    async deleteExpired(): Promise<void> {
        await this.pool.query('DELETE FROM rate_windows WHERE expires_at <= clock_timestamp()');
    }

    /**
     * One atomic upsert per request: no global lock, and no table-wide cap that a burst of new
     * clients could fill. Expired windows restart in place; periodic cleanup removes old rows.
     */
    async consume(key: string, limit: number, windowMs = RATE_WINDOW_MS): Promise<number> {
        const result = await this.pool.query(
            `INSERT INTO rate_windows (key_hash, count, expires_at)
             VALUES ($1, 1, clock_timestamp() + $2 * INTERVAL '1 millisecond')
             ON CONFLICT (key_hash) DO UPDATE SET
                 count = CASE WHEN rate_windows.expires_at <= clock_timestamp() THEN 1
                              ELSE rate_windows.count + 1 END,
                 expires_at = CASE WHEN rate_windows.expires_at <= clock_timestamp()
                                   THEN EXCLUDED.expires_at ELSE rate_windows.expires_at END
             RETURNING count, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp())) AS retry`,
            [hash(key), windowMs],
        );
        const row = result.rows[0];
        return row.count > limit ? Math.max(1, Number(row.retry)) : 0;
    }
}
