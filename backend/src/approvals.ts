import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import type { AgentRepository } from './agents.js';
import { effectivePlan } from './identity.js';
import type { IdentityRepository } from './identity.js';
import type { MailSender } from './mail.js';
import type { RecoveryRepository } from './recovery-store.js';
import { isUuid } from './security.js';
import type { Waiters } from './waiting.js';
import { waitSeconds } from './waiting.js';

export const approvalLimits = { anonymous: 0, free: 20, pro: 200, team: 1000 } as const;

export interface Approval {
    id: string;
    accountId: string;
    keyId?: string;
    agentName: string;
    question: string;
    details?: string;
    options: string[];
    status: 'pending' | 'answered' | 'expired';
    answer?: string;
    note?: string;
    answeredBy?: string;
    createdAt: string;
    expiresAt: string;
    answeredAt?: string;
}

type MaybePromise<T> = T | Promise<T>;
export interface ApprovalRepository {
    create(approval: Approval): MaybePromise<void>;
    get(accountId: string, id: string): MaybePromise<Approval | undefined>;
    list(accountId: string, pendingOnly: boolean): MaybePromise<Approval[]>;
    countSince(accountId: string, since: string): MaybePromise<number>;
    /** Records an answer only while the request is still pending and unexpired. */
    answer(
        accountId: string,
        id: string,
        answer: { answer: string; note?: string; answeredBy: string },
    ): MaybePromise<boolean>;
}

// Expiry is computed on read so a request is never answered after its deadline.
const current = (approval: Approval): Approval =>
    approval.status === 'pending' && Date.parse(approval.expiresAt) <= Date.now()
        ? { ...approval, status: 'expired' }
        : approval;

