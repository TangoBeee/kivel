import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './database.js';
import { sharingCredentials, publicAccessAllowed, tokenHash } from './sharing.js';
import type { PublicAccess, Sharing, SharingCredentials, Visibility } from './sharing.js';
import { MemoryAllocations, ownsOrToken } from './allocations.js';
import type { AllocationContext } from './allocations.js';

export const RESOURCE_TTL_MS = 60 * 60 * 1000;
export const MAX_RESOURCES = 500;
export const MAX_RESOURCE_BYTES = 128 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export type ResourceKind = 'mock' | 'file' | 'mcp' | 'email' | 'status' | 'job';
export type MockAccess = PublicAccess & { managementToken?: string };
export interface Resource extends Sharing {
    id: string;
    kind: ResourceKind;
    payload: Record<string, unknown>;
    data: Buffer;
    expiresAt: string;
    uses: number;
    storedBytes: number;
    createdAt: string;
    persistent: boolean;
    ownerId?: string;
    maxUses?: number;
}
export type ResourceInfo = Omit<Resource, 'data'>;
export interface ResourceCredentials extends SharingCredentials {
    id: string;
    managementToken: string;
    expiresAt: string;
}
type MaybePromise<T> = T | Promise<T>;
export interface ResourceRepository {
    create(
        kind: ResourceKind,
        payload: Record<string, unknown>,
        data?: Buffer,
        allocation?: AllocationContext,
    ): MaybePromise<ResourceCredentials | null>;
    read(
        id: string,
        kind: ResourceKind,
        token: string,
        ownerId?: string,
    ): MaybePromise<ResourceInfo | undefined>;
    peek(
        id: string,
        kind: ResourceKind,
        access?: PublicAccess,
    ): MaybePromise<ResourceInfo | undefined>;
    use(
        id: string,
        kind: ResourceKind,
        maxUses?: number,
        access?: PublicAccess,
    ): MaybePromise<Resource | undefined>;
    update(
        id: string,
        kind: ResourceKind,
        token: string,
        payload: Record<string, unknown>,
        ownerId?: string,
    ): MaybePromise<'updated' | 'not-found' | 'full'>;
    mutateMock<T>(
        id: string,
        access: MockAccess,
        operation: (payload: Record<string, unknown>) => {
            payload: Record<string, unknown>;
            result: T;
        },
    ): MaybePromise<T | 'full' | undefined>;
    delete(id: string, kind: ResourceKind, token: string, ownerId?: string): MaybePromise<boolean>;
    renew(
        id: string,
        kind: ResourceKind,
        token: string,
        expiresAt: string,
        ownerId?: string,
        persistent?: boolean,
    ): MaybePromise<boolean>;
    setSharing(
        id: string,
        kind: ResourceKind,
        token: string,
        visibility: Visibility,
        ownerId?: string,
    ): MaybePromise<SharingCredentials | undefined>;
    listOwned(ownerId: string): MaybePromise<ResourceInfo[]>;
    deleteExpired(): MaybePromise<void>;
    ping(): MaybePromise<void>;
}
const hash = (token: string) => createHash('sha256').update(token).digest();
const matches = (token: string, stored: Buffer) => timingSafeEqual(hash(token), stored);
const size = (payload: Record<string, unknown>, data: Buffer) =>
    Buffer.byteLength(JSON.stringify(payload)) + data.length + 512;
const validId = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
interface Stored extends Resource {
    tokenHash: Buffer;
    accessHash: Buffer | null;
    allocation?: AllocationContext;
}
const copy = ({
    tokenHash: _,
    allocation: __,
    accessHash: ___,
    ...resource
}: Stored): Resource => ({
    ...resource,
    payload: structuredClone(resource.payload),
    data: Buffer.from(resource.data),
});

