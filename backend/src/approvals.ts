import { plans, type PlanId } from '@kivel.io/tools/plans';
import { checkLimit } from './errors.js';
import { transaction } from './database.js';
import { validateEmailContent } from './email-sending.js';
import type { EmailContent } from './email-sending.js';
import { requireWorkspace } from './access.js';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import type { AgentRepository } from './agents.js';
import { effectivePlan } from './identity.js';
import type { IdentityRepository } from './identity.js';
import type { MailSender } from './mail.js';
import type { RecoveryRepository } from './recovery-store.js';
import type { ResourceRepository } from './resources.js';
import { isUuid } from './security.js';
import { ApprovalNotifications } from './approval-notifications.js';
import type { ForwardSend } from './forwarding.js';
import type { Waiters } from './waiting.js';
import { waitSeconds } from './waiting.js';

export interface Approval {
    id: string;
    accountId: string;
    keyId?: string;
    requesterId?: string;
    idempotency?: { key: string; digest: string };
    action?: { type: string; target: string; summary?: string };
    agentName: string;
    question: string;
    details?: string;
    options: string[];
    status: 'pending' | 'answered' | 'expired';
    emailDraft?: { id: string };
    editedEmail?: EmailContent;
    credential?: { id: string; version: string; requesterId: string };
    walletPayment?: {
        walletId: string;
        transactionId: string;
        version: string;
        requesterId: string;
    };
    consumedAt?: string;
    answer?: string;
    note?: string;
    answeredBy?: string;
    answeredById?: string;
    createdAt: string;
    expiresAt: string;
    answeredAt?: string;
}

type MaybePromise<T> = T | Promise<T>;
type ApprovalFilter = {
    status?: Approval['status'];
    agent?: string;
    outcome?: string;
    before?: Pick<Approval, 'id' | 'createdAt'>;
    limit?: number;
};
type Answer = {
    answer: string;
    note?: string;
    answeredBy: string;
    answeredById?: string;
    editedEmail?: EmailContent;
};
type QueueDraft = (client?: PoolClient) => Promise<boolean>;
const alreadySubmitted = () =>
    new HttpError(409, 'This draft was already submitted. Check its status.');
export interface ApprovalRepository {
    create(
        approval: Approval,
        plan: PlanId,
        queueDraft?: QueueDraft,
    ): MaybePromise<boolean | Approval>;
    get(accountId: string, id: string): MaybePromise<Approval | undefined>;
    list(
        accountId: string,
        pendingOnly: boolean,
        filter?: ApprovalFilter,
    ): MaybePromise<Approval[]>;
    countSince(accountId: string, since: string): MaybePromise<number>;
    quotaRetryAfter(accountId: string, maximum: number): MaybePromise<number>;
    pruneDraftEdits(resources: ResourceRepository): MaybePromise<void>;
    consume(accountId: string, id: string): MaybePromise<boolean>;
    /** Records an answer only while the request is still pending and unexpired. */
    answer(accountId: string, id: string, answer: Answer): MaybePromise<boolean>;
}

// Expiry is computed on read so a request is never answered after its deadline.
const current = (approval: Approval): Approval =>
    approval.status === 'pending' && Date.parse(approval.expiresAt) <= Date.now()
        ? { ...approval, status: 'expired' }
        : approval;

function replay(approval: Approval, prior: Approval) {
    if (approval.idempotency?.digest !== prior.idempotency?.digest)
        throw new HttpError(
            409,
            'This idempotency key already identifies a different approval request.',
        );
    return current(prior);
}

