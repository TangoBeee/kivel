import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    randomInt,
    randomUUID,
} from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { plans } from '@socket-help/tools/plans';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import { effectivePlan } from './identity.js';
import type { Identity, IdentityRepository } from './identity.js';
import type { MailSender } from './mail.js';
import type { RateLimitRepository } from './rate-limit.js';
import { isUuid } from './security.js';

export const LOGIN_TTL_MS = 15 * 60 * 1000;
export const TRIAL_TTL_MS = 72 * 60 * 60 * 1000;
export const TRIALS_PER_NETWORK = 3;
const AGENT_KEY_DAYS = 365;
// No vowels or look-alike characters, so codes are easy to read aloud and never spell words.
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

export interface AgentLogin {
    id: string;
    deviceHash: string;
    userCode: string;
    name: string;
    client?: string;
    status: 'pending' | 'approved' | 'denied' | 'delivered';
    accountId?: string;
    sealedKey?: string | undefined;
    createdAt: string;
    expiresAt: string;
}
/** An agent is an API key that a workspace owner approved for a named agent. */
export interface AgentRecord {
    keyId: string;
    accountId: string;
    name: string;
    client?: string;
    createdAt: string;
}

/** An unclaimed agent: anonymous limits, a stable identity and a pending claim login. */
export interface AgentTrial {
    id: string;
    tokenHash: string;
    loginId: string;
    ipKey: string;
    name: string;
    createdAt: string;
    expiresAt: string;
}

type MaybePromise<T> = T | Promise<T>;
export interface AgentRepository {
    createTrial(trial: AgentTrial): MaybePromise<void>;
    trialByToken(tokenHash: string): MaybePromise<AgentTrial | undefined>;
    /** Trials started from one network in the last 24 hours. */
    recentTrials(ipKey: string): MaybePromise<number>;
    createLogin(login: AgentLogin): MaybePromise<void>;
    loginById(id: string): MaybePromise<AgentLogin | undefined>;
    loginByCode(userCode: string): MaybePromise<AgentLogin | undefined>;
    loginByDevice(deviceHash: string): MaybePromise<AgentLogin | undefined>;
    /** Moves a pending login to a final state; false when it was no longer pending. */
    settle(
        id: string,
        patch: Partial<AgentLogin>,
        from?: AgentLogin['status'],
    ): MaybePromise<boolean>;
    addAgent(agent: AgentRecord): MaybePromise<void>;
    agents(accountId: string): MaybePromise<AgentRecord[]>;
    removeAgent(accountId: string, keyId: string): MaybePromise<void>;
    deleteExpired(): MaybePromise<void>;
}

export class MemoryAgents implements AgentRepository {
    private readonly logins = new Map<string, AgentLogin>();
    private readonly list = new Map<string, AgentRecord>();
    private readonly trials = new Map<string, AgentTrial>();
    createTrial(trial: AgentTrial) {
        this.trials.set(trial.id, { ...trial });
    }
    trialByToken(tokenHash: string) {
        const trial = [...this.trials.values()].find((item) => item.tokenHash === tokenHash);
        return trial && Date.parse(trial.expiresAt) > Date.now() ? { ...trial } : undefined;
    }
    recentTrials(ipKey: string) {
        const since = Date.now() - 86400000;
        return [...this.trials.values()].filter(
            (trial) => trial.ipKey === ipKey && Date.parse(trial.createdAt) > since,
        ).length;
    }
    createLogin(login: AgentLogin) {
        this.logins.set(login.id, { ...login });
    }
    loginById(id: string) {
        const login = this.logins.get(id);
        return login ? { ...login } : undefined;
    }
    loginByCode(userCode: string) {
        const login = [...this.logins.values()].find((item) => item.userCode === userCode);
        return login ? { ...login } : undefined;
    }
    loginByDevice(deviceHash: string) {
        const login = [...this.logins.values()].find((item) => item.deviceHash === deviceHash);
        return login ? { ...login } : undefined;
    }
    settle(id: string, patch: Partial<AgentLogin>, from: AgentLogin['status'] = 'pending') {
        const login = this.logins.get(id);
        if (!login || login.status !== from) return false;
        Object.assign(login, patch);
        if (patch.sealedKey === undefined && 'sealedKey' in patch) delete login.sealedKey;
        return true;
    }
    addAgent(agent: AgentRecord) {
        this.list.set(agent.keyId, { ...agent });
    }
    agents(accountId: string) {
        return [...this.list.values()].filter((agent) => agent.accountId === accountId);
    }
    removeAgent(accountId: string, keyId: string) {
        if (this.list.get(keyId)?.accountId === accountId) this.list.delete(keyId);
    }
    deleteExpired() {
        const now = Date.now();
        for (const [id, login] of this.logins)
            if (Date.parse(login.expiresAt) + LOGIN_TTL_MS < now) this.logins.delete(id);
        for (const [id, trial] of this.trials)
            if (Date.parse(trial.createdAt) + 86400000 < now && Date.parse(trial.expiresAt) < now)
                this.trials.delete(id);
    }
}

