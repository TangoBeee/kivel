import { checkLimit } from './errors.js';
import type { PlanId } from '@kivel.io/tools/plans';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { plans } from '@kivel.io/tools/plans';
import { runBrowserOperation } from '@kivel.io/tools/engine';
import { transaction } from './database.js';
import { HttpError } from './errors.js';
import { secretVault } from './secret-vault.js';
import type { Access } from './access.js';
import type { ActivityRepository } from './activity.js';
import type { AuthenticatorRepository } from './authenticators.js';
import type { ApprovalRepository, registerApprovals } from './approvals.js';
import type { registerEmail } from './email.js';
import type { RateLimitRepository } from './rate-limit.js';

export interface Credential {
    id: string;
    name: string;
    url: string;
    username: string;
    agentMayRead: boolean;
    authenticatorId?: string;
    inboxId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface StoredCredential extends Credential {
    version: string;
    encrypted: string;
}
export interface CredentialRepository {
    list(owner: string): Promise<Credential[]>;
    get(owner: string, id: string): Promise<StoredCredential | undefined>;
    save(owner: string, entry: StoredCredential, plan: PlanId): Promise<void>;
    update(owner: string, entry: StoredCredential, previousVersion: string): Promise<boolean>;
    delete(owner: string, id: string): Promise<boolean>;
}
const metadata = ({ encrypted: _, version: _version, ...entry }: StoredCredential): Credential =>
    entry;
export class MemoryCredentials implements CredentialRepository {
    private entries = new Map<string, Map<string, StoredCredential>>();
    async list(owner: string) {
        return structuredClone([...(this.entries.get(owner)?.values() ?? [])].map(metadata));
    }
    async get(owner: string, id: string) {
        const entry = this.entries.get(owner)?.get(id);
        return entry && structuredClone(entry);
    }
    async save(owner: string, entry: StoredCredential, plan: PlanId) {
        const entries = this.entries.get(owner) ?? new Map();
        checkLimit(plan, 'vault.entries', entries.size);
        entries.set(entry.id, structuredClone(entry));
        this.entries.set(owner, entries);
    }
    async update(owner: string, entry: StoredCredential, previousVersion: string) {
        const entries = this.entries.get(owner);
        if (entries?.get(entry.id)?.version !== previousVersion) return false;
        entries.set(entry.id, structuredClone(entry));
        return true;
    }
    async delete(owner: string, id: string) {
        return this.entries.get(owner)?.delete(id) ?? false;
    }
}
const namespace = '$credentials';
export class PostgresCredentials implements CredentialRepository {
    constructor(private readonly pool: Pool) {}
    async list(owner: string) {
        return (
            await this.pool.query(
                "SELECT value - 'encrypted' - 'version' AS entry FROM kv_entries WHERE account_id=$1 AND namespace=$2 ORDER BY updated_at DESC",
                [owner, namespace],
            )
        ).rows.map((row) => row.entry as Credential);
    }
    async get(owner: string, id: string) {
        return (
            await this.pool.query(
                'SELECT value FROM kv_entries WHERE account_id=$1 AND namespace=$2 AND key=$3',
                [owner, namespace, id],
            )
        ).rows[0]?.value as StoredCredential | undefined;
    }
    async save(owner: string, entry: StoredCredential, plan: PlanId) {
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
            checkLimit(plan, 'vault.entries', count);
            const value = JSON.stringify(entry);
            await client.query(
                'INSERT INTO kv_entries(account_id,namespace,key,value,bytes) VALUES($1,$2,$3,$4,$5)',
                [owner, namespace, entry.id, value, Buffer.byteLength(value)],
            );
        });
    }
    async update(owner: string, entry: StoredCredential, previousVersion: string) {
        const value = JSON.stringify(entry);
        return (
            (
                await this.pool.query(
                    "UPDATE kv_entries SET value=$4,bytes=$5,updated_at=clock_timestamp() WHERE account_id=$1 AND namespace=$2 AND key=$3 AND value->>'version'=$6",
                    [owner, namespace, entry.id, value, Buffer.byteLength(value), previousVersion],
                )
            ).rowCount === 1
        );
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
function text(value: unknown, label: string, maximum: number, allowEmpty = false) {
    if (
        typeof value !== 'string' ||
        (!allowEmpty && !value.trim()) ||
        value.length > maximum ||
        /[\x00-\x1f\x7f]/.test(value)
    )
        throw new HttpError(
            400,
            `Provide ${label} with ${allowEmpty ? 'up to' : '1 to'} ${maximum} characters without control characters.`,
        );
    return value;
}
function notesText(value: unknown) {
    if (
        typeof value !== 'string' ||
        value.length > 4000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
    )
        throw new HttpError(400, 'Notes must contain up to 4,000 characters.');
    return value;
}
function object(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Provide a JSON object.');
    return value as Record<string, unknown>;
}
export async function generateCredentialPassword(length: unknown = 24) {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 12 || length > 128)
        throw new HttpError(400, 'Choose a password length from 12 to 128.');
    return runBrowserOperation('everyday-password-generator', '', { length: String(length) });
}

