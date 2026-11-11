import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
    describeLimit,
    plans,
    type UsageItem,
    type UsageKey,
    type UsageResponse,
} from '@kivel.io/tools/plans';
import type { Access } from './access.js';
import type { AgentRepository } from './agents.js';
import type { ApprovalRepository } from './approvals.js';
import type { AuthenticatorRepository } from './authenticators.js';
import type { CredentialRepository } from './credentials.js';
import type { EmailAddressRepository } from './email-addresses.js';
import type { EmailSendingRepository } from './email-sending-store.js';
import type { InboxRepository } from './inboxes.js';
import type { MemoryRepository } from './kv.js';
import type { MonitorRepository } from './monitors.js';
import type { ResourceRepository } from './resources.js';

type Counts = Record<Exclude<UsageKey, 'tools.runs'>, number>;
interface UsageStores {
    agents: AgentRepository;
    approvals: ApprovalRepository;
    authenticators: AuthenticatorRepository;
    credentials: CredentialRepository;
    addresses: EmailAddressRepository;
    sending: EmailSendingRepository;
    inboxes: InboxRepository;
    memory: MemoryRepository;
    monitors: MonitorRepository;
    resources: ResourceRepository;
}

async function postgresCounts(
    pool: Pool,
    owner: string,
    now: Date,
    since: Date,
    day: Date,
    month: Date,
): Promise<Counts> {
    const { rows } = await pool.query<Record<keyof Counts, string | number>>(
        `WITH active_resources AS (
             SELECT kind, payload, stored_bytes FROM temporary_resources WHERE owner_id = $1 AND expires_at > $2
         ), active_webhooks AS (
             SELECT stored_bytes FROM inboxes WHERE owner_id = $1 AND expires_at > $2
         ), sent AS (
             SELECT created_at, jsonb_array_length(job->'recipients') AS recipients
             FROM email_send_jobs WHERE owner_id = $1 AND created_at >= $5 AND job->>'status' != 'failed'
         )
         SELECT
             (SELECT count(*) FROM active_resources) + (SELECT count(*) FROM active_webhooks) AS "resources.active",
             COALESCE((SELECT sum(stored_bytes) FROM active_resources), 0) + COALESCE((SELECT sum(stored_bytes) FROM active_webhooks), 0) AS "resources.storage",
             (SELECT count(*) FROM agents a JOIN api_keys k ON k.id = a.key_id AND k.account_id = a.account_id
                 WHERE a.account_id = $1 AND k.revoked_at IS NULL AND k.expires_at > $2) AS "agents.connected",
             (SELECT count(*) FROM monitors WHERE account_id = $1) AS "monitors.active",
             COALESCE((SELECT sum(bytes) FROM kv_entries WHERE account_id = $1 AND namespace NOT LIKE '$%' AND (expires_at IS NULL OR expires_at > $2)), 0) AS "memory.bytes",
             (SELECT count(*) FROM kv_entries WHERE account_id = $1 AND namespace = '$authenticators') AS "authenticators.entries",
             (SELECT count(*) FROM kv_entries WHERE account_id = $1 AND namespace = '$credentials') AS "vault.entries",
             (SELECT count(*) FROM email_addresses WHERE owner_id = $1 AND retired_at IS NULL AND paused_at IS NULL AND (expires_at IS NULL OR expires_at > $2)) AS "email.inboxes",
             COALESCE((SELECT sum(recipients) FROM sent WHERE created_at >= $4), 0) AS "email.sent_today",
             COALESCE((SELECT sum(recipients) FROM sent), 0) AS "email.sent_month",
             (SELECT count(*) FROM approvals WHERE account_id = $1 AND created_at > $3) AS "approvals.questions",
             (SELECT count(*) FROM active_resources WHERE kind = 'mock' AND payload::jsonb ? 'oauth') AS "mocks.oauth"`,
        [owner, now, since, day, month],
    );
    return Object.fromEntries(
        Object.entries(rows[0]!).map(([key, value]) => [key, Number(value)]),
    ) as Counts;
}

