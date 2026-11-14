import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { transaction } from './database.js';
import { plans, resolvePlan } from '@kivel.io/tools/plans';
import type { AccountPlan, PlanId } from '@kivel.io/tools/plans';

const derive = promisify(scrypt);
export const digest = (value: string) => createHash('sha256').update(value).digest();
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const scopes = ['tools:run', 'resources:read', 'resources:write', 'account:read'] as const;
export type Scope = (typeof scopes)[number];
export interface Account {
    id: string;
    name: string;
    plan: AccountPlan;
    planValidUntil: string | null;
    quotaKey: string;
    customerId: string | null;
}
export interface User {
    id: string;
    username: string;
    passwordHash: string;
    personalAccountId: string;
}
export interface Identity {
    userId: string;
    username: string;
    account: Account;
    role: Role;
    keyId?: string;
    keyName?: string;
    emailInboxId?: string;
    keyScopes: Scope[];
    sessionHash?: string;
}
export interface KeyInfo {
    id: string;
    name: string;
    prefix: string;
    scopes: Scope[];
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    emailInboxId?: string;
}
type MaybePromise<T> = T | Promise<T>;
export interface IdentityRepository {
    register(username: string, passwordHash: string): MaybePromise<User | null>;
    findUser(username: string): MaybePromise<User | undefined>;
    createSession(
        userId: string,
        accountId: string,
        token: string,
        expectedPassword?: string,
    ): MaybePromise<boolean>;
    authenticateSession(token: string): MaybePromise<Identity | undefined>;
    authenticateKey(token: string): MaybePromise<Identity | undefined>;
    revokeSession(token: string): MaybePromise<void>;
    createKey(
        identity: Identity,
        name: string,
        keyScopes: Scope[],
        expiresAt: string,
        kind?: 'manual' | 'agent',
        emailInboxId?: string,
    ): MaybePromise<{ key: string; info: KeyInfo }>;
    listKeys(identity: Identity): MaybePromise<KeyInfo[]>;
    revokeKey(identity: Identity, id: string): MaybePromise<boolean>;
    /** Active keys of every member in a workspace; used to manage agents. */
    accountKeys(accountId: string): MaybePromise<(KeyInfo & { userId: string })[]>;
    /** Revokes any key in a workspace; callers check the actor may manage it. */
    revokeAccountKey(accountId: string, id: string): MaybePromise<boolean>;
    workspaces(userId: string): MaybePromise<{ account: Account; role: Role }[]>;
    switchWorkspace(token: string, userId: string, accountId: string): MaybePromise<boolean>;
    renameWorkspace(accountId: string, name: string): MaybePromise<void>;
    members(accountId: string): MaybePromise<{ userId: string; username: string; role: Role }[]>;
    invite(
        accountId: string,
        username: string,
        role: Exclude<Role, 'owner'>,
        token: string,
    ): MaybePromise<boolean>;
    acceptInvite(userId: string, username: string, token: string): MaybePromise<string | undefined>;
    removeMember(accountId: string, userId: string): MaybePromise<boolean>;
    setEntitlement(
        accountId: string,
        plan: AccountPlan,
        validUntil: string | null,
        customerId?: string,
    ): MaybePromise<void>;
    account(accountId: string): MaybePromise<Account | undefined>;
    consumeRun(
        key: string,
        accountId: string | null,
        limit: number,
    ): MaybePromise<{ allowed: boolean; used: number; day: number }>;
    releaseRun(key: string, day: number): MaybePromise<void>;
    runUsage(key: string): MaybePromise<number>;
    cleanup(): MaybePromise<void>;
}
export async function passwordHash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url');
    const value = (await derive(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${value.toString('base64url')}`;
}
export async function verifyPassword(password: string, value: string): Promise<boolean> {
    const parts = value.split('$');
    if (
        parts.length !== 3 ||
        parts[0] !== 'scrypt' ||
        !/^[A-Za-z0-9_-]{22}$/.test(parts[1]!) ||
        !/^[A-Za-z0-9_-]{86}$/.test(parts[2]!)
    )
        return false;
    const actual = (await derive(password, parts[1]!, 64)) as Buffer;
    return timingSafeEqual(actual, Buffer.from(parts[2]!, 'base64url'));
}
export function effectivePlan(account: Account): AccountPlan {
    return resolvePlan(account.plan, account.planValidUntil);
}
export function publicIdentity(identity: Identity) {
    const { quotaKey: _, customerId: __, ...account } = identity.account;
    return {
        user: { id: identity.userId, username: identity.username },
        account: { ...account, effectivePlan: effectivePlan(identity.account) },
        role: identity.role,
        scopes: identity.keyScopes,
    };
}
const visibleScopes = (role: Role, account?: Account): Scope[] =>
    account && role !== 'owner' && effectivePlan(account) !== 'team'
        ? ['account:read']
        : role === 'viewer'
          ? ['resources:read', 'account:read']
          : [...scopes];

export class MemoryIdentityRepository implements IdentityRepository {
    private users = new Map<string, User>();
    private accounts = new Map<string, Account>();
    private memberships = new Map<string, Role>();
    private sessions = new Map<string, { userId: string; accountId: string; expires: number }>();
    private keys = new Map<
        string,
        { userId: string; accountId: string; info: KeyInfo; kind: 'manual' | 'agent' }
    >();
    private invitations = new Map<
        string,
        { accountId: string; username: string; role: Exclude<Role, 'owner'>; expires: number }
    >();
    private usage = new Map<string, { day: number; count: number }>();
    register(username: string, hash: string) {
        if (this.users.has(username)) return null;
        if (this.users.size >= 10000)
            throw Object.assign(new Error('Account registration capacity reached.'), {
                statusCode: 503,
            });
        const accountId = randomUUID(),
            id = randomUUID();
        const user = { id, username, passwordHash: hash, personalAccountId: accountId };
        this.users.set(username, user);
        this.accounts.set(accountId, {
            id: accountId,
            name: `${username}'s workspace`,
            plan: 'free',
            planValidUntil: null,
            quotaKey: randomBytes(32).toString('hex'),
            customerId: null,
        });
        this.memberships.set(`${accountId}:${id}`, 'owner');
        return user;
    }
    findUser(username: string) {
        return this.users.get(username);
    }
    userById(id: string) {
        return [...this.users.values()].find((user) => user.id === id);
    }
    resetPassword(id: string, hash: string) {
        const user = this.userById(id);
        if (!user) return;
        user.passwordHash = hash;
        for (const [key, value] of this.sessions)
            if (value.userId === id) this.sessions.delete(key);
        for (const [key, value] of this.keys) if (value.userId === id) this.keys.delete(key);
    }
    private identity(userId: string, accountId: string, keyScopes?: Scope[]): Identity | undefined {
        const user = [...this.users.values()].find((item) => item.id === userId),
            account = this.accounts.get(accountId),
            role = this.memberships.get(`${accountId}:${userId}`);
        if (!user || !account || !role) return undefined;
        return {
            userId,
            username: user.username,
            account: { ...account },
            role,
            keyScopes: visibleScopes(role, account).filter(
                (scope) => !keyScopes || keyScopes.includes(scope),
            ),
        };
    }
    createSession(userId: string, accountId: string, token: string, expectedPassword?: string) {
        const user = this.userById(userId);
        if (!user || (expectedPassword !== undefined && user.passwordHash !== expectedPassword))
            return false;
        const existing = [...this.sessions.entries()].filter(
            ([, session]) => session.userId === userId,
        );
        for (const [hash] of existing.slice(0, Math.max(0, existing.length - 9)))
            this.sessions.delete(hash);
        this.sessions.set(digest(token).toString('hex'), {
            userId,
            accountId,
            expires: Date.now() + 7 * 86400000,
        });
        return true;
    }
    authenticateSession(token: string) {
        const hash = digest(token).toString('hex'),
            session = this.sessions.get(hash);
        if (!session || session.expires <= Date.now()) return undefined;
        const identity = this.identity(session.userId, session.accountId);
        return identity ? { ...identity, sessionHash: hash } : undefined;
    }
    authenticateKey(token: string) {
        const key = this.keys.get(digest(token).toString('hex'));
        if (
            !key ||
            (token.startsWith('kve_') && !key.info.emailInboxId) ||
            Date.parse(key.info.expiresAt) <= Date.now()
        )
            return undefined;
        key.info.lastUsedAt = new Date().toISOString();
        const identity = this.identity(key.userId, key.accountId, key.info.scopes);
        return identity
            ? {
                  ...identity,
                  keyId: key.info.id,
                  keyName: key.info.name,
                  ...(key.info.emailInboxId ? { emailInboxId: key.info.emailInboxId } : {}),
              }
            : undefined;
    }
    revokeSession(token: string) {
        this.sessions.delete(digest(token).toString('hex'));
    }
    createKey(
        identity: Identity,
        name: string,
        keyScopes: Scope[],
        expiresAt: string,
        kind: 'manual' | 'agent' = 'manual',
        emailInboxId?: string,
    ) {
        if (identity.sessionHash && !this.sessions.has(identity.sessionHash))
            throw Object.assign(new Error('Session expired. Sign in again.'), { statusCode: 401 });
        if (kind === 'manual') {
            const manualKeys = [...this.keys.values()].filter(
                (key) =>
                    key.kind === 'manual' &&
                    key.userId === identity.userId &&
                    key.accountId === identity.account.id &&
                    Date.parse(key.info.expiresAt) > Date.now(),
            );
            if (manualKeys.length >= 20)
                throw Object.assign(
                    new Error('At most 20 active API keys are allowed per user and workspace.'),
                    { statusCode: 409 },
                );
        }
        const key = `${emailInboxId ? 'kve' : 'kv'}_${randomBytes(32).toString('base64url')}`;
        const info: KeyInfo = {
            id: randomUUID(),
            name,
            prefix: key.slice(0, 10),
            scopes: keyScopes,
            ...(emailInboxId ? { emailInboxId } : {}),
            createdAt: new Date().toISOString(),
            expiresAt,
            lastUsedAt: null,
        };
        this.keys.set(digest(key).toString('hex'), {
            userId: identity.userId,
            accountId: identity.account.id,
            info,
            kind,
        });
        return { key, info };
    }
    listKeys(identity: Identity) {
        return [...this.keys.values()]
            .filter(
                (key) =>
                    key.userId === identity.userId &&
                    key.accountId === identity.account.id &&
                    Date.parse(key.info.expiresAt) > Date.now(),
            )
            .map((key) => ({ ...key.info }));
    }
    revokeKey(identity: Identity, id: string) {
        for (const [hash, key] of this.keys)
            if (
                key.info.id === id &&
                key.userId === identity.userId &&
                key.accountId === identity.account.id
            )
                return this.keys.delete(hash);
        return false;
    }
    accountKeys(accountId: string) {
        return [...this.keys.values()]
            .filter(
                (key) => key.accountId === accountId && Date.parse(key.info.expiresAt) > Date.now(),
            )
            .map((key) => ({ ...key.info, userId: key.userId }));
    }
    revokeAccountKey(accountId: string, id: string) {
        for (const [hash, key] of this.keys)
            if (key.info.id === id && key.accountId === accountId) return this.keys.delete(hash);
        return false;
    }
    workspaces(userId: string) {
        return [...this.accounts.values()].flatMap((account) => {
            const role = this.memberships.get(`${account.id}:${userId}`);
            return role ? [{ account: { ...account }, role }] : [];
        });
    }
    switchWorkspace(token: string, userId: string, accountId: string) {
        const session = this.sessions.get(digest(token).toString('hex'));
        if (
            !session ||
            session.userId !== userId ||
            !this.memberships.has(`${accountId}:${userId}`)
        )
            return false;
        session.accountId = accountId;
        return true;
    }
    renameWorkspace(accountId: string, name: string) {
        const account = this.accounts.get(accountId);
        if (account) account.name = name;
    }
    members(accountId: string) {
        return [...this.users.values()].flatMap((user) => {
            const role = this.memberships.get(`${accountId}:${user.id}`);
            return role ? [{ userId: user.id, username: user.username, role }] : [];
        });
    }
    invite(accountId: string, username: string, role: Exclude<Role, 'owner'>, token: string) {
        if (
            this.members(accountId).length >= 20 ||
            [...this.invitations.values()].filter(
                (invite) => invite.accountId === accountId && invite.expires > Date.now(),
            ).length >= 20
        )
            return false;
        this.invitations.set(digest(token).toString('hex'), {
            accountId,
            username,
            role,
            expires: Date.now() + 86400000,
        });
        return true;
    }
    acceptInvite(userId: string, username: string, token: string) {
        const hash = digest(token).toString('hex'),
            invitation = this.invitations.get(hash);
        if (
            !invitation ||
            invitation.username !== username ||
            invitation.expires <= Date.now() ||
            effectivePlan(this.accounts.get(invitation.accountId)!) !== 'team' ||
            this.members(invitation.accountId).length >= 20
        )
            return undefined;
        if (!this.memberships.has(`${invitation.accountId}:${userId}`))
            this.memberships.set(`${invitation.accountId}:${userId}`, invitation.role);
        this.invitations.delete(hash);
        return invitation.accountId;
    }
    removeMember(accountId: string, userId: string) {
        return (
            this.memberships.get(`${accountId}:${userId}`) !== 'owner' &&
            this.memberships.delete(`${accountId}:${userId}`)
        );
    }
    setEntitlement(
        accountId: string,
        plan: AccountPlan,
        validUntil: string | null,
        customerId?: string,
    ) {
        const account = this.accounts.get(accountId);
        if (account) {
            account.plan = plan;
            account.planValidUntil = validUntil;
            if (customerId) account.customerId = customerId;
        }
    }
    account(accountId: string) {
        const value = this.accounts.get(accountId);
        return value ? { ...value } : undefined;
    }
    consumeRun(key: string, _accountId: string | null, limit: number) {
        const day = Math.floor(Date.now() / 86400000);
        let usage = this.usage.get(key);
        if (!usage || usage.day !== day) {
            usage = { day, count: 0 };
            this.usage.set(key, usage);
        }
        if (usage.count >= limit) return { allowed: false, used: usage.count, day };
        usage.count++;
        return { allowed: true, used: usage.count, day };
    }
    releaseRun(key: string, day: number) {
        const usage = this.usage.get(key);
        if (usage?.day === day) usage.count = Math.max(0, usage.count - 1);
    }
    runUsage(key: string) {
        const usage = this.usage.get(key);
        return usage?.day === Math.floor(Date.now() / 86400000) ? usage.count : 0;
    }
    cleanup() {
        for (const [key, session] of this.sessions)
            if (session.expires <= Date.now()) this.sessions.delete(key);
        for (const [key, invite] of this.invitations)
            if (invite.expires <= Date.now()) this.invitations.delete(key);
        for (const [hash, key] of this.keys)
            if (Date.parse(key.info.expiresAt) <= Date.now()) this.keys.delete(hash);
        for (const [key, usage] of this.usage)
            if (usage.day < Math.floor(Date.now() / 86400000) - 1) this.usage.delete(key);
    }
}