export class ResourceStore implements ResourceRepository {
    private resources = new Map<string, Stored>();
    constructor(
        private now = Date.now,
        private maxBytes = MAX_RESOURCE_BYTES,
        private maxResources = MAX_RESOURCES,
        private allocations?: MemoryAllocations,
    ) {}
    ping() {}
    deleteExpired() {
        for (const [id, resource] of this.resources)
            if (Date.parse(resource.expiresAt) <= this.now()) this.remove(resource);
    }
    create(
        kind: ResourceKind,
        payload: Record<string, unknown>,
        data = Buffer.alloc(0),
        allocation?: AllocationContext,
    ): ResourceCredentials | null {
        this.deleteExpired();
        const storedBytes = size(payload, data);
        if (
            this.resources.size >= this.maxResources ||
            [...this.resources.values()].reduce((sum, item) => sum + item.storedBytes, 0) +
                storedBytes >
                this.maxBytes
        )
            return null;
        const id = randomUUID(),
            managementToken = randomBytes(32).toString('base64url');
        const expiresAt =
            allocation?.expiresAt ?? new Date(this.now() + RESOURCE_TTL_MS).toISOString();
        this.allocations?.reserve(allocation, 1, storedBytes);
        const { accessToken, ...sharing } = sharingCredentials(allocation?.visibility);
        this.resources.set(id, {
            ...sharing,
            id,
            kind,
            payload: structuredClone(payload),
            data: Buffer.from(data),
            expiresAt,
            uses: 0,
            storedBytes,
            tokenHash: hash(managementToken),
            createdAt: new Date(this.now()).toISOString(),
            persistent: allocation?.persistent ?? false,
            ...(allocation ? { allocation } : {}),
            ...(allocation?.ownerId ? { ownerId: allocation.ownerId } : {}),
            ...(kind === 'file' ? { maxUses: allocation?.maxUses ?? 100 } : {}),
        });
        return {
            id,
            managementToken,
            expiresAt,
            visibility: sharing.visibility,
            accessVersion: sharing.accessVersion,
            ...(accessToken ? { accessToken } : {}),
        };
    }
    private get(id: string, kind: ResourceKind) {
        this.deleteExpired();
        const resource = this.resources.get(id);
        return resource?.kind === kind ? resource : undefined;
    }
    read(id: string, kind: ResourceKind, token: string, ownerId?: string) {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !ownsOrToken(resource.ownerId, ownerId, () => matches(token, resource.tokenHash))
        )
            return undefined;
        const { data: _, tokenHash: __, allocation: ___, accessHash: ____, ...info } = resource;
        return { ...info, payload: structuredClone(info.payload) };
    }
    peek(id: string, kind: ResourceKind, access: PublicAccess = {}) {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !publicAccessAllowed(
                resource.visibility,
                resource.accessHash,
                resource.ownerId,
                access,
            ) ||
            resource.uses >= (resource.maxUses ?? Number.MAX_SAFE_INTEGER)
        )
            return undefined;
        const { data: _, tokenHash: __, accessHash: ___, allocation: ____, ...info } = resource;
        return { ...info, payload: structuredClone(info.payload) };
    }
    use(
        id: string,
        kind: ResourceKind,
        maxUses = Number.MAX_SAFE_INTEGER,
        access: PublicAccess = {},
    ) {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !publicAccessAllowed(
                resource.visibility,
                resource.accessHash,
                resource.ownerId,
                access,
            ) ||
            resource.uses >= Math.min(maxUses, resource.maxUses ?? Number.MAX_SAFE_INTEGER)
        )
            return undefined;
        resource.uses++;
        const result = copy(resource);
        if (kind === 'file' && resource.uses >= (resource.maxUses ?? Number.MAX_SAFE_INTEGER)) {
            const bytes = resource.data.length;
            resource.data = Buffer.alloc(0);
            resource.storedBytes -= bytes;
            this.allocations?.reserve(resource.allocation, 0, -bytes);
        }
        return result;
    }
    emailExists(id: string) {
        return Boolean(this.get(id, 'email'));
    }
    adjustEmailBytes(id: string, delta: number) {
        const resource = this.get(id, 'email');
        if (
            !resource ||
            [...this.resources.values()].reduce((sum, item) => sum + item.storedBytes, 0) + delta >
                this.maxBytes
        )
            return false;
        this.allocations?.reserve(resource.allocation, 0, delta);
        resource.storedBytes += delta;
        return true;
    }
    update(
        id: string,
        kind: ResourceKind,
        token: string,
        payload: Record<string, unknown>,
        ownerId?: string,
    ): 'updated' | 'not-found' | 'full' {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !ownsOrToken(resource.ownerId, ownerId, () => matches(token, resource.tokenHash))
        )
            return 'not-found';
        const storedBytes =
            size(payload, resource.data) +
            resource.storedBytes -
            size(resource.payload, resource.data);
        if (
            [...this.resources.values()].reduce((sum, item) => sum + item.storedBytes, 0) -
                resource.storedBytes +
                storedBytes >
            this.maxBytes
        )
            return 'full';
        this.allocations?.reserve(resource.allocation, 0, storedBytes - resource.storedBytes);
        resource.payload = structuredClone(payload);
        resource.storedBytes = storedBytes;
        return 'updated';
    }
    mutateMock<T>(
        id: string,
        access: MockAccess,
        operation: (payload: Record<string, unknown>) => {
            payload: Record<string, unknown>;
            result: T;
        },
    ): T | 'full' | undefined {
        const resource = this.get(id, 'mock');
        if (
            !resource ||
            !(access.managementToken !== undefined
                ? ownsOrToken(resource.ownerId, access.ownerId, () =>
                      matches(access.managementToken!, resource.tokenHash),
                  )
                : publicAccessAllowed(
                      resource.visibility,
                      resource.accessHash,
                      resource.ownerId,
                      access,
                  ))
        )
            return undefined;
        const next = operation(structuredClone(resource.payload)),
            storedBytes = size(next.payload, resource.data);
        if (
            [...this.resources.values()].reduce((sum, item) => sum + item.storedBytes, 0) -
                resource.storedBytes +
                storedBytes >
            this.maxBytes
        )
            return 'full';
        this.allocations?.reserve(resource.allocation, 0, storedBytes - resource.storedBytes);
        resource.payload = structuredClone(next.payload);
        resource.storedBytes = storedBytes;
        resource.uses++;
        return next.result;
    }
    private remove(resource: Stored) {
        this.allocations?.release(resource.allocation, resource.storedBytes);
        return this.resources.delete(resource.id);
    }
    delete(id: string, kind: ResourceKind, token: string, ownerId?: string) {
        const resource = this.get(id, kind);
        return (
            !!resource &&
            ownsOrToken(resource.ownerId, ownerId, () => matches(token, resource.tokenHash)) &&
            this.remove(resource)
        );
    }
    renew(
        id: string,
        kind: ResourceKind,
        token: string,
        expiresAt: string,
        ownerId?: string,
        persistent = false,
    ) {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !ownsOrToken(resource.ownerId, ownerId, () => matches(token, resource.tokenHash))
        )
            return false;
        resource.expiresAt = expiresAt;
        resource.persistent = persistent;
        return true;
    }
    setSharing(
        id: string,
        kind: ResourceKind,
        token: string,
        visibility: Visibility,
        ownerId?: string,
    ) {
        const resource = this.get(id, kind);
        if (
            !resource ||
            !ownsOrToken(resource.ownerId, ownerId, () => matches(token, resource.tokenHash))
        )
            return undefined;
        const { accessToken, ...sharing } = sharingCredentials(visibility);
        Object.assign(resource, sharing);
        return {
            visibility,
            accessVersion: sharing.accessVersion,
            ...(accessToken ? { accessToken } : {}),
        };
    }
    listOwned(ownerId: string) {
        this.deleteExpired();
        return [...this.resources.values()]
            .filter((resource) => resource.ownerId === ownerId)
            .map((resource) => this.read(resource.id, resource.kind, '', ownerId)!);
    }
}