export class MemoryApprovals implements ApprovalRepository {
    private readonly items = new Map<string, Approval>();
    create(approval: Approval, plan: PlanId, queueDraft?: QueueDraft) {
        if (approval.idempotency) {
            const prior = [...this.items.values()].find(
                (item) =>
                    item.accountId === approval.accountId &&
                    item.idempotency?.key === approval.idempotency?.key,
            );
            if (prior) return replay(approval, prior);
        }
        if (this.items.has(approval.id)) return false;
        const since = new Date(Date.now() - 86400000).toISOString();
        const used = this.countSince(approval.accountId, since);
        const maximum = plans[plan].approvalQuestionsPerDay;
        if (used >= maximum)
            checkLimit(
                plan,
                'approvals.questions',
                used,
                1,
                this.quotaRetryAfter(approval.accountId, maximum) || 1,
            );
        this.items.set(approval.id, { ...approval });
        if (!queueDraft) return true;
        return queueDraft().then(
            (queued) => {
                if (queued) return true;
                this.items.delete(approval.id);
                throw alreadySubmitted();
            },
            (error) => {
                this.items.delete(approval.id);
                throw error;
            },
        );
    }
    get(accountId: string, id: string) {
        const item = this.items.get(id);
        return item?.accountId === accountId ? current({ ...item }) : undefined;
    }
    list(accountId: string, pendingOnly: boolean, filter: ApprovalFilter = {}) {
        const status = pendingOnly ? 'pending' : filter.status;
        const { before } = filter;
        return [...this.items.values()]
            .filter((item) => item.accountId === accountId)
            .map((item) => current({ ...item }))
            .filter(
                (item) =>
                    (!status || item.status === status) &&
                    (!filter.agent || item.agentName === filter.agent) &&
                    (!filter.outcome || item.answer === filter.outcome) &&
                    (!before ||
                        item.createdAt < before.createdAt ||
                        (item.createdAt === before.createdAt && item.id < before.id)),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
            .slice(0, filter.limit ?? 50);
    }
    countSince(accountId: string, since: string) {
        return [...this.items.values()].filter(
            (item) => item.accountId === accountId && item.createdAt > since,
        ).length;
    }
    quotaRetryAfter(accountId: string, maximum: number) {
        const now = Date.now();
        const cutoff = [...this.items.values()]
            .filter(
                (item) =>
                    item.accountId === accountId && Date.parse(item.createdAt) > now - 86400000,
            )
            .map((item) => Date.parse(item.createdAt))
            .sort((left, right) => right - left)[maximum - 1];
        return cutoff === undefined ? 0 : Math.max(1, Math.ceil((cutoff + 86400000 - now) / 1000));
    }
    consume(accountId: string, id: string) {
        const approval = this.items.get(id);
        if (
            !approval ||
            approval.accountId !== accountId ||
            approval.status !== 'answered' ||
            approval.answer !== 'Approve' ||
            approval.consumedAt ||
            Date.parse(approval.expiresAt) <= Date.now()
        )
            return false;
        approval.consumedAt = new Date().toISOString();
        return true;
    }
    async pruneDraftEdits(resources: ResourceRepository) {
        for (const approval of this.items.values()) {
            if (
                approval.editedEmail &&
                !(await resources.peek(approval.emailDraft?.id ?? approval.id, 'job', {
                    ownerId: approval.accountId,
                }))
            )
                delete approval.editedEmail;
        }
    }
    answer(accountId: string, id: string, value: Answer) {
        const item = this.items.get(id);
        if (!item || item.accountId !== accountId || current(item).status !== 'pending')
            return false;
        Object.assign(item, value, { status: 'answered', answeredAt: new Date().toISOString() });
        return true;
    }
}

interface Row {
    id: string;
    account_id: string;
    approval: Approval;
    status: Approval['status'];
    expires_at: Date;
}
const fromRow = (row: Row) => current({ ...row.approval, status: row.status });

export class PostgresApprovals implements ApprovalRepository {
    constructor(private readonly pool: Pool) {}
    create(approval: Approval, plan: PlanId, queueDraft?: QueueDraft) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE', [
                approval.accountId,
            ]);
            if (approval.idempotency) {
                const { rows } = await client.query<Row>(
                    "SELECT * FROM approvals WHERE account_id = $1 AND approval ? 'idempotency' AND approval->'idempotency'->>'key' = $2",
                    [approval.accountId, approval.idempotency.key],
                );
                if (rows[0]) return replay(approval, fromRow(rows[0]));
            }
            if (
                (await client.query('SELECT 1 FROM approvals WHERE id = $1', [approval.id]))
                    .rowCount
            )
                return false;
            const { rows } = await client.query<{ count: string }>(
                "SELECT count(*) FROM approvals WHERE account_id = $1 AND created_at > clock_timestamp() - interval '1 day'",
                [approval.accountId],
            );
            const used = Number(rows[0]!.count);
            const maximum = plans[plan].approvalQuestionsPerDay;
            if (used >= maximum)
                checkLimit(
                    plan,
                    'approvals.questions',
                    used,
                    1,
                    (await this.quotaRetryAfter(approval.accountId, maximum, client)) || 1,
                );
            const result = await client.query(
                'INSERT INTO approvals (id, account_id, approval, status, created_at, expires_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [
                    approval.id,
                    approval.accountId,
                    JSON.stringify(approval),
                    approval.status,
                    approval.createdAt,
                    approval.expiresAt,
                ],
            );
            const created = result.rowCount === 1;
            if (created && queueDraft && !(await queueDraft(client))) throw alreadySubmitted();
            return created;
        });
    }
    async get(accountId: string, id: string) {
        if (!isUuid(id)) return undefined;
        const result = await this.pool.query<Row>(
            'SELECT * FROM approvals WHERE account_id = $1 AND id = $2',
            [accountId, id],
        );
        return result.rows[0] ? fromRow(result.rows[0]) : undefined;
    }
    async list(accountId: string, pendingOnly: boolean, filter: ApprovalFilter = {}) {
        const status = pendingOnly ? 'pending' : filter.status;
        const { rows } = await this.pool.query<Row>(
            `SELECT * FROM approvals WHERE account_id = $1
             AND ($2::text IS NULL OR
                 CASE WHEN status = 'pending' AND expires_at <= clock_timestamp() THEN 'expired' ELSE status END = $2)
             AND ($3::text IS NULL OR approval->>'agentName' = $3)
             AND ($4::text IS NULL OR approval->>'answer' = $4)
             AND ($5::timestamptz IS NULL OR (created_at, id) < ($5::timestamptz, $6::uuid))
             ORDER BY created_at DESC, id DESC LIMIT $7`,
            [
                accountId,
                status ?? null,
                filter.agent ?? null,
                filter.outcome ?? null,
                filter.before?.createdAt ?? null,
                filter.before?.id ?? null,
                filter.limit ?? 50,
            ],
        );
        return rows.map(fromRow);
    }
    async countSince(accountId: string, since: string) {
        const result = await this.pool.query<{ count: string }>(
            'SELECT count(*) FROM approvals WHERE account_id = $1 AND created_at > $2',
            [accountId, since],
        );
        return Number(result.rows[0]!.count);
    }
    async quotaRetryAfter(
        accountId: string,
        maximum: number,
        client: Pick<Pool, 'query'> = this.pool,
    ) {
        const { rows } = await client.query<{ retry_after: number }>(
            `SELECT GREATEST(1, ceil(extract(epoch FROM created_at + interval '24 hours' - clock_timestamp())))::integer AS retry_after
             FROM approvals WHERE account_id = $1 AND created_at > clock_timestamp() - interval '24 hours'
             ORDER BY created_at DESC OFFSET $2 LIMIT 1`,
            [accountId, maximum - 1],
        );
        return rows[0]?.retry_after ?? 0;
    }
    async consume(accountId: string, id: string) {
        if (!isUuid(id)) return false;
        return (
            (
                await this.pool.query(
                    `UPDATE approvals SET approval=approval || jsonb_build_object('consumedAt',clock_timestamp())
             WHERE account_id=$1 AND id=$2 AND status='answered' AND approval->>'answer'='Approve'
             AND NOT approval ? 'consumedAt' AND expires_at > clock_timestamp()`,
                    [accountId, id],
                )
            ).rowCount === 1
        );
    }
    async pruneDraftEdits() {
        await this.pool.query(
            `UPDATE approvals a SET approval = a.approval - 'editedEmail'
             WHERE a.approval ? 'editedEmail' AND NOT EXISTS (
                 SELECT 1 FROM temporary_resources r WHERE r.id = COALESCE((a.approval->'emailDraft'->>'id')::uuid,a.id) AND r.expires_at > clock_timestamp()
             )`,
        );
    }
    async answer(accountId: string, id: string, value: Answer) {
        if (!isUuid(id)) return false;
        const result = await this.pool.query(
            `UPDATE approvals SET status = 'answered',
                approval = approval || jsonb_build_object('answer', $3::text, 'answeredBy', $4::text,
                    'answeredAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                    || CASE WHEN $5::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', $5::text) END
                    || CASE WHEN $6::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('editedEmail', $6::jsonb) END
                    || CASE WHEN $7::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('answeredById', $7::text) END
             WHERE account_id = $1 AND id = $2 AND status = 'pending' AND expires_at > clock_timestamp()`,
            [
                accountId,
                id,
                value.answer,
                value.answeredBy,
                value.note ?? null,
                value.editedEmail ? JSON.stringify(value.editedEmail) : null,
                value.answeredById ?? null,
            ],
        );
        return result.rowCount === 1;
    }
}