interface AccountRow {
    account_id: string;
    name: string;
    plan: AccountPlan;
    plan_valid_until: Date | null;
    quota_key: Buffer;
    dodo_customer_id: string | null;
}
const accountRow = (row: AccountRow): Account => ({
    id: row.account_id,
    name: row.name,
    plan: row.plan,
    planValidUntil: row.plan_valid_until?.toISOString() ?? null,
    quotaKey: row.quota_key.toString('hex'),
    customerId: row.dodo_customer_id,
});
export class PostgresIdentityRepository implements IdentityRepository {
    constructor(private pool: Pool) {}
    async register(username: string, hash: string) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(784240)');
            if (
                Number((await client.query('SELECT count(*) AS count FROM users')).rows[0].count) >=
                10000
            )
                throw Object.assign(new Error('Account registration capacity reached.'), {
                    statusCode: 503,
                });
            const id = randomUUID(),
                accountId = randomUUID();
            const user = await client.query(
                'INSERT INTO users (id, username, password_hash, personal_account_id) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING RETURNING id',
                [id, username, hash, accountId],
            );
            if (!user.rowCount) return null;
            await client.query('INSERT INTO accounts (id, name, quota_key) VALUES ($1, $2, $3)', [
                accountId,
                `${username}'s workspace`,
                randomBytes(32),
            ]);
            await client.query(
                "INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, 'owner')",
                [accountId, id],
            );
            return { id, username, passwordHash: hash, personalAccountId: accountId };
        });
    }
    async findUser(username: string) {
        const result = await this.pool.query(
            'SELECT * FROM users WHERE username = $1 AND disabled_at IS NULL',
            [username],
        );
        const row = result.rows[0];
        return row
            ? {
                  id: row.id,
                  username: row.username,
                  passwordHash: row.password_hash,
                  personalAccountId: row.personal_account_id,
              }
            : undefined;
    }
    async createSession(
        userId: string,
        accountId: string,
        token: string,
        expectedPassword?: string,
    ) {
        return transaction(this.pool, async (client) => {
            const user = (
                await client.query(
                    'SELECT password_hash FROM users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE',
                    [userId],
                )
            ).rows[0];
            if (
                !user ||
                (expectedPassword !== undefined && user.password_hash !== expectedPassword)
            )
                return false;
            await client.query(
                'DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC OFFSET 9)',
                [userId],
            );
            await client.query(
                "INSERT INTO auth_sessions (token_hash, user_id, account_id, expires_at) VALUES ($1, $2, $3, clock_timestamp() + interval '7 days')",
                [digest(token), userId, accountId],
            );
            return true;
        });
    }
    private async authenticate(
        table: 'auth_sessions' | 'api_keys',
        token: string,
    ): Promise<Identity | undefined> {
        const result = await this.pool.query(
            `SELECT u.id AS user_id, u.username, a.id AS account_id, a.name, a.plan, a.plan_valid_until, a.quota_key, a.dodo_customer_id, m.role, t.${table === 'api_keys' ? 'id, t.scopes, t.name AS key_name, t.email_inbox_id' : 'token_hash'} FROM ${table} t JOIN users u ON u.id = t.user_id JOIN accounts a ON a.id = t.account_id JOIN account_members m ON m.user_id = u.id AND m.account_id = a.id WHERE t.token_hash = $1 AND t.expires_at > clock_timestamp() AND u.disabled_at IS NULL ${table === 'api_keys' ? 'AND t.revoked_at IS NULL' : ''}`,
            [digest(token)],
        );
        const row = result.rows[0];
        if (!row || (table === 'api_keys' && token.startsWith('kve_') && !row.email_inbox_id))
            return undefined;
        if (table === 'api_keys')
            await this.pool.query(
                'UPDATE api_keys SET last_used_at = clock_timestamp() WHERE id = $1',
                [row.id],
            );
        return {
            userId: row.user_id,
            username: row.username,
            account: accountRow(row),
            role: row.role as Role,
            keyScopes: visibleScopes(row.role, accountRow(row)).filter(
                (scope) => !row.scopes || row.scopes.includes(scope),
            ),
            ...(table === 'api_keys'
                ? {
                      keyId: row.id,
                      keyName: row.key_name,
                      ...(row.email_inbox_id ? { emailInboxId: row.email_inbox_id } : {}),
                  }
                : { sessionHash: digest(token).toString('hex') }),
        } satisfies Identity;
    }
    authenticateSession(token: string) {
        return this.authenticate('auth_sessions', token);
    }
    authenticateKey(token: string) {
        return this.authenticate('api_keys', token);
    }
    async revokeSession(token: string) {
        await this.pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [digest(token)]);
    }
    async createKey(
        identity: Identity,
        name: string,
        keyScopes: Scope[],
        expiresAt: string,
        kind: 'manual' | 'agent' = 'manual',
        emailInboxId?: string,
    ) {
        const key = `${emailInboxId ? 'kve' : 'kv'}_${randomBytes(32).toString('base64url')}`,
            id = randomUUID();
        const result = await transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [identity.userId]);
            if (
                identity.sessionHash &&
                !(
                    await client.query(
                        'SELECT 1 FROM auth_sessions WHERE token_hash = $1 AND expires_at > clock_timestamp()',
                        [Buffer.from(identity.sessionHash, 'hex')],
                    )
                ).rowCount
            )
                throw Object.assign(new Error('Session expired. Sign in again.'), {
                    statusCode: 401,
                });
            if (kind === 'manual') {
                const count = await client.query<{ count: number }>(
                    `SELECT count(*)::integer AS count FROM api_keys k
                     WHERE k.user_id = $1 AND k.account_id = $2 AND k.revoked_at IS NULL
                     AND k.expires_at > clock_timestamp()
                     AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.key_id = k.id)`,
                    [identity.userId, identity.account.id],
                );
                if (count.rows[0]!.count >= 20)
                    throw Object.assign(
                        new Error('At most 20 active API keys are allowed per user and workspace.'),
                        { statusCode: 409 },
                    );
            }
            return client.query(
                'INSERT INTO api_keys (id, token_hash, user_id, account_id, name, prefix, scopes, expires_at, email_inbox_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING created_at',
                [
                    id,
                    digest(key),
                    identity.userId,
                    identity.account.id,
                    name,
                    key.slice(0, 10),
                    keyScopes,
                    expiresAt,
                    emailInboxId ?? null,
                ],
            );
        });
        return {
            key,
            info: {
                id,
                name,
                prefix: key.slice(0, 10),
                scopes: keyScopes,
                ...(emailInboxId ? { emailInboxId } : {}),
                createdAt: result.rows[0].created_at.toISOString(),
                expiresAt,
                lastUsedAt: null,
            },
        };
    }
    async listKeys(identity: Identity) {
        const result = await this.pool.query(
            'SELECT * FROM api_keys WHERE user_id = $1 AND account_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp() ORDER BY created_at DESC',
            [identity.userId, identity.account.id],
        );
        return result.rows.map((row): KeyInfo => ({
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            scopes: row.scopes,
            ...(row.email_inbox_id ? { emailInboxId: row.email_inbox_id } : {}),
            createdAt: row.created_at.toISOString(),
            expiresAt: row.expires_at.toISOString(),
            lastUsedAt: row.last_used_at?.toISOString() ?? null,
        }));
    }
    async accountKeys(accountId: string) {
        const result = await this.pool.query(
            'SELECT * FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp() ORDER BY created_at DESC',
            [accountId],
        );
        return result.rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            prefix: row.prefix,
            scopes: row.scopes,
            ...(row.email_inbox_id ? { emailInboxId: row.email_inbox_id } : {}),
            createdAt: row.created_at.toISOString(),
            expiresAt: row.expires_at.toISOString(),
            lastUsedAt: row.last_used_at?.toISOString() ?? null,
        }));
    }
    async revokeAccountKey(accountId: string, id: string) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
            return false;
        const result = await this.pool.query(
            'UPDATE api_keys SET revoked_at = clock_timestamp() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL RETURNING id',
            [id, accountId],
        );
        return !!result.rowCount;
    }
    async revokeKey(identity: Identity, id: string) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
            return false;
        const result = await this.pool.query(
            'UPDATE api_keys SET revoked_at = clock_timestamp() WHERE id = $1 AND user_id = $2 AND account_id = $3 AND revoked_at IS NULL RETURNING id',
            [id, identity.userId, identity.account.id],
        );
        return !!result.rowCount;
    }
    async workspaces(userId: string) {
        const result = await this.pool.query(
            'SELECT a.id AS account_id, a.*, m.role FROM accounts a JOIN account_members m ON m.account_id = a.id WHERE m.user_id = $1 ORDER BY a.created_at',
            [userId],
        );
        return result.rows.map((row) => ({ account: accountRow(row), role: row.role as Role }));
    }
    async switchWorkspace(token: string, userId: string, accountId: string) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(accountId))
            return false;
        const result = await this.pool.query(
            'UPDATE auth_sessions SET account_id = $1 WHERE token_hash = $2 AND user_id = $3 AND EXISTS (SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $3) RETURNING user_id',
            [accountId, digest(token), userId],
        );
        return !!result.rowCount;
    }
    async renameWorkspace(accountId: string, name: string) {
        await this.pool.query('UPDATE accounts SET name = $1 WHERE id = $2', [name, accountId]);
    }
    async members(accountId: string) {
        const result = await this.pool.query(
            'SELECT u.id, u.username, m.role FROM account_members m JOIN users u ON u.id = m.user_id WHERE account_id = $1 ORDER BY u.username',
            [accountId],
        );
        return result.rows.map((row) => ({
            userId: row.id,
            username: row.username,
            role: row.role as Role,
        }));
    }
    async invite(accountId: string, username: string, role: Exclude<Role, 'owner'>, token: string) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
            const count = await client.query(
                'SELECT count(*)::integer AS count FROM account_invites WHERE account_id = $1 AND expires_at > clock_timestamp()',
                [accountId],
            );
            if (count.rows[0].count >= 20) return false;
            await client.query(
                "INSERT INTO account_invites (token_hash, account_id, username, role, expires_at) VALUES ($1, $2, $3, $4, clock_timestamp() + interval '1 day')",
                [digest(token), accountId, username, role],
            );
            return true;
        });
    }
    async acceptInvite(userId: string, username: string, token: string) {
        return transaction(this.pool, async (client) => {
            const invitation = (
                await client.query(
                    'SELECT i.*, a.plan, a.plan_valid_until FROM account_invites i JOIN accounts a ON a.id = i.account_id WHERE i.token_hash = $1 AND i.username = $2 AND i.expires_at > clock_timestamp() FOR UPDATE OF a, i',
                    [digest(token), username],
                )
            ).rows[0];
            if (
                !invitation ||
                resolvePlan(invitation.plan, invitation.plan_valid_until?.toISOString() ?? null) !==
                    'team'
            )
                return undefined;
            const count = (
                await client.query(
                    'SELECT count(*)::integer AS count FROM account_members WHERE account_id = $1',
                    [invitation.account_id],
                )
            ).rows[0].count;
            if (count >= 20) return undefined;
            await client.query(
                'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [invitation.account_id, userId, invitation.role],
            );
            await client.query('DELETE FROM account_invites WHERE token_hash = $1', [
                digest(token),
            ]);
            return invitation.account_id as string;
        });
    }
    async removeMember(accountId: string, userId: string) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId))
            return false;
        const result = await this.pool.query(
            "DELETE FROM account_members WHERE account_id = $1 AND user_id = $2 AND role <> 'owner' RETURNING user_id",
            [accountId, userId],
        );
        return !!result.rowCount;
    }
    async setEntitlement(
        accountId: string,
        plan: AccountPlan,
        validUntil: string | null,
        customerId?: string,
    ) {
        await this.pool.query(
            'UPDATE accounts SET plan = $1, plan_valid_until = $2, dodo_customer_id = COALESCE($3, dodo_customer_id) WHERE id = $4',
            [plan, validUntil, customerId ?? null, accountId],
        );
    }
    async account(accountId: string) {
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(accountId))
            return undefined;
        const row = (
            await this.pool.query('SELECT id AS account_id, * FROM accounts WHERE id = $1', [
                accountId,
            ])
        ).rows[0];
        return row ? accountRow(row) : undefined;
    }
    async consumeRun(key: string, accountId: string | null, limit: number) {
        const result = await this.pool.query(
            'INSERT INTO tool_usage_daily (key_hash, day, account_id, count) VALUES ($1, floor(extract(epoch from clock_timestamp()) / 86400)::bigint, $2, 1) ON CONFLICT (key_hash, day) DO UPDATE SET count = tool_usage_daily.count + 1 WHERE tool_usage_daily.count < $3 RETURNING count, day',
            [Buffer.from(key, 'hex'), accountId, limit],
        );
        return {
            allowed: !!result.rowCount,
            used: result.rows[0]?.count ?? limit,
            day: Number(result.rows[0]?.day ?? Math.floor(Date.now() / 86400000)),
        };
    }
    async releaseRun(key: string, day: number) {
        const client = await this.pool.connect();
        const parameters = [Buffer.from(key, 'hex'), day];
        try {
            await client.query('BEGIN');
            const result = await client.query(
                'SELECT count FROM tool_usage_daily WHERE key_hash = $1 AND day = $2 FOR UPDATE',
                parameters,
            );
            if (result.rows[0]?.count === 1)
                await client.query(
                    'DELETE FROM tool_usage_daily WHERE key_hash = $1 AND day = $2',
                    parameters,
                );
            else if (result.rowCount)
                await client.query(
                    'UPDATE tool_usage_daily SET count = count - 1 WHERE key_hash = $1 AND day = $2',
                    parameters,
                );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    async runUsage(key: string) {
        const row = (
            await this.pool.query(
                'SELECT count FROM tool_usage_daily WHERE key_hash = $1 AND day = floor(extract(epoch from clock_timestamp()) / 86400)::bigint',
                [Buffer.from(key, 'hex')],
            )
        ).rows[0];
        return Number(row?.count ?? 0);
    }
    async cleanup() {
        await this.pool.query(
            `DELETE FROM auth_sessions WHERE expires_at <= clock_timestamp(); DELETE FROM account_invites WHERE expires_at <= clock_timestamp(); DELETE FROM tool_usage_daily WHERE day < floor(extract(epoch from clock_timestamp()) / 86400)::bigint - 1; DELETE FROM principal_usage WHERE resource_count = 0 AND updated_at < clock_timestamp() - interval '1 day'; DELETE FROM resource_events WHERE timestamp < clock_timestamp() - interval '30 days'; DELETE FROM dodo_events WHERE processed_at < clock_timestamp() - interval '90 days'; DELETE FROM api_keys WHERE expires_at < clock_timestamp() - interval '90 days' OR revoked_at < clock_timestamp() - interval '90 days'`,
        );
    }
}
