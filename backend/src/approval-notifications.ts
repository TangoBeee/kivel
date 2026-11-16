import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Approval, ApprovalRepository } from './approvals.js';
import { HttpError } from './errors.js';
import type { ForwardSend } from './forwarding.js';
import { publicRequest, publicUrl } from './public-network.js';

type Policy = {
    url: string;
    secret: string;
    reminderMinutes?: number;
    escalationMinutes?: number;
    escalationUrl?: string;
};
type Kind = 'requested' | 'reminder' | 'escalated' | 'answered' | 'expired';
type Delivery = {
    id: string;
    accountId: string;
    approvalId: string;
    kind: Kind;
    dueAt: Date;
    updatedAt: Date;
    attempts: number;
    state: 'queued' | 'delivered' | 'failed' | 'skipped';
    httpStatus?: number;
};
const columns = `id, account_id AS "accountId", approval_id AS "approvalId", kind,
    due_at AS "dueAt", updated_at AS "updatedAt", attempts, state, http_status AS "httpStatus"`;
const attemptLimit = 3;

export const approvalNotificationSchema = `
    CREATE TABLE IF NOT EXISTS approval_notification_policies (
        account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        policy jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        approval_id uuid NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
        kind text NOT NULL, due_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), attempts integer NOT NULL DEFAULT 0,
        state text NOT NULL DEFAULT 'queued', http_status integer,
        UNIQUE(approval_id, kind)
    );
    CREATE INDEX IF NOT EXISTS approval_notifications_due
        ON approval_notifications(due_at) WHERE state = 'queued';
    CREATE UNIQUE INDEX IF NOT EXISTS approval_request_key
        ON approvals(account_id, (approval->'idempotency'->>'key')) WHERE approval ? 'idempotency';
    CREATE OR REPLACE FUNCTION queue_approval_notifications() RETURNS trigger AS $$
    DECLARE settings jsonb;
    BEGIN
        IF TG_OP = 'UPDATE' AND (NEW.status <> 'answered' OR OLD.status = 'answered') THEN
            RETURN NEW;
        END IF;
        SELECT policy INTO settings FROM approval_notification_policies WHERE account_id = NEW.account_id;
        IF settings IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' THEN
            INSERT INTO approval_notifications(account_id, approval_id, kind, due_at)
                VALUES(NEW.account_id, NEW.id, 'answered', clock_timestamp()) ON CONFLICT DO NOTHING;
        ELSE
            INSERT INTO approval_notifications(account_id, approval_id, kind, due_at)
                SELECT NEW.account_id, NEW.id, kind, due
                FROM (VALUES
                    ('requested', NEW.created_at),
                    ('reminder', NEW.created_at + make_interval(mins => (settings->>'reminderMinutes')::integer)),
                    ('escalated', NEW.created_at + make_interval(mins => (settings->>'escalationMinutes')::integer)),
                    ('expired', NEW.expires_at)
                ) AS events(kind, due)
                WHERE due IS NOT NULL AND (kind = 'expired' OR due < NEW.expires_at)
                ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE OR REPLACE TRIGGER approval_notification_events AFTER INSERT OR UPDATE OF status ON approvals
        FOR EACH ROW EXECUTE FUNCTION queue_approval_notifications();
`;

function destination(value: unknown) {
    try {
        if (typeof value !== 'string' || value.length > 2000) throw new Error();
        const url = publicUrl(value);
        if (url.protocol !== 'https:') throw new Error();
        return url.href;
    } catch {
        throw new HttpError(400, 'Use a public HTTPS notification URL without credentials.');
    }
}
function delay(value: unknown, name: string) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1439)
        throw new HttpError(400, `Set ${name} to a whole number from 1 to 1439 minutes.`);
    return value;
}

export class ApprovalNotifications {
    private readonly policies = new Map<string, Policy>();
    private readonly queue = new Map<string, Delivery>();

    constructor(
        private readonly approvals: ApprovalRepository,
        private readonly pool?: Pool,
        private readonly send: ForwardSend = (url, signal, options) =>
            publicRequest(url, signal, { ...options, body: false }),
        private readonly answerUrl?: (id: string) => string,
    ) {}