export function registerCredentials(
    app: FastifyInstance,
    access: Access,
    store: CredentialRepository,
    authenticators: AuthenticatorRepository,
    email: ReturnType<typeof registerEmail>,
    approvals: ApprovalRepository,
    review: ReturnType<typeof registerApprovals>,
    activity: ActivityRepository,
    limits: RateLimitRepository,
    secret?: string,
) {
    const vault = secret ? secretVault(secret, 'credentials') : undefined;
    function configured() {
        if (!vault) throw new HttpError(503, 'Vault storage requires AUTH_SECRET on this server.');
        return vault;
    }
    function decrypt(entry: StoredCredential, owner: string) {
        const encryption = configured();
        try {
            return JSON.parse(encryption.decrypt(entry.encrypted, `${owner}:${entry.id}`)) as {
                password: string;
                notes: string;
            };
        } catch {
            throw new HttpError(
                409,
                'This credential must be re-added. Its password cannot be decrypted with the current server key.',
            );
        }
    }
    async function human(request: FastifyRequest) {
        const identity = await access.require(request, 'resources:write', true);
        if (!['owner', 'admin'].includes(identity.role))
            throw new HttpError(
                403,
                'Only workspace owners and admins can change agent access or confirm a reveal.',
            );
    }
    async function owned(request: FastifyRequest, id: string, write = false) {
        const actor = await access.workspace(request, write ? 'resources:write' : 'resources:read');
        const owner = actor.identity.account.id;
        const entry = await store.get(owner, id);
        if (!entry) throw new HttpError(404, 'Credential unavailable or access denied.');
        return { actor, owner, entry };
    }
    async function validate(
        request: FastifyRequest,
        input: Record<string, unknown>,
        owner: string,
        current?: StoredCredential,
    ) {
        if (
            Object.keys(input).some(
                (key) =>
                    ![
                        'name',
                        'url',
                        'username',
                        'password',
                        'passwordLength',
                        'notes',
                        'agentMayRead',
                        'authenticatorId',
                        'inboxId',
                    ].includes(key),
            )
        )
            throw new HttpError(400, 'Unknown credential field.');
        if (input.agentMayRead !== undefined) {
            await human(request);
            if (typeof input.agentMayRead !== 'boolean')
                throw new HttpError(400, 'agentMayRead must be true or false.');
        }
        const name = text(input.name ?? current?.name, 'a name', 80).trim();
        const username = text(input.username ?? current?.username, 'a username', 254);
        const site = text(input.url ?? current?.url, 'a site URL or domain', 2048).trim();
        let url: URL;
        try {
            url = new URL(site.includes('://') ? site : `https://${site}`);
        } catch {
            throw new HttpError(400, 'Provide an HTTP or HTTPS site URL or domain.');
        }
        if (
            !['https:', 'http:'].includes(url.protocol) ||
            !url.hostname ||
            url.username ||
            url.password
        )
            throw new HttpError(
                400,
                'Provide an HTTP or HTTPS site URL without embedded credentials.',
            );
        const links: { authenticatorId?: string; inboxId?: string } = {};
        for (const key of ['authenticatorId', 'inboxId'] as const) {
            const id = input[key] === undefined ? current?.[key] : input[key];
            if (id === null || id === undefined) continue;
            if (typeof id !== 'string')
                throw new HttpError(400, `Provide ${key} as a workspace resource ID or null.`);
            if (
                key === 'authenticatorId' &&
                !(await authenticators.list(owner)).some((entry) => entry.id === id)
            )
                throw new HttpError(404, 'Linked authenticator unavailable.');
            if (key === 'inboxId') await email.resolveInbox(id, owner);
            links[key] = id;
        }
        if (input.password !== undefined && input.passwordLength !== undefined)
            throw new HttpError(400, 'Provide a password or a generated password length.');
        if (current && input.passwordLength !== undefined)
            throw new HttpError(400, 'Generate a password first, then save it as the replacement.');
        return {
            name,
            username,
            url: url.href,
            ...links,
            agentMayRead: (input.agentMayRead ?? current?.agentMayRead ?? false) as boolean,
        };
    }
    app.get('/api/credentials', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        return {
            credentials: await store.list(actor.identity.account.id),
            limit: plans[actor.plan].credentials,
        };
    });
    app.get<{ Params: { id: string } }>('/api/credentials/:id', async (request) =>
        metadata((await owned(request, request.params.id)).entry),
    );
    app.post('/api/passwords/generate', async (request, reply) => {
        await access.workspace(request, 'resources:write');
        await access.rate(request);
        const input = object(request.body ?? {});
        if (Object.keys(input).some((key) => key !== 'length'))
            throw new HttpError(400, 'Only length can be configured.');
        return reply
            .header('Cache-Control', 'no-store')
            .send({ password: await generateCredentialPassword(input.length) });
    });
    app.post('/api/credentials', { bodyLimit: 16384 }, async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        const encryption = configured();
        const owner = actor.identity.account.id;
        const input = object(request.body);
        const entry = await validate(request, input, owner);
        await access.rate(request, true);
        const password =
            input.password === undefined
                ? await generateCredentialPassword(input.passwordLength)
                : text(input.password, 'a password', 1024);
        const notes = notesText(input.notes ?? '');
        const id = randomUUID(),
            now = new Date().toISOString();
        const stored = {
            ...entry,
            id,
            createdAt: now,
            updatedAt: now,
            version: randomUUID(),
            encrypted: encryption.encrypt(JSON.stringify({ password, notes }), `${owner}:${id}`),
        };
        await store.save(owner, stored, actor.plan);
        return reply
            .header('Cache-Control', 'no-store')
            .code(201)
            .send({
                credential: metadata(stored),
                ...(input.password === undefined ? { password } : {}),
            });
    });
    app.patch<{ Params: { id: string } }>(
        '/api/credentials/:id',
        { bodyLimit: 16384 },
        async (request) => {
            const { entry, owner } = await owned(request, request.params.id, true);
            const input = object(request.body);
            const next = await validate(request, input, owner, entry);
            const secrets = decrypt(entry, owner);
            if (input.password !== undefined)
                secrets.password = text(input.password, 'a password', 1024);
            if (input.notes !== undefined) secrets.notes = notesText(input.notes);
            const updated = {
                ...next,
                id: entry.id,
                createdAt: entry.createdAt,
                updatedAt: new Date().toISOString(),
                version: randomUUID(),
                encrypted: configured().encrypt(JSON.stringify(secrets), `${owner}:${entry.id}`),
            };
            if (!(await store.update(owner, updated, entry.version)))
                throw new HttpError(409, 'This entry changed. Reload it and try again.');
            return metadata(updated);
        },
    );
    app.delete<{ Params: { id: string } }>('/api/credentials/:id', async (request, reply) => {
        const { owner, entry } = await owned(request, request.params.id, true);
        if (!(await store.delete(owner, entry.id)))
            throw new HttpError(404, 'Credential unavailable.');
        return reply.code(204).send();
    });
    app.post<{ Params: { id: string } }>('/api/credentials/:id/reveal', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const { actor, owner, entry } = await owned(request, request.params.id, true);
        const input = object(request.body ?? {});
        if (
            Object.keys(input).some((key) => !['approvalId', 'confirm'].includes(key)) ||
            (input.confirm !== undefined && typeof input.confirm !== 'boolean') ||
            (input.approvalId !== undefined && typeof input.approvalId !== 'string')
        )
            throw new HttpError(400, 'Provide an approvalId or a browser confirmation.');
        const identity = actor.identity;
        if (input.confirm) await human(request);
        if (!input.confirm && !entry.agentMayRead && !input.approvalId) {
            const retry = await limits.consume(`credential-reveal:${owner}`, 30);
            if (retry)
                throw new HttpError(
                    429,
                    'Reveal request limit reached. Try again in a minute.',
                    retry,
                );
            const prepared = await review.prepare(request, {
                question: `Allow ${identity.keyName ?? identity.username} to reveal “${entry.name}”?`,
                details: `Site: ${entry.url}\nUsername: ${entry.username}\nThis approval permits one password reveal.`,
                options: ['Approve', 'Reject'],
            });
            prepared.credential = {
                id: entry.id,
                version: entry.version,
                requesterId: identity.userId,
            };
            const approval = await review.submit(prepared);
            return reply
                .code(202)
                .send({
                    status: 'awaitingApproval',
                    approvalId: approval.id,
                    answerUrl: approval.answerUrl,
                });
        }
        let approvalId: string | undefined;
        if (!input.confirm && !entry.agentMayRead) {
            const approval = await approvals.get(owner, String(input.approvalId));
            if (
                !approval ||
                approval.credential?.id !== entry.id ||
                approval.credential.version !== entry.version ||
                approval.credential.requesterId !== identity.userId ||
                approval.keyId !== identity.keyId
            )
                throw new HttpError(
                    403,
                    'This approval does not authorize this credential and caller.',
                );
            if (approval.status === 'pending')
                return reply
                    .code(202)
                    .send({
                        status: 'awaitingApproval',
                        approvalId: approval.id,
                        answerUrl: `${access.origin}/approve/?id=${approval.id}`,
                    });
            if (approval.status !== 'answered' || approval.answer !== 'Approve')
                throw new HttpError(403, 'The credential reveal was rejected or expired.');
            approvalId = approval.id;
        }
        const retry = await limits.consume(`credential-reveal:${owner}`, 30);
        if (retry)
            throw new HttpError(429, 'Reveal request limit reached. Try again in a minute.', retry);
        const secrets = decrypt(entry, owner);
        if (approvalId && !(await approvals.consume(owner, approvalId)))
            throw new HttpError(
                409,
                'This approval was already used or expired. Request a new reveal.',
            );
        await activity.record(owner, {
            at: new Date().toISOString(),
            tool: 'reveal_credential',
            resourceId: entry.id,
            ok: true,
            durationMs: 0,
            userId: identity.userId,
            ...(identity.keyId ? { keyId: identity.keyId, agentName: identity.keyName } : {}),
        });
        return { status: 'revealed', id: entry.id, ...secrets };
    });
}