async function memoryCounts(
    access: Access,
    stores: UsageStores,
    owner: string,
    now: Date,
    since: Date,
): Promise<Counts> {
    const [
        webhooks,
        resources,
        agents,
        keys,
        monitors,
        memory,
        authenticators,
        vault,
        email,
        sent,
        approvals,
    ] = await Promise.all([
        stores.inboxes.listOwned(owner),
        stores.resources.listOwned(owner),
        stores.agents.agents(owner),
        access.identities.accountKeys(owner),
        stores.monitors.count(owner),
        stores.memory.usage(owner),
        stores.authenticators.list(owner),
        stores.credentials.list(owner),
        stores.addresses.list(owner),
        stores.sending.withOwner(owner, async (session) =>
            Promise.all([session.usage(), session.usage('month')]),
        ),
        stores.approvals.countSince(owner, since.toISOString()),
    ]);
    const activeKeys = new Set(keys.map((key) => key.id));
    return {
        'resources.active': webhooks.length + resources.length,
        'resources.storage': [...webhooks, ...resources].reduce(
            (total, row) => total + row.storedBytes,
            0,
        ),
        'agents.connected': agents.filter((agent) => activeKeys.has(agent.keyId)).length,
        'monitors.active': monitors,
        'memory.bytes': memory,
        'authenticators.entries': authenticators.length,
        'vault.entries': vault.length,
        'email.inboxes': email.filter(
            (row) => !row.pausedAt && (!row.expiresAt || Date.parse(row.expiresAt) > now.getTime()),
        ).length,
        'email.sent_today': sent[0],
        'email.sent_month': sent[1],
        'approvals.questions': approvals,
        'mocks.oauth': resources.filter((row) => row.kind === 'mock' && row.payload.oauth).length,
    };
}

export function registerWorkspaceUsage(
    app: FastifyInstance,
    access: Access,
    stores: UsageStores,
    pool?: Pool,
) {
    app.get('/api/usage', async (request): Promise<UsageResponse> => {
        const actor = await access.actor(request);
        const limits = plans[actor.plan];
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const end = new Date(start.getTime() + 86400000).toISOString();
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const nextMonth = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ).toISOString();
        const since = new Date(now.getTime() - 86400000);
        const owner = actor.identity?.keyScopes.includes('account:read')
            ? actor.identity.account.id
            : undefined;
        const [runsToday, counts] = await Promise.all([
            access.identities.runUsage(actor.quotaKey),
            owner &&
                (pool
                    ? postgresCounts(pool, owner, now, since, start, month)
                    : memoryCounts(access, stores, owner, now, since)),
        ]);
        const items: UsageItem[] = [];
        function add(key: UsageKey, used: number, resetsAt?: string) {
            const { label, unit, max } = describeLimit(key);
            items.push({
                key,
                label,
                unit,
                used,
                max: max(actor.plan),
                ...(resetsAt ? { resetsAt } : {}),
            });
        }
        add('tools.runs', runsToday, end);
        if (counts) {
            add('resources.active', counts['resources.active']);
            add('resources.storage', counts['resources.storage']);
            add('agents.connected', counts['agents.connected']);
            add('monitors.active', counts['monitors.active']);
            add('memory.bytes', counts['memory.bytes']);
            add('authenticators.entries', counts['authenticators.entries']);
            add('vault.entries', counts['vault.entries']);
            add('email.inboxes', counts['email.inboxes']);
            add('email.sent_today', counts['email.sent_today'], end);
            add('email.sent_month', counts['email.sent_month'], nextMonth);
            add('approvals.questions', counts['approvals.questions']);
            add('mocks.oauth', counts['mocks.oauth']);
        }
        return {
            plan: actor.plan,
            limits,
            runsToday,
            resetsAt: end,
            period: { start: start.toISOString(), end },
            items,
        };
    });
}