export class MemoryApprovals implements ApprovalRepository {
    private readonly items = new Map<string, Approval>();
    create(approval: Approval) {
        this.items.set(approval.id, { ...approval });
    }
    get(accountId: string, id: string) {
        const item = this.items.get(id);
        return item?.accountId === accountId ? current({ ...item }) : undefined;
    }
    list(accountId: string, pendingOnly: boolean) {
        return [...this.items.values()]
            .filter((item) => item.accountId === accountId)
            .map((item) => current({ ...item }))
            .filter((item) => !pendingOnly || item.status === 'pending')
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .slice(0, 50);
    }
    countSince(accountId: string, since: string) {
        return [...this.items.values()].filter(
            (item) => item.accountId === accountId && item.createdAt > since,
        ).length;
    }
    answer(
        accountId: string,
        id: string,
        value: { answer: string; note?: string; answeredBy: string },
    ) {
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
    async create(approval: Approval) {
        await this.pool.query(
            'INSERT INTO approvals (id, account_id, approval, status, created_at, expires_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
            [
                approval.id,
                approval.accountId,
                JSON.stringify(approval),
                approval.status,
                approval.createdAt,
                approval.expiresAt,
            ],
        );
    }
    async get(accountId: string, id: string) {
        if (!isUuid(id)) return undefined;
        const result = await this.pool.query<Row>(
            'SELECT * FROM approvals WHERE account_id = $1 AND id = $2',
            [accountId, id],
        );
        return result.rows[0] ? fromRow(result.rows[0]) : undefined;
    }
    async list(accountId: string, pendingOnly: boolean) {
        const result = await this.pool.query<Row>(
            `SELECT * FROM approvals WHERE account_id = $1 ${pendingOnly ? "AND status = 'pending' AND expires_at > clock_timestamp()" : ''} ORDER BY created_at DESC LIMIT 50`,
            [accountId],
        );
        return result.rows.map(fromRow);
    }
    async countSince(accountId: string, since: string) {
        const result = await this.pool.query<{ count: string }>(
            'SELECT count(*) FROM approvals WHERE account_id = $1 AND created_at > $2',
            [accountId, since],
        );
        return Number(result.rows[0]!.count);
    }
    async answer(
        accountId: string,
        id: string,
        value: { answer: string; note?: string; answeredBy: string },
    ) {
        if (!isUuid(id)) return false;
        const result = await this.pool.query(
            `UPDATE approvals SET status = 'answered',
                approval = approval || jsonb_build_object('answer', $3::text, 'answeredBy', $4::text,
                    'answeredAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                    || CASE WHEN $5::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('note', $5::text) END
             WHERE account_id = $1 AND id = $2 AND status = 'pending' AND expires_at > clock_timestamp()`,
            [accountId, id, value.answer, value.answeredBy, value.note ?? null],
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
    origin: string;
    mail?: MailSender;
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
    origin,
    mail,
}: ApprovalContext) {
    const answerUrl = (id: string) => `${origin}/approve/?id=${id}`;
    const view = (approval: Approval) => {
        const { accountId: _account, keyId: _key, ...rest } = approval;
        return { ...rest, answerUrl: answerUrl(approval.id) };
    };
    async function account(request: FastifyRequest, write = true) {
        const actor = await access.scope(request, write ? 'resources:write' : 'resources:read');
        if (!actor.identity)
            throw new HttpError(401, 'Asking a human needs a connected agent or an account key.');
        return actor;
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
                text: `${approval.agentName} needs your answer.\n\n${approval.question}\n${approval.details ? `\n${approval.details}\n` : ''}\nOptions: ${approval.options.join(' / ')}\n\nAnswer here (you will be asked to sign in): ${answerUrl(approval.id)}\n\nThe request expires ${new Date(approval.expiresAt).toUTCString()}.\n`,
            });
            return true;
        } catch {
            app.log.warn({ approval: approval.id }, 'Approval email failed.');
            return false;
        }
    }

    app.post('/api/approvals', async (request, reply) => {
        const actor = await account(request);
        const identity = actor.identity!;
        const body = (request.body ?? {}) as Record<string, unknown>;
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
        const plan = effectivePlan(identity.account);
        const since = new Date(Date.now() - 86400000).toISOString();
        if ((await approvals.countSince(identity.account.id, since)) >= approvalLimits[plan])
            throw new HttpError(
                429,
                `Your plan allows ${approvalLimits[plan]} questions a day. Ask your human to upgrade at ${origin}/plans/.`,
            );
        const agent = identity.keyId
            ? (await agents.agents(identity.account.id)).find(
                  (item) => item.keyId === identity.keyId,
              )
            : undefined;
        const now = Date.now();
        const details = text(body.details, 4000);
        const approval: Approval = {
            id: randomUUID(),
            accountId: identity.account.id,
            ...(identity.keyId ? { keyId: identity.keyId } : {}),
            agentName: agent?.name ?? (identity.keyId ? 'Your API key' : identity.username),
            question,
            ...(details ? { details } : {}),
            options,
            status: 'pending',
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + minutes * 60000).toISOString(),
        };
        await approvals.create(approval);
        const emailed = await notify(approval);
        return reply.code(201).send({
            ...view(approval),
            emailed,
            next: emailed
                ? 'Your human was emailed. Call wait_for_approval (GET /api/approvals/{id}/wait) until it is answered.'
                : `Show your human this link: ${answerUrl(approval.id)} then call wait_for_approval.`,
        });
    });

    app.get('/api/approvals', async (request) => {
        const identity = (await account(request, false)).identity!;
        const query = (request.query ?? {}) as { status?: string };
        return {
            approvals: (await approvals.list(identity.account.id, query.status === 'pending')).map(
                view,
            ),
        };
    });
    app.get<{ Params: { id: string } }>('/api/approvals/:id', async (request) => {
        const identity = (await account(request, false)).identity!;
        const approval = await approvals.get(identity.account.id, request.params.id);
        if (!approval) throw new HttpError(404, 'Approval request not found.');
        return view(approval);
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
                    if (!approval) throw new HttpError(404, 'Approval request not found.');
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
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner' && identity.role !== 'admin')
            throw new HttpError(403, 'Only workspace owners and admins can answer agents.');
        const approval = await approvals.get(identity.account.id, request.params.id);
        if (!approval) throw new HttpError(404, 'Approval request not found.');
        const body = (request.body ?? {}) as { answer?: unknown; note?: unknown };
        const answer = typeof body.answer === 'string' ? body.answer : '';
        if (!approval.options.includes(answer))
            throw new HttpError(400, `Answer with one of: ${approval.options.join(', ')}.`);
        const note = text(body.note, 1000);
        if (
            !(await approvals.answer(identity.account.id, approval.id, {
                answer,
                ...(note ? { note } : {}),
                answeredBy: identity.username,
            }))
        )
            throw new HttpError(409, 'This request was already answered or has expired.');
        return view((await approvals.get(identity.account.id, approval.id))!);
    });
}