    private async policy(accountId: string): Promise<Policy | undefined> {
        if (!this.pool) return this.policies.get(accountId);
        return (
            await this.pool.query<{ policy: Policy }>(
                'SELECT policy FROM approval_notification_policies WHERE account_id = $1',
                [accountId],
            )
        ).rows[0]?.policy;
    }
    async settings(accountId: string, includeUrls: boolean) {
        const policy = await this.policy(accountId);
        return {
            enabled: !!policy,
            ...(policy && {
                reminderMinutes: policy.reminderMinutes,
                escalationMinutes: policy.escalationMinutes,
                ...(includeUrls && { url: policy.url, escalationUrl: policy.escalationUrl }),
            }),
        };
    }
    async configure(accountId: string, body: Record<string, unknown>) {
        if (body.url === null) {
            if (this.pool)
                await this.pool.query(
                    `WITH disabled AS (DELETE FROM approval_notification_policies WHERE account_id = $1)
                 UPDATE approval_notifications SET state = 'skipped', updated_at = clock_timestamp()
                 WHERE account_id = $1 AND state = 'queued'`,
                    [accountId],
                );
            else {
                this.policies.delete(accountId);
                for (const job of this.queue.values()) {
                    if (job.accountId === accountId && job.state === 'queued') {
                        job.state = 'skipped';
                        job.updatedAt = new Date();
                    }
                }
            }
            return { enabled: false };
        }
        const url = destination(body.url);
        const reminderMinutes = delay(body.reminderMinutes, 'the reminder');
        const escalationMinutes = delay(body.escalationMinutes, 'escalation');
        if (escalationMinutes && reminderMinutes && escalationMinutes <= reminderMinutes)
            throw new HttpError(400, 'Escalation must happen after the reminder.');
        if (body.escalationUrl != null && !escalationMinutes)
            throw new HttpError(400, 'Set an escalation delay before adding an escalation URL.');
        const escalationUrl =
            body.escalationUrl == null ? undefined : destination(body.escalationUrl);
        const newSecret = 'kvas_' + randomBytes(32).toString('base64url');
        const rotate = body.rotateSecret === true;
        const policy: Policy = {
            url,
            secret: newSecret,
            ...(reminderMinutes !== undefined && { reminderMinutes }),
            ...(escalationMinutes !== undefined && { escalationMinutes }),
            ...(escalationUrl !== undefined && { escalationUrl }),
        };
        let secret = newSecret;
        if (this.pool) {
            const { rows } = await this.pool.query<{ secret: string }>(
                `INSERT INTO approval_notification_policies(account_id,policy) VALUES ($1,$2::jsonb)
                 ON CONFLICT(account_id) DO UPDATE SET policy = CASE WHEN $3 THEN EXCLUDED.policy
                 ELSE EXCLUDED.policy || jsonb_build_object('secret', approval_notification_policies.policy->>'secret') END
                 RETURNING policy->>'secret' AS secret`,
                [accountId, JSON.stringify(policy), rotate],
            );
            secret = rows[0]!.secret;
        } else {
            const existing = this.policies.get(accountId);
            if (existing && !rotate) secret = existing.secret;
            this.policies.set(accountId, { ...policy, secret });
        }
        return {
            enabled: true,
            url,
            reminderMinutes,
            escalationMinutes,
            escalationUrl,
            ...(secret === newSecret && { signingSecret: secret }),
        };
    }
    async list(accountId: string, approvalId: string) {
        const rows = this.pool
            ? (
                  await this.pool.query<Delivery>(
                      `SELECT ${columns} FROM approval_notifications
                WHERE account_id = $1 AND approval_id = $2 ORDER BY updated_at, id`,
                      [accountId, approvalId],
                  )
              ).rows
            : [...this.queue.values()].filter(
                  (job) => job.accountId === accountId && job.approvalId === approvalId,
              );
        return rows.map(
            ({ accountId: _account, approvalId: _approval, dueAt: _due, ...delivery }) => delivery,
        );
    }
    schedule(approval: Approval, answered = false) {
        if (this.pool) return;
        const policy = this.policies.get(approval.accountId);
        if (!policy) return;
        const start = Date.parse(approval.createdAt);
        const end = Date.parse(approval.expiresAt);
        const add = (kind: Kind, due: number) => {
            const id = randomUUID();
            this.queue.set(id, {
                id,
                accountId: approval.accountId,
                approvalId: approval.id,
                kind,
                dueAt: new Date(due),
                updatedAt: new Date(),
                attempts: 0,
                state: 'queued',
            });
        };
        if (answered) {
            add('answered', Date.now());
            return;
        }
        add('requested', start);
        if (policy.reminderMinutes && start + policy.reminderMinutes * 60000 < end)
            add('reminder', start + policy.reminderMinutes * 60000);
        if (policy.escalationMinutes && start + policy.escalationMinutes * 60000 < end)
            add('escalated', start + policy.escalationMinutes * 60000);
        add('expired', end);
    }