interface LoginRow {
    id: string;
    device_hash: string;
    user_code: string;
    name: string;
    client: string | null;
    status: AgentLogin['status'];
    account_id: string | null;
    sealed_key: string | null;
    created_at: Date;
    expires_at: Date;
}
const loginFromRow = (row: LoginRow): AgentLogin => ({
    id: row.id,
    deviceHash: row.device_hash,
    userCode: row.user_code,
    name: row.name,
    ...(row.client ? { client: row.client } : {}),
    status: row.status,
    ...(row.account_id ? { accountId: row.account_id } : {}),
    ...(row.sealed_key ? { sealedKey: row.sealed_key } : {}),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
});

export class PostgresAgents implements AgentRepository {
    constructor(private readonly pool: Pool) {}
    async createTrial(trial: AgentTrial) {
        await this.pool.query(
            'INSERT INTO agent_trials (id, token_hash, login_id, ip_key, name, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [
                trial.id,
                trial.tokenHash,
                trial.loginId,
                trial.ipKey,
                trial.name,
                trial.createdAt,
                trial.expiresAt,
            ],
        );
    }
    async trialByToken(tokenHash: string) {
        const result = await this.pool.query(
            'SELECT * FROM agent_trials WHERE token_hash = $1 AND expires_at > clock_timestamp()',
            [tokenHash],
        );
        const row = result.rows[0];
        return row
            ? {
                  id: row.id,
                  tokenHash: row.token_hash,
                  loginId: row.login_id,
                  ipKey: row.ip_key,
                  name: row.name,
                  createdAt: row.created_at.toISOString(),
                  expiresAt: row.expires_at.toISOString(),
              }
            : undefined;
    }
    async recentTrials(ipKey: string) {
        const result = await this.pool.query<{ count: string }>(
            "SELECT count(*) FROM agent_trials WHERE ip_key = $1 AND created_at > clock_timestamp() - interval '1 day'",
            [ipKey],
        );
        return Number(result.rows[0]!.count);
    }
    async createLogin(login: AgentLogin) {
        await this.pool.query(
            'INSERT INTO agent_logins (id, device_hash, user_code, name, client, status, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [
                login.id,
                login.deviceHash,
                login.userCode,
                login.name,
                login.client ?? null,
                login.status,
                login.createdAt,
                login.expiresAt,
            ],
        );
    }
    async loginById(id: string) {
        const result = await this.pool.query<LoginRow>('SELECT * FROM agent_logins WHERE id = $1', [
            id,
        ]);
        return result.rows[0] ? loginFromRow(result.rows[0]) : undefined;
    }
    async loginByCode(userCode: string) {
        const result = await this.pool.query<LoginRow>(
            'SELECT * FROM agent_logins WHERE user_code = $1',
            [userCode],
        );
        return result.rows[0] ? loginFromRow(result.rows[0]) : undefined;
    }
    async loginByDevice(deviceHash: string) {
        const result = await this.pool.query<LoginRow>(
            'SELECT * FROM agent_logins WHERE device_hash = $1',
            [deviceHash],
        );
        return result.rows[0] ? loginFromRow(result.rows[0]) : undefined;
    }
    async settle(id: string, patch: Partial<AgentLogin>, from: AgentLogin['status'] = 'pending') {
        const result = await this.pool.query(
            `UPDATE agent_logins SET status = COALESCE($3, status), account_id = COALESCE($4, account_id),
                sealed_key = CASE WHEN $5 THEN $6 ELSE sealed_key END
             WHERE id = $1 AND status = $2`,
            [
                id,
                from,
                patch.status ?? null,
                patch.accountId ?? null,
                'sealedKey' in patch,
                patch.sealedKey ?? null,
            ],
        );
        return result.rowCount === 1;
    }
    async addAgent(agent: AgentRecord) {
        await this.pool.query(
            'INSERT INTO agents (key_id, account_id, name, client, created_at) VALUES ($1, $2, $3, $4, $5)',
            [agent.keyId, agent.accountId, agent.name, agent.client ?? null, agent.createdAt],
        );
    }
    async agents(accountId: string) {
        const result = await this.pool.query(
            'SELECT key_id, account_id, name, client, created_at FROM agents WHERE account_id = $1 ORDER BY created_at',
            [accountId],
        );
        return result.rows.map((row) => ({
            keyId: row.key_id,
            accountId: row.account_id,
            name: row.name,
            ...(row.client ? { client: row.client } : {}),
            createdAt: row.created_at.toISOString(),
        }));
    }
    async removeAgent(accountId: string, keyId: string) {
        await this.pool.query('DELETE FROM agents WHERE account_id = $1 AND key_id = $2', [
            accountId,
            keyId,
        ]);
    }
    async deleteExpired() {
        // Trials keep their row for a day after creation so the per-network daily cap still counts them.
        await this.pool.query(
            "DELETE FROM agent_trials WHERE expires_at < clock_timestamp() AND created_at < clock_timestamp() - interval '1 day'",
        );
        await this.pool.query(
            "DELETE FROM agent_logins WHERE expires_at < clock_timestamp() - interval '15 minutes' AND id NOT IN (SELECT login_id FROM agent_trials)",
        );
    }
}