interface ResourceRow {
    id: string;
    kind: ResourceKind;
    payload: string;
    data: Buffer;
    token_hash: Buffer;
    visibility: Visibility;
    access_token_hash: Buffer | null;
    access_version: string;
    expires_at: Date;
    uses: string;
    stored_bytes: string;
    owner_id: string | null;
    quota_key: Buffer | null;
    created_at: Date;
    persistent: boolean;
    use_limit: string | null;
}
function fromRow(row: ResourceRow): Resource {
    return {
        visibility: row.visibility,
        accessVersion: row.access_version,
        id: row.id,
        kind: row.kind,
        payload: JSON.parse(row.payload),
        data: row.data,
        expiresAt: new Date(row.expires_at).toISOString(),
        uses: Number(row.uses),
        storedBytes: Number(row.stored_bytes),
        createdAt: new Date(row.created_at).toISOString(),
        persistent: row.persistent,
        ...(row.owner_id ? { ownerId: row.owner_id } : {}),
        ...(row.use_limit !== null ? { maxUses: Number(row.use_limit) } : {}),
    };
}
async function reclaim(client: PoolClient) {
    await client.query('SELECT id FROM resource_usage WHERE id = 1 FOR UPDATE');
    await client.query(`WITH removed AS (DELETE FROM temporary_resources WHERE expires_at <= clock_timestamp() RETURNING stored_bytes)
        UPDATE resource_usage SET resource_count = resource_count - (SELECT count(*) FROM removed), stored_bytes = stored_bytes - COALESCE((SELECT sum(stored_bytes) FROM removed), 0) WHERE id = 1`);
}
export class PostgresResourceStore implements ResourceRepository {
    constructor(
        private pool: Pool,
        private maxBytes = MAX_RESOURCE_BYTES,
        private maxResources = MAX_RESOURCES,
        private requireAllocation = false,
    ) {}
    async ping() {
        await this.pool.query('SELECT 1');
    }
    async deleteExpired() {
        await transaction(this.pool, reclaim);
    }
    async create(
        kind: ResourceKind,
        payload: Record<string, unknown>,
        data = Buffer.alloc(0),
        allocation?: AllocationContext,
    ): Promise<ResourceCredentials | null> {
        if (this.requireAllocation && !allocation) throw new Error('A quota context is required.');
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const storedBytes = size(payload, data);
            const budget = await client.query(
                'UPDATE resource_usage SET resource_count = resource_count + 1, stored_bytes = stored_bytes + $1 WHERE id = 1 AND resource_count < $2 AND stored_bytes + $1 <= $3 RETURNING id',
                [storedBytes, this.maxResources, this.maxBytes],
            );
            if (!budget.rowCount) return null;
            const id = randomUUID(),
                managementToken = randomBytes(32).toString('base64url');
            const { accessToken, ...sharing } = sharingCredentials(allocation?.visibility);
            const result = await client.query(
                "INSERT INTO temporary_resources (id, kind, token_hash, payload, data, stored_bytes, expires_at, owner_id, quota_key, persistent, use_limit, visibility, access_token_hash, access_version) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($8::timestamptz, clock_timestamp() + $7::integer * interval '1 millisecond'), $9, $10, $11, $12, $13, $14, $15) RETURNING expires_at",
                [
                    id,
                    kind,
                    hash(managementToken),
                    JSON.stringify(payload),
                    data,
                    storedBytes,
                    RESOURCE_TTL_MS,
                    allocation?.expiresAt ?? null,
                    allocation?.ownerId ?? null,
                    allocation ? Buffer.from(allocation.quotaKey, 'hex') : null,
                    allocation?.persistent ?? false,
                    kind === 'file' ? (allocation?.maxUses ?? 100) : null,
                    sharing.visibility,
                    sharing.accessHash,
                    sharing.accessVersion,
                ],
            );
            return {
                id,
                managementToken,
                expiresAt: result.rows[0].expires_at.toISOString(),
                visibility: sharing.visibility,
                accessVersion: sharing.accessVersion,
                ...(accessToken ? { accessToken } : {}),
            };
        });
    }
    async read(id: string, kind: ResourceKind, token: string, ownerId?: string) {
        if (!validId(id)) return undefined;
        const result = await this.pool.query<ResourceRow>(
            "SELECT id, kind, token_hash, payload, ''::bytea AS data, expires_at, uses, stored_bytes, owner_id, quota_key, created_at, persistent, use_limit, visibility, access_token_hash, access_version FROM temporary_resources WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp()",
            [id, kind],
        );
        const row = result.rows[0];
        if (
            !row ||
            !ownsOrToken(row.owner_id ?? undefined, ownerId, () => matches(token, row.token_hash))
        )
            return undefined;
        const { data: _, ...info } = fromRow(row);
        return info;
    }
    async peek(id: string, kind: ResourceKind, access: PublicAccess = {}) {
        if (!validId(id)) return undefined;
        const result = await this.pool.query<ResourceRow>(
            "SELECT id, kind, token_hash, payload, ''::bytea AS data, expires_at, uses, stored_bytes, owner_id, quota_key, created_at, persistent, use_limit, visibility, access_token_hash, access_version FROM temporary_resources WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp() AND uses < COALESCE(use_limit, 9007199254740991) AND (visibility = 'public' OR access_token_hash = $3 OR owner_id = $4::uuid)",
            [id, kind, tokenHash(access.token ?? ''), access.ownerId ?? null],
        );
        if (!result.rows[0]) return undefined;
        const { data: _, ...info } = fromRow(result.rows[0]);
        return info;
    }
    async use(
        id: string,
        kind: ResourceKind,
        maxUses = Number.MAX_SAFE_INTEGER,
        access: PublicAccess = {},
    ) {
        if (!validId(id)) return undefined;
        const execute = async (client: Pool | PoolClient) => {
            const result = await client.query(
                "UPDATE temporary_resources SET uses = uses + 1 WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp() AND uses < LEAST($3, COALESCE(use_limit, $3)) AND (visibility = 'public' OR access_token_hash = $4 OR owner_id = $5::uuid) RETURNING *",
                [id, kind, maxUses, tokenHash(access.token ?? ''), access.ownerId ?? null],
            );
            const row = result.rows[0];
            if (!row) return undefined;
            if (
                kind === 'file' &&
                row.use_limit !== null &&
                Number(row.uses) >= Number(row.use_limit)
            ) {
                await client.query(
                    'UPDATE resource_usage SET stored_bytes = stored_bytes - $1 WHERE id = 1',
                    [row.data.length],
                );
                await client.query(
                    "UPDATE temporary_resources SET data = ''::bytea, stored_bytes = stored_bytes - octet_length(data) WHERE id = $1",
                    [id],
                );
            }
            return fromRow(row);
        };
        return kind === 'file'
            ? transaction(this.pool, async (client) => {
                  await reclaim(client);
                  return execute(client);
              })
            : execute(this.pool);
    }

    async update(
        id: string,
        kind: ResourceKind,
        token: string,
        payload: Record<string, unknown>,
        ownerId?: string,
    ): Promise<'updated' | 'not-found' | 'full'> {
        if (!validId(id)) return 'not-found';
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const result = await client.query(
                'SELECT * FROM temporary_resources WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp() FOR UPDATE',
                [id, kind],
            );
            const row = result.rows[0];
            if (
                !row ||
                !ownsOrToken(row.owner_id ?? undefined, ownerId, () =>
                    matches(token, row.token_hash),
                )
            )
                return 'not-found';
            const storedBytes =
                size(payload, row.data) +
                Number(row.stored_bytes) -
                size(JSON.parse(row.payload), row.data);
            const budget = await client.query(
                'UPDATE resource_usage SET stored_bytes = stored_bytes + $1 WHERE id = 1 AND stored_bytes + $1 <= $2 RETURNING id',
                [storedBytes - Number(row.stored_bytes), this.maxBytes],
            );
            if (!budget.rowCount) return 'full';
            await client.query(
                'UPDATE temporary_resources SET payload = $1, stored_bytes = $2 WHERE id = $3',
                [JSON.stringify(payload), storedBytes, id],
            );
            return 'updated';
        });
    }
    async mutateMock<T>(
        id: string,
        access: MockAccess,
        operation: (payload: Record<string, unknown>) => {
            payload: Record<string, unknown>;
            result: T;
        },
    ): Promise<T | 'full' | undefined> {
        if (!validId(id)) return undefined;
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const row = (
                await client.query<ResourceRow>(
                    "SELECT * FROM temporary_resources WHERE id = $1 AND kind = 'mock' AND expires_at > clock_timestamp() FOR UPDATE",
                    [id],
                )
            ).rows[0];
            if (
                !row ||
                !(access.managementToken !== undefined
                    ? ownsOrToken(row.owner_id ?? undefined, access.ownerId, () =>
                          matches(access.managementToken!, row.token_hash),
                      )
                    : publicAccessAllowed(
                          row.visibility,
                          row.access_token_hash,
                          row.owner_id ?? undefined,
                          access,
                      ))
            )
                return undefined;
            const next = operation(JSON.parse(row.payload)),
                storedBytes = size(next.payload, row.data);
            const budget = await client.query(
                'UPDATE resource_usage SET stored_bytes = stored_bytes + $1 WHERE id = 1 AND stored_bytes + $1 <= $2 RETURNING id',
                [storedBytes - Number(row.stored_bytes), this.maxBytes],
            );
            if (!budget.rowCount) return 'full';
            await client.query(
                'UPDATE temporary_resources SET payload = $1, stored_bytes = $2, uses = uses + 1 WHERE id = $3',
                [JSON.stringify(next.payload), storedBytes, id],
            );
            return next.result;
        });
    }
    async delete(id: string, kind: ResourceKind, token: string, ownerId?: string) {
        if (!validId(id)) return false;
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const result = await client.query(
                'SELECT * FROM temporary_resources WHERE id = $1 AND kind = $2 FOR UPDATE',
                [id, kind],
            );
            const row = result.rows[0];
            if (
                !row ||
                !ownsOrToken(row.owner_id ?? undefined, ownerId, () =>
                    matches(token, row.token_hash),
                )
            )
                return false;
            await client.query('DELETE FROM temporary_resources WHERE id = $1', [id]);
            await client.query(
                'UPDATE resource_usage SET resource_count = resource_count - 1, stored_bytes = stored_bytes - $1 WHERE id = 1',
                [row.stored_bytes],
            );
            return true;
        });
    }
    async renew(
        id: string,
        kind: ResourceKind,
        token: string,
        expiresAt: string,
        ownerId?: string,
        persistent = false,
    ) {
        if (!validId(id)) return false;
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const row = (
                await client.query(
                    'SELECT * FROM temporary_resources WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp() FOR UPDATE',
                    [id, kind],
                )
            ).rows[0];
            if (
                !row ||
                !ownsOrToken(row.owner_id ?? undefined, ownerId, () =>
                    matches(token, row.token_hash),
                )
            )
                return false;
            await client.query(
                'UPDATE temporary_resources SET expires_at = $1, persistent = $2 WHERE id = $3',
                [expiresAt, persistent, id],
            );
            return true;
        });
    }
    async setSharing(
        id: string,
        kind: ResourceKind,
        token: string,
        visibility: Visibility,
        ownerId?: string,
    ) {
        if (!validId(id)) return undefined;
        return transaction(this.pool, async (client) => {
            await reclaim(client);
            const row = (
                await client.query(
                    'SELECT * FROM temporary_resources WHERE id = $1 AND kind = $2 AND expires_at > clock_timestamp() FOR UPDATE',
                    [id, kind],
                )
            ).rows[0];
            if (
                !row ||
                !ownsOrToken(row.owner_id ?? undefined, ownerId, () =>
                    matches(token, row.token_hash),
                )
            )
                return undefined;
            const { accessToken, ...sharing } = sharingCredentials(visibility);
            await client.query(
                'UPDATE temporary_resources SET visibility = $1, access_token_hash = $2, access_version = $3 WHERE id = $4',
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
        if (!validId(ownerId)) return [];
        const result = await this.pool.query<ResourceRow>(
            "SELECT id, kind, token_hash, payload, ''::bytea AS data, expires_at, uses, stored_bytes, owner_id, quota_key, created_at, persistent, use_limit, visibility, access_token_hash, access_version FROM temporary_resources WHERE owner_id = $1 AND expires_at > clock_timestamp() ORDER BY created_at DESC",
            [ownerId],
        );
        return result.rows.map((row) => {
            const { data: _, ...info } = fromRow(row);
            return info;
        });
    }
}