    private async claim() {
        if (this.pool)
            return (
                await this.pool.query<Delivery>(
                    `WITH due AS (SELECT id FROM approval_notifications
                WHERE state = 'queued' AND due_at <= clock_timestamp()
                ORDER BY due_at LIMIT 12 FOR UPDATE SKIP LOCKED)
             UPDATE approval_notifications SET due_at = clock_timestamp() + interval '5 minutes',
                attempts = attempts + 1, updated_at = clock_timestamp()
             WHERE id IN (SELECT id FROM due) RETURNING ${columns}`,
                )
            ).rows;
        const now = Date.now();
        return [...this.queue.values()]
            .filter((job) => job.state === 'queued' && +job.dueAt <= now)
            .sort((a, b) => +a.dueAt - +b.dueAt)
            .slice(0, 12)
            .map((job) => {
                job.dueAt = new Date(now + 300000);
                job.updatedAt = new Date(now);
                job.attempts++;
                return { ...job };
            });
    }
    private async settle(job: Delivery, state: Delivery['state'], status?: number) {
        const due = new Date(Date.now() + (job.attempts === 1 ? 30_000 : 120_000));
        if (this.pool) {
            await this.pool.query(
                `UPDATE approval_notifications SET state=$2, due_at=$3,
                    updated_at=clock_timestamp(), http_status=$4 WHERE id=$1 AND attempts=$5 AND state='queued'`,
                [job.id, state, due, status ?? null, job.attempts],
            );
        } else {
            const stored = this.queue.get(job.id);
            if (stored?.attempts === job.attempts && stored.state === 'queued')
                Object.assign(stored, {
                    state,
                    dueAt: due,
                    httpStatus: status,
                    updatedAt: new Date(),
                });
        }
    }
    async tick() {
        const jobs = await this.claim();
        await Promise.all(
            jobs.map(async (job) => {
                const [approval, policy] = await Promise.all([
                    this.approvals.get(job.accountId, job.approvalId),
                    this.policy(job.accountId),
                ]);
                if (
                    !approval ||
                    !policy ||
                    ((job.kind === 'reminder' || job.kind === 'escalated') &&
                        approval.status !== 'pending') ||
                    (job.kind === 'expired' && approval.status !== 'expired')
                )
                    return this.settle(job, 'skipped');
                if (job.attempts > attemptLimit) return this.settle(job, 'failed');
                const timestamp = Math.floor(Date.now() / 1000);
                const body = JSON.stringify({
                    id: job.id,
                    type: `approval.${job.kind}`,
                    approvalId: approval.id,
                    answerUrl: this.answerUrl?.(approval.id),
                    status: approval.status,
                    expiresAt: approval.expiresAt,
                });
                const signature = createHmac('sha256', policy.secret)
                    .update(`${timestamp}.${body}`)
                    .digest('hex');
                let status: number | undefined;
                try {
                    ({ status } = await this.send(
                        job.kind === 'escalated' && policy.escalationUrl
                            ? policy.escalationUrl
                            : policy.url,
                        AbortSignal.timeout(8000),
                        {
                            method: 'POST',
                            requestBody: body,
                            headers: {
                                'content-type': 'application/json',
                                'x-kivel-approval-signature': `t=${timestamp},v1=${signature}`,
                                'x-kivel-event-id': job.id,
                            },
                        },
                    ));
                } catch {}
                const success = status !== undefined && status >= 200 && status < 300;
                const retryable = status === undefined || status === 429 || status >= 500;
                await this.settle(
                    job,
                    success
                        ? 'delivered'
                        : retryable && job.attempts < attemptLimit
                          ? 'queued'
                          : 'failed',
                    status,
                );
            }),
        );
    }
}