const text = (value: unknown, limit: number) =>
    typeof value === 'string'
        ? value
              .trim()
              .replace(/\u0000/g, '')
              .slice(0, limit)
        : '';
const pause = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        });
    });

interface ApprovalContext {
    app: FastifyInstance;
    access: Access;
    approvals: ApprovalRepository;
    agents: AgentRepository;
    identities: IdentityRepository;
    recovery: RecoveryRepository;
    waiters: Waiters;
    mail?: MailSender;
    database?: Pool;
    forwardSend?: ForwardSend;
}

/** Agents ask their human before risky steps; only a signed-in owner or admin can answer. */
export function registerApprovals({
    app,
    access,
    approvals,
    agents,
    identities,
    recovery,
    waiters,
    mail,
    database,
    forwardSend,
}: ApprovalContext) {
    const notifications = new ApprovalNotifications(approvals, database, forwardSend, (id) =>
        access.appUrl(`/approve/?id=${id}`),
    );
    let sending: Promise<void> | undefined;
    const poll = () =>
        (sending ??= notifications
            .tick()
            .catch((error) => {
                app.log.warn({ err: error }, 'Approval notification queue failed.');
            })
            .finally(() => {
                sending = undefined;
            }));
    const timer = setInterval(() => void poll(), 5_000);
    timer.unref();
    app.addHook('onClose', async () => {
        clearInterval(timer);
        await sending;
    });
    const answerUrl = (id: string) => access.appUrl(`/approve/?id=${id}`);
    const view = (approval: Approval) => {
        const {
            accountId: _account,
            keyId: _key,
            requesterId: _requester,
            answeredById: _actor,
            idempotency: _idempotency,
            editedEmail: _edit,
            ...rest
        } = approval;
        return { ...rest, answerUrl: answerUrl(approval.id) };
    };
    async function account(request: FastifyRequest, write = true) {
        const actor = await access.scope(request, write ? 'resources:write' : 'resources:read');
        requireWorkspace(actor);
        return actor;
    }

    async function human(request: FastifyRequest) {
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner' && identity.role !== 'admin')
            throw new HttpError(403, 'This action requires a workspace owner or admin.');
        return identity;
    }
    async function inspect(request: FastifyRequest, id: string) {
        const { identity } = await account(request, false);
        const approval = await approvals.get(identity!.account.id, id);
        if (
            !approval ||
            (identity!.emailInboxId && (!approval.emailDraft || approval.keyId !== identity!.keyId))
        )
            throw new HttpError(404, 'Approval request not found.');
        return approval;
    }

    async function notify(approval: Approval) {
        if (!mail) return false;
        const members = await identities.members(approval.accountId);
        const ownerId = members.find((member) => member.role === 'owner')?.userId;
        const contact = ownerId ? await recovery.status(ownerId) : undefined;
        if (!contact?.email || !contact.verifiedAt) return false;
        try {
            await mail.send({
                to: contact.email,
                subject: `${approval.agentName} is asking: ${approval.question.slice(0, 80)}`,
                text: `${approval.agentName} needs your answer.\n\n${approval.question}\n\nOptions: ${approval.options.join(' / ')}\n\nAnswer here (you will be asked to sign in): ${answerUrl(approval.id)}\n\nThe request expires ${new Date(approval.expiresAt).toUTCString()}.\n`,
            });
            return true;
        } catch {
            app.log.warn({ approval: approval.id }, 'Approval email failed.');
            return false;
        }
    }

    async function prepare(
        request: FastifyRequest,
        body: Record<string, unknown>,
        emailDraft?: { id: string; approvalId?: string; expiresAt?: string },
    ): Promise<Approval> {
        const actor = await account(request);
        const identity = actor.identity!;
        const question = text(body.question, 500);
        if (!question) throw new HttpError(400, 'Ask a question of up to 500 characters.');
        const options = Array.isArray(body.options)
            ? [...new Set(body.options.map((option) => text(option, 60)).filter(Boolean))]
            : ['Approve', 'Deny'];
        if (options.length < 2 || options.length > 5)
            throw new HttpError(400, 'Give between 2 and 5 options, each up to 60 characters.');
        const minutes = body.timeoutMinutes === undefined ? 60 : Number(body.timeoutMinutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
            throw new HttpError(400, 'timeoutMinutes must be between 1 and 1440.');
        const standalone = request.routeOptions.url === '/api/approvals';
        const header = standalone ? request.headers['idempotency-key'] : undefined;
        const idempotencyKey = standalone ? (body.idempotencyKey ?? header) : undefined;
        if (
            header !== undefined &&
            body.idempotencyKey !== undefined &&
            header !== body.idempotencyKey
        )
            throw new HttpError(400, 'Use the same idempotency key in the header and request.');
        if (
            idempotencyKey !== undefined &&
            (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(idempotencyKey))
        )
            throw new HttpError(
                400,
                'Use an idempotency key of 1 to 128 letters, digits, dots, underscores, colons or hyphens.',
            );
        let action: Approval['action'];
        if (body.action !== undefined) {
            const input = body.action as Record<string, unknown> | null;
            if (
                !input ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).some((key) => !['type', 'target', 'summary'].includes(key)) ||
                typeof input.type !== 'string' ||
                !/^[a-zA-Z][a-zA-Z0-9._:-]{0,63}$/.test(input.type) ||
                typeof input.target !== 'string' ||
                !text(input.target, 256) ||
                input.target.length > 256 ||
                (input.summary !== undefined &&
                    (typeof input.summary !== 'string' || input.summary.length > 1000))
            )
                throw new HttpError(
                    400,
                    'Provide an action type, a target up to 256 characters and an optional summary up to 1000 characters.',
                );
            action = {
                type: input.type,
                target: text(input.target, 256),
                ...(input.summary ? { summary: text(input.summary, 1000) } : {}),
            };
        }
        const details = text(body.details, 4000);
        const requesterId = identity.keyId ?? identity.userId;
        const idempotency =
            idempotencyKey === undefined
                ? undefined
                : {
                      key: createHash('sha256')
                          .update(JSON.stringify([requesterId, idempotencyKey]))
                          .digest('hex'),
                      digest: createHash('sha256')
                          .update(JSON.stringify([question, details, options, minutes, action]))
                          .digest('hex'),
                  };
        const retryAfter = idempotency
            ? 0
            : await approvals.quotaRetryAfter(
                  identity.account.id,
                  plans[actor.plan].approvalQuestionsPerDay,
              );
        if (retryAfter) {
            const since = new Date(Date.now() - 86400000).toISOString();
            checkLimit(
                actor.plan,
                'approvals.questions',
                await approvals.countSince(identity.account.id, since),
                1,
                retryAfter,
            );
        }
        const agent = identity.keyId
            ? (await agents.agents(identity.account.id)).find(
                  (item) => item.keyId === identity.keyId,
              )
            : undefined;
        const now = Date.now();
        return {
            id: emailDraft?.approvalId ?? emailDraft?.id ?? randomUUID(),
            ...(emailDraft ? { emailDraft: { id: emailDraft.id } } : {}),
            accountId: identity.account.id,
            requesterId,
            ...(idempotency ? { idempotency } : {}),
            ...(action ? { action } : {}),
            ...(identity.keyId ? { keyId: identity.keyId } : {}),
            agentName: agent?.name ?? identity.keyName ?? identity.username,
            question,
            ...(details ? { details } : {}),
            options,
            status: 'pending',
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(
                Math.min(
                    now + minutes * 60000,
                    emailDraft?.expiresAt ? Date.parse(emailDraft.expiresAt) : Infinity,
                ),
            ).toISOString(),
        };
    }
    async function submit(approval: Approval, plan: PlanId, queueDraft?: QueueDraft) {
        const created = await approvals.create(approval, plan, queueDraft);
        if (queueDraft && !created) throw alreadySubmitted();
        if (typeof created === 'object')
            return {
                ...view(created),
                replayed: true,
                emailed: false,
                next: 'This request already exists. Check its current status or continue waiting.',
            };
        if (created) {
            notifications.schedule(approval);
            void poll();
        }
        const emailed = created && (await notify(approval));
        return {
            ...view(approval),
            emailed,
            next: emailed
                ? 'Your human was emailed. Call wait_for_approval (GET /api/approvals/{id}/wait) until it is answered.'
                : `Show your human this link: ${answerUrl(approval.id)} then call wait_for_approval.`,
        };
    }
    app.post('/api/approvals', async (request, reply) => {
        const approval = await prepare(request, (request.body ?? {}) as Record<string, unknown>);
        const result = await submit(approval, (await access.actor(request)).plan);
        return reply.code('replayed' in result ? 200 : 201).send(result);
    });

    app.get('/api/approvals', async (request) => {
        const identity = (await account(request, false)).identity!;
        const query = request.query as Record<string, string | undefined>;
        const status = query.status;
        const limit = query.limit === undefined ? 50 : Number(query.limit);
        if (status && !['pending', 'answered', 'expired'].includes(status))
            throw new HttpError(400, 'Choose pending, answered or expired.');
        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
            throw new HttpError(400, 'Use a limit between 1 and 50.');
        const before = query.cursor
            ? await approvals.get(identity.account.id, query.cursor)
            : undefined;
        if (query.cursor && !before) throw new HttpError(400, 'Use a cursor from this workspace.');
        const items = await approvals.list(identity.account.id, false, {
            ...(status ? { status: status as Approval['status'] } : {}),
            limit: limit + 1,
            ...(before ? { before } : {}),
            agent: text(query.agent, 120),
            outcome: text(query.outcome, 60),
        });
        return {
            approvals: items.slice(0, limit).map(view),
            ...(items.length > limit ? { nextCursor: items[limit - 1]!.id } : {}),
        };
    });
    app.get<{ Params: { id: string } }>('/api/approvals/:id', async (request) =>
        view(await inspect(request, request.params.id)),
    );
    app.get<{ Params: { id: string } }>('/api/approvals/:id/events', async (request) => {
        const approval = await inspect(request, request.params.id);
        return {
            events: [
                {
                    type: 'requested',
                    at: approval.createdAt,
                    actor: approval.agentName,
                    actorId: approval.requesterId ?? approval.keyId,
                },
                ...(approval.answeredAt
                    ? [
                          {
                              type: 'answered',
                              at: approval.answeredAt,
                              actor: approval.answeredBy,
                              actorId: approval.answeredById,
                              outcome: approval.answer,
                          },
                      ]
                    : approval.status === 'expired'
                      ? [{ type: 'expired', at: approval.expiresAt }]
                      : []),
                ...(approval.consumedAt ? [{ type: 'consumed', at: approval.consumedAt }] : []),
            ],
        };
    });
    app.get('/api/approvals/policy', async (request) => {
        const actor = await account(request, false);
        const identity = actor.identity!;
        return notifications.settings(
            identity.account.id,
            !!actor.sessionToken && (identity.role === 'owner' || identity.role === 'admin'),
        );
    });
    app.put('/api/approvals/policy', async (request) => {
        const identity = await human(request);
        return notifications.configure(
            identity.account.id,
            (request.body ?? {}) as Record<string, unknown>,
        );
    });
    app.get<{ Params: { id: string } }>('/api/approvals/:id/deliveries', async (request) => {
        const approval = await inspect(request, request.params.id);
        return { deliveries: await notifications.list(approval.accountId, approval.id) };
    });
    app.get<{ Params: { id: string }; Querystring: { timeoutSeconds?: string } }>(
        '/api/approvals/:id/wait',
        async (request) => {
            const actor = await account(request, false);
            const accountId = actor.identity!.account.id;
            const deadline = Date.now() + waitSeconds(request.query.timeoutSeconds) * 1000;
            const abort = new AbortController();
            request.raw.once('close', () => abort.abort());
            return waiters.run(actor.quotaKey, async () => {
                for (;;) {
                    const approval = await approvals.get(accountId, request.params.id);
                    if (
                        !approval ||
                        (actor.identity?.emailInboxId &&
                            (!approval.emailDraft || approval.keyId !== actor.identity.keyId))
                    )
                        throw new HttpError(404, 'Approval request not found.');
                    if (approval.status !== 'pending')
                        return { timedOut: false, ...view(approval) };
                    if (abort.signal.aborted || Date.now() + 1000 > deadline)
                        return { timedOut: true, ...view(approval) };
                    await pause(1000, abort.signal);
                }
            });
        },
    );

    // Answers come only from a signed-in owner or admin, never from an API key, so an agent
    // cannot approve its own request.
    app.post<{ Params: { id: string } }>('/api/approvals/:id/answer', async (request) => {
        const identity = await human(request);
        const approval = await approvals.get(identity.account.id, request.params.id);
        if (!approval) throw new HttpError(404, 'Approval request not found.');
        const body = (request.body ?? {}) as {
            answer?: unknown;
            note?: unknown;
            editedEmail?: unknown;
        };
        const answer = typeof body.answer === 'string' ? body.answer : '';
        if (!approval.options.includes(answer))
            throw new HttpError(400, `Answer with one of: ${approval.options.join(', ')}.`);
        const note = text(body.note, 1000);
        const plan = effectivePlan(identity.account);
        if (body.editedEmail !== undefined && (!approval.emailDraft || answer !== 'Approve'))
            throw new HttpError(400, 'An edit can only accompany approval of an email draft.');
        const editedEmail =
            body.editedEmail === undefined
                ? undefined
                : validateEmailContent(
                      body.editedEmail,
                      plans[plan].emailRecipients,
                      plans[plan].emailDraftBytes,
                  );
        if (
            !(await approvals.answer(identity.account.id, approval.id, {
                answer,
                ...(note ? { note } : {}),
                answeredBy: identity.username,
                answeredById: identity.userId,
                ...(editedEmail ? { editedEmail } : {}),
            }))
        )
            throw new HttpError(409, 'This request was already answered or has expired.');
        const updated = (await approvals.get(identity.account.id, approval.id))!;
        notifications.schedule(updated, true);
        void poll();
        return view(updated);
    });
    return { prepare, submit };
}
