import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { plans } from '@socket-help/tools/plans';
import { transaction } from './database.js';
import { HttpError } from './errors.js';
import type { Access } from './access.js';
import type { AgentRepository } from './agents.js';
import type { ActivityRepository } from './activity.js';
import type { RateLimitRepository } from './rate-limit.js';
import { parseTotp, totp, totpVault } from './totp.js';
import { decodeTotpQr } from './totp-qr.js';

export interface Authenticator {
    id: string;
    name: string;
    issuer: string;
    accountName: string;
    algorithm: 'SHA1' | 'SHA256' | 'SHA512';
    digits: number;
    period: number;
    createdAt: string;
}
interface StoredAuthenticator extends Authenticator {
    encrypted: string;
}
export interface AuthenticatorRepository {
    list(owner: string): Promise<StoredAuthenticator[]>;
    add(owner: string, entry: StoredAuthenticator, limit: number): Promise<boolean>;
    rename(owner: string, id: string, name: string): Promise<boolean>;
    delete(owner: string, id: string): Promise<boolean>;
}
export class MemoryAuthenticators implements AuthenticatorRepository {
    private entries = new Map<string, Map<string, StoredAuthenticator>>();
    async list(owner: string) {
        return structuredClone([...(this.entries.get(owner)?.values() ?? [])]);
    }
    async add(owner: string, entry: StoredAuthenticator, limit: number) {
        const map = this.entries.get(owner) ?? new Map();
        if (map.size >= limit) return false;
        map.set(entry.id, structuredClone(entry));
        this.entries.set(owner, map);
        return true;
    }
    async rename(owner: string, id: string, name: string) {
        const entry = this.entries.get(owner)?.get(id);
        if (!entry) return false;
        entry.name = name;
        return true;
    }
    async delete(owner: string, id: string) {
        return this.entries.get(owner)?.delete(id) ?? false;
    }
}
// This namespace cannot be addressed by the public memory API's namespace syntax.
const namespace = '$authenticators';
export class PostgresAuthenticators implements AuthenticatorRepository {
    constructor(private pool: Pool) {}
    async list(owner: string) {
        return (
            await this.pool.query(
                'SELECT value FROM kv_entries WHERE account_id=$1 AND namespace=$2 ORDER BY updated_at DESC',
                [owner, namespace],
            )
        ).rows.map((row) => row.value as StoredAuthenticator);
    }
    async add(owner: string, entry: StoredAuthenticator, limit: number) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [owner]);
            const count = Number(
                (
                    await client.query(
                        'SELECT count(*) AS count FROM kv_entries WHERE account_id=$1 AND namespace=$2',
                        [owner, namespace],
                    )
                ).rows[0].count,
            );
            if (count >= limit) return false;
            const value = JSON.stringify(entry);
            await client.query(
                'INSERT INTO kv_entries(account_id,namespace,key,value,bytes) VALUES($1,$2,$3,$4,$5)',
                [owner, namespace, entry.id, value, Buffer.byteLength(value)],
            );
            return true;
        });
    }
    async rename(owner: string, id: string, name: string) {
        const result = await this.pool.query(
            "UPDATE kv_entries SET value=jsonb_set(value,'{name}',to_jsonb($4::text)),updated_at=clock_timestamp(),bytes=octet_length(jsonb_set(value,'{name}',to_jsonb($4::text))::text) WHERE account_id=$1 AND namespace=$2 AND key=$3",
            [owner, namespace, id, name],
        );
        return result.rowCount === 1;
    }
    async delete(owner: string, id: string) {
        return (
            (
                await this.pool.query(
                    'DELETE FROM kv_entries WHERE account_id=$1 AND namespace=$2 AND key=$3',
                    [owner, namespace, id],
                )
            ).rowCount === 1
        );
    }
}
const publicEntry = ({ encrypted: _, ...entry }: StoredAuthenticator) => entry;
function label(input: unknown) {
    if (
        typeof input !== 'string' ||
        !input.trim() ||
        input.length > 80 ||
        /[\x00-\x1f\x7f]/.test(input)
    )
        throw new HttpError(400, 'name must contain 1–80 characters without control characters.');
    return input.trim().toWellFormed();
}
export function registerAuthenticators(
    app: FastifyInstance,
    access: Access,
    store: AuthenticatorRepository,
    limits: RateLimitRepository,
    activity: ActivityRepository,
    secret?: string,
    agents?: Pick<AgentRepository, 'agents'>,
) {
    const vault = secret ? totpVault(secret) : undefined;
    const configured = () => {
        if (!vault)
            throw new HttpError(503, 'Authenticator storage requires AUTH_SECRET on this server.');
        return vault;
    };
    app.get('/api/authenticators', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        return {
            authenticators: (await store.list(actor.identity.account.id)).map(publicEntry),
            limit: plans[actor.plan].authenticators,
        };
    });
    app.get<{ Params: { id: string } }>('/api/authenticators/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        const entry = (await store.list(actor.identity.account.id)).find(
            (entry) => entry.id === request.params.id,
        );
        if (!entry) throw new HttpError(404, 'Authenticator unavailable or access denied.');
        return publicEntry(entry);
    });
    app.post(
        '/api/authenticators',
        {
            bodyLimit: 1500000,
            onRequest: async (request) => {
                await access.workspace(request, 'resources:write');
                configured();
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            const actor = await access.workspace(request, 'resources:write'),
                owner = actor.identity.account.id;
            const vault = configured();
            const input = request.body as Record<string, unknown> | null;
            if (
                !input ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).some(
                    (key) =>
                        ![
                            'name',
                            'uri',
                            'secret',
                            'imageBase64',
                            'algorithm',
                            'digits',
                            'period',
                        ].includes(key),
                ) ||
                ['uri', 'secret', 'imageBase64'].filter((key) => input[key] !== undefined)
                    .length !== 1
            )
                throw new HttpError(
                    400,
                    'Provide name and exactly one of uri, secret or imageBase64.',
                );
            const name = label(input.name);
            if (input.imageBase64 !== undefined) {
                if (await limits.consume(`totp-qr:${owner}`, 5))
                    throw new HttpError(
                        429,
                        'QR import limit reached. Try again in one minute.',
                        60,
                    );
                const decoded = await decodeTotpQr(input.imageBase64);
                delete input.imageBase64;
                if (decoded.startsWith('otpauth:')) input.uri = decoded;
                else input.secret = decoded;
            }
            const parsed = parseTotp(input),
                id = randomUUID();
            const entry: StoredAuthenticator = {
                id,
                name,
                issuer: parsed.issuer,
                accountName: parsed.accountName,
                algorithm: parsed.config.algorithm,
                digits: parsed.config.digits,
                period: parsed.config.period,
                createdAt: new Date().toISOString(),
                encrypted: vault.encrypt(parsed.config, owner, id),
            };
            if (!(await store.add(owner, entry, plans[actor.plan].authenticators)))
                throw new HttpError(
                    429,
                    `Your plan allows ${plans[actor.plan].authenticators} authenticators. Delete one or upgrade.`,
                );
            return reply.code(201).send(publicEntry(entry));
        },
    );
    app.get<{ Params: { id: string } }>('/api/authenticators/:id/code', async (request) => {
        const actor = await access.workspace(request, 'resources:write'),
            owner = actor.identity.account.id;
        const vault = configured();
        const retry = await limits.consume(`totp-code:${owner}`, 30);
        if (retry)
            throw new HttpError(
                429,
                'Authenticator code limit reached. Do not poll for the same code.',
                retry,
            );
        const entry = (await store.list(owner)).find((entry) => entry.id === request.params.id);
        if (!entry) throw new HttpError(404, 'Authenticator unavailable or access denied.');
        let config;
        try {
            config = vault.decrypt(entry.encrypted, owner, entry.id);
        } catch {
            throw new HttpError(
                409,
                'This authenticator must be re-added. Its stored secret cannot be decrypted with the current server key.',
            );
        }
        const code = totp(config);
        const agent = actor.identity.keyId
            ? (await agents?.agents(owner))?.find((agent) => agent.keyId === actor.identity.keyId)
            : undefined;
        await activity.record(owner, {
            at: new Date().toISOString(),
            tool: 'get_totp_code',
            resourceId: entry.id,
            ok: true,
            durationMs: 0,
            userId: actor.identity.userId,
            ...(actor.identity.keyId
                ? { keyId: actor.identity.keyId, agentName: agent?.name ?? actor.identity.keyName }
                : {}),
        });
        return { id: entry.id, ...code };
    });
    app.patch<{ Params: { id: string } }>('/api/authenticators/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:write');
        const body = request.body;
        if (
            !body ||
            typeof body !== 'object' ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== 'name')
        )
            throw new HttpError(400, 'Only name can be updated.');
        const name = label((body as { name?: unknown }).name);
        if (!(await store.rename(actor.identity.account.id, request.params.id, name)))
            throw new HttpError(404, 'Authenticator unavailable or access denied.');
        return { id: request.params.id, name };
    });
    app.delete<{ Params: { id: string } }>('/api/authenticators/:id', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        if (!(await store.delete(actor.identity.account.id, request.params.id)))
            throw new HttpError(404, 'Authenticator unavailable or access denied.');
        return reply.code(204).send();
    });
}