const hash = (label: string, secret: string) =>
    createHash('sha256').update(`${label}:${secret}`).digest();

// An approved key waits for its agent encrypted with AES-GCM, so the database alone never holds a
// usable key. Delivery also requires the device code, which only the agent that started knows.
function seal(deviceCode: string, apiKey: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', hash('seal', deviceCode), iv);
    const body = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function unseal(deviceCode: string, sealed: string) {
    const data = Buffer.from(sealed, 'base64');
    const decipher = createDecipheriv(
        'aes-256-gcm',
        hash('seal', deviceCode),
        data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
function userCode() {
    const pick = () =>
        Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    return `${pick()}-${pick()}`;
}
const normalizeCode = (value: string) => {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : '';
};
const label = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim()
        ? value
              .trim()
              .replace(/[\u0000-\u001f]/g, '')
              .slice(0, 60)
        : fallback;

export interface AgentContext {
    app: FastifyInstance;
    access: Access;
    identities: IdentityRepository;
    agents: AgentRepository;
    origin: string;
    limits: RateLimitRepository;
    mail?: MailSender;
}

/** Active agents of a workspace with their key's last use, newest first. */
async function workspaceAgents(
    identities: IdentityRepository,
    agents: AgentRepository,
    accountId: string,
) {
    const keys = new Map((await identities.accountKeys(accountId)).map((key) => [key.id, key]));
    return (await agents.agents(accountId))
        .filter((agent) => keys.has(agent.keyId))
        .map((agent) => ({
            id: agent.keyId,
            name: agent.name,
            ...(agent.client ? { client: agent.client } : {}),
            createdAt: agent.createdAt,
            lastUsedAt: keys.get(agent.keyId)!.lastUsedAt,
            prefix: keys.get(agent.keyId)!.prefix,
        }))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function registerAgents({
    app,
    access,
    identities,
    agents,
    origin,
    limits,
    mail,
}: AgentContext) {
    access.trials = async (token) => {
        const trial = await agents.trialByToken(hash('trial', token).toString('hex'));
        if (!trial) return undefined;
        const login = await agents.loginById(trial.loginId);
        return {
            id: trial.id,
            ...(login ? { claimUrl: `${origin}/link/?code=${login.userCode}` } : {}),
        };
    };
    const manager = (identity: Identity) => {
        if (identity.role !== 'owner' && identity.role !== 'admin')
            throw new HttpError(403, 'Only workspace owners and admins can manage agents.');
    };
    const pending = async (code: string) => {
        const login = await agents.loginByCode(normalizeCode(code));
        if (!login)
            throw new HttpError(404, 'This code is not valid. Ask your agent for a new one.');
        if (Date.parse(login.expiresAt) <= Date.now())
            throw new HttpError(410, 'This code expired. Ask your agent to start again.');
        return login;
    };

    // Step 1 (agent, no account needed): ask to join a workspace.
    app.post(
        '/api/agents/login',
        {
            onRequest: async (request) => {
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            const body = (request.body ?? {}) as { name?: unknown; client?: unknown };
            const deviceCode = randomBytes(32).toString('base64url');
            const now = Date.now();
            const login: AgentLogin = {
                id: randomUUID(),
                deviceHash: hash('device', deviceCode).toString('hex'),
                userCode: userCode(),
                name: label(body.name, 'AI agent'),
                ...(typeof body.client === 'string' && body.client.trim()
                    ? { client: label(body.client, '') }
                    : {}),
                status: 'pending',
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + LOGIN_TTL_MS).toISOString(),
            };
            await agents.createLogin(login);
            const link = `${origin}/link/?code=${login.userCode}`;
            return reply.code(201).send({
                userCode: login.userCode,
                verificationUrl: link,
                deviceCode,
                expiresAt: login.expiresAt,
                interval: 3,
                instructions: `Ask your human to open ${link} and approve "${login.name}". Then call POST /api/agents/token with the deviceCode every few seconds until it returns your API key. Never ask the human to paste a key into the chat.`,
            });
        },
    );

    // No human around: a 72-hour trial with anonymous limits, plus a claim link for later.
    app.post(
        '/api/agents/trial',
        {
            onRequest: async (request) => {
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            const body = (request.body ?? {}) as {
                name?: unknown;
                client?: unknown;
                humanEmail?: unknown;
            };
            const network = await access.actor(request);
            if (network.identity || network.trialId)
                throw new HttpError(
                    400,
                    'You already have a key. Trials are for agents without one.',
                );
            if ((await agents.recentTrials(network.quotaKey)) >= TRIALS_PER_NETWORK)
                throw new HttpError(
                    429,
                    'This network started 3 trials today. Ask your human to connect you with POST /api/agents/login instead.',
                );
            const humanEmail =
                typeof body.humanEmail === 'string' &&
                /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(body.humanEmail.trim())
                    ? body.humanEmail.trim().toLowerCase()
                    : undefined;
            const now = Date.now();
            const deviceCode = randomBytes(32).toString('base64url');
            const trialKey = `sht_${randomBytes(32).toString('base64url')}`;
            const login: AgentLogin = {
                id: randomUUID(),
                deviceHash: hash('device', deviceCode).toString('hex'),
                userCode: userCode(),
                name: label(body.name, 'AI agent'),
                ...(typeof body.client === 'string' && body.client.trim()
                    ? { client: label(body.client, '') }
                    : {}),
                status: 'pending',
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + TRIAL_TTL_MS).toISOString(),
            };
            await agents.createLogin(login);
            await agents.createTrial({
                id: randomUUID(),
                tokenHash: hash('trial', trialKey).toString('hex'),
                loginId: login.id,
                ipKey: network.quotaKey,
                name: login.name,
                createdAt: login.createdAt,
                expiresAt: login.expiresAt,
            });
            const claimUrl = `${origin}/link/?code=${login.userCode}`;
            let notified = false;
            // One notice per address per minute, so the trial endpoint cannot be used to spam people.
            if (humanEmail && mail && !(await limits.consume(`trial-mail:${humanEmail}`, 1))) {
                await mail
                    .send({
                        to: humanEmail,
                        subject: `An AI agent wants to use socket.help for you`,
                        text: `An AI agent called "${login.name}" started a socket.help trial and listed this address as its human.\n\nTo keep it, open ${claimUrl} and approve it within 72 hours. If you do not know this agent, ignore this email; the trial ends on its own and nothing is charged.\n`,
                    })
                    .then(() => {
                        notified = true;
                    })
                    .catch(() => request.log.warn('Trial notice email failed.'));
            }
            return reply.code(201).send({
                trialKey,
                expiresAt: login.expiresAt,
                limits: 'Anonymous limits: 5 resources, 1 hour retention, 100 tool runs a day. Workspace features need an approved workspace key. Ask your human to open the claim link.',
                claim: {
                    userCode: login.userCode,
                    claimUrl,
                    deviceCode,
                    humanNotified: notified,
                },
                instructions: `Use the trialKey as "Authorization: Bearer <trialKey>" now. To keep working after 72 hours, give your human ${claimUrl}. After they approve, POST /api/agents/token with the deviceCode returns your permanent API key.`,
            });
        },
    );

    // Step 2 (human, signed in): see what is asking and the workspace's room for agents.
    app.get<{ Params: { code: string } }>('/api/agents/login/:code', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        const login = await pending(request.params.code);
        const plan = effectivePlan(identity.account);
        return {
            name: login.name,
            ...(login.client ? { client: login.client } : {}),
            status: login.status,
            createdAt: login.createdAt,
            expiresAt: login.expiresAt,
            workspace: { name: identity.account.name, plan },
            canApprove: identity.role === 'owner' || identity.role === 'admin',
            agents: await workspaceAgents(identities, agents, identity.account.id),
            limit: plans[plan].agents,
        };
    });

    app.post<{ Params: { code: string } }>('/api/agents/login/:code/approve', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        manager(identity);
        const login = await pending(request.params.code);
        if (login.status !== 'pending')
            throw new HttpError(409, 'This request was already answered.');
        const plan = effectivePlan(identity.account);
        const limit = plans[plan].agents;
        const body = (request.body ?? {}) as { replaceAgentId?: unknown };
        const current = await workspaceAgents(identities, agents, identity.account.id);
        if (current.length >= limit) {
            const replace = typeof body.replaceAgentId === 'string' ? body.replaceAgentId : '';
            if (!current.some((agent) => agent.id === replace))
                throw new HttpError(
                    409,
                    `Your ${plan === 'free' ? 'Free' : plan} plan includes ${limit} agents. Replace one or upgrade.`,
                );
            await identities.revokeAccountKey(identity.account.id, replace);
            await agents.removeAgent(identity.account.id, replace);
        }
        const created = await identities.createKey(
            identity,
            `Agent: ${login.name}`.slice(0, 80),
            identity.keyScopes,
            new Date(Date.now() + AGENT_KEY_DAYS * 86400000).toISOString(),
        );
        const sealed = sealForLogin(login, created.key);
        if (
            !(await agents.settle(login.id, {
                status: 'approved',
                accountId: identity.account.id,
                sealedKey: sealed,
            }))
        ) {
            await identities.revokeAccountKey(identity.account.id, created.info.id);
            throw new HttpError(409, 'This request was already answered.');
        }
        await agents.addAgent({
            keyId: created.info.id,
            accountId: identity.account.id,
            name: login.name,
            ...(login.client ? { client: login.client } : {}),
            createdAt: new Date().toISOString(),
        });
        return { approved: true, agentId: created.info.id };
    });

    app.post<{ Params: { code: string } }>('/api/agents/login/:code/deny', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        manager(identity);
        const login = await pending(request.params.code);
        if (!(await agents.settle(login.id, { status: 'denied' })))
            throw new HttpError(409, 'This request was already answered.');
        return { denied: true };
    });

    // Step 3 (agent): poll with the secret device code until the human answers.
    app.post('/api/agents/token', async (request, reply) => {
        const body = (request.body ?? {}) as { deviceCode?: unknown };
        const deviceCode = typeof body.deviceCode === 'string' ? body.deviceCode : '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(deviceCode))
            throw new HttpError(400, 'Send the deviceCode from POST /api/agents/login.');
        const login = await agents.loginByDevice(hash('device', deviceCode).toString('hex'));
        if (!login) throw new HttpError(404, 'Unknown deviceCode. Start a new login.');
        if (login.status === 'denied')
            return reply
                .code(403)
                .send({ status: 'denied', error: 'Your human denied this request.' });
        if (login.status === 'delivered')
            return reply.code(410).send({
                status: 'used',
                error: 'The key was already delivered. Start a new login if you lost it.',
            });
        if (login.status === 'pending') {
            if (Date.parse(login.expiresAt) <= Date.now())
                return reply
                    .code(410)
                    .send({ status: 'expired', error: 'The code expired. Start a new login.' });
            return reply.code(202).send({ status: 'pending', interval: 3 });
        }
        const apiKey = unsealForLogin(login, deviceCode);
        if (
            !(await agents.settle(
                login.id,
                { status: 'delivered', sealedKey: undefined },
                'approved',
            ))
        )
            return reply
                .code(410)
                .send({ status: 'used', error: 'The key was already delivered.' });
        return {
            status: 'approved',
            apiKey,
            mcp: { url: `${origin}/mcp`, header: `Authorization: Bearer ${apiKey}` },
            next: 'Store the key in your MCP client config or an environment variable such as SOCKET_HELP_API_KEY. Do not print it in chat.',
        };
    });

    // The workspace's agents, for the dashboard and for agents that want to see their peers.
    app.get('/api/agents', async (request) => {
        const identity = await access.require(request, 'account:read');
        const plan = effectivePlan(identity.account);
        return {
            agents: await workspaceAgents(identities, agents, identity.account.id),
            limit: plans[plan].agents,
        };
    });
    app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
        const identity = await access.require(request, 'account:read', true);
        manager(identity);
        if (!isUuid(request.params.id)) throw new HttpError(404, 'Agent not found.');
        const known = (await agents.agents(identity.account.id)).some(
            (agent) => agent.keyId === request.params.id,
        );
        if (!known) throw new HttpError(404, 'Agent not found.');
        await identities.revokeAccountKey(identity.account.id, request.params.id);
        await agents.removeAgent(identity.account.id, request.params.id);
        return reply.code(204).send();
    });
}

// The approving request never sees the device code, so the sealing key comes from the stored device
// hash plus a server secret (set from AUTH_SECRET); delivery checks the device code first.
let pepper = randomBytes(32);
export function setAgentPepper(secret: string) {
    pepper = createHash('sha256').update(`agents:${secret}`).digest();
}
function sealForLogin(login: AgentLogin, apiKey: string) {
    return seal(`${pepper.toString('hex')}:${login.deviceHash}`, apiKey);
}
function unsealForLogin(login: AgentLogin, deviceCode: string) {
    if (hash('device', deviceCode).toString('hex') !== login.deviceHash)
        throw new HttpError(403, 'This deviceCode does not match the login.');
    return unseal(`${pepper.toString('hex')}:${login.deviceHash}`, login.sealedKey ?? '');
}
