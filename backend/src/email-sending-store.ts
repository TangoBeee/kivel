import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface SendRecipient {
    address: string;
    providerId?: string;
    attemptedAt?: string;
    messageId?: string;
    bounced?: boolean;
    complained?: boolean;
    complaintReportedAt?: string;
}
export interface EmailSendJob {
    id: string;
    ownerId: string;
    inboxId: string;
    key: string;
    hash: string;
    createdAt: string;
    status: 'pending' | 'sent' | 'failed';
    recipients: SendRecipient[];
}
export interface SendingSession {
    job(key: string): Promise<EmailSendJob | undefined>;
    save(job: EmailSendJob): Promise<void>;
    usage(period?: 'day' | 'month'): Promise<number>;
    reputation(): Promise<{ sent: number; bounced: number; suspended: string | null }>;
    suspend(reason: string): Promise<void>;
    unsuspend(): Promise<void>;
    blocked(address: string): Promise<boolean>;
    suppress(address: string, reason: string): Promise<void>;
}
export interface EmailSendingRepository {
    withOwner<T>(ownerId: string, work: (session: SendingSession) => Promise<T>): Promise<T>;
    find(id: string): Promise<EmailSendJob | undefined>;
    cleanup(): Promise<void>;
}
export const newSendJob = (
    input: Omit<EmailSendJob, 'id' | 'createdAt' | 'status'>,
): EmailSendJob => ({
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending',
});

export class MemoryEmailSending implements EmailSendingRepository {
    private jobs = new Map<string, EmailSendJob>();
    private suspended = new Map<string, string>();
    private suppressions = new Set<string>();
    private locks = new Map<string, Promise<unknown>>();
    async find(id: string) {
        const job = this.jobs.get(id);
        return job && structuredClone(job);
    }
    async withOwner<T>(owner: string, work: (session: SendingSession) => Promise<T>): Promise<T> {
        const previous = this.locks.get(owner) ?? Promise.resolve();
        const task = previous
            .catch(() => {})
            .then(() =>
                work({
                    job: async (key) => {
                        const job = [...this.jobs.values()].find(
                            (job) => job.ownerId === owner && job.key === key,
                        );
                        return job && structuredClone(job);
                    },
                    save: async (job) => {
                        this.jobs.set(job.id, structuredClone(job));
                    },
                    usage: async (period = 'day') =>
                        [...this.jobs.values()]
                            .filter(
                                (job) =>
                                    job.ownerId === owner &&
                                    job.createdAt.slice(0, period === 'day' ? 10 : 7) ===
                                        new Date()
                                            .toISOString()
                                            .slice(0, period === 'day' ? 10 : 7) &&
                                    job.status !== 'failed',
                            )
                            .reduce((sum, job) => sum + job.recipients.length, 0),
                    reputation: async () => {
                        const recipients = [...this.jobs.values()]
                            .filter(
                                (job) =>
                                    job.ownerId === owner &&
                                    Date.parse(job.createdAt) >= Date.now() - 30 * 86400000,
                            )
                            .flatMap((job) => job.recipients);
                        return {
                            sent: recipients.filter((to) => to.providerId || to.attemptedAt).length,
                            bounced: recipients.filter((to) => to.bounced).length,
                            suspended: this.suspended.get(owner) ?? null,
                        };
                    },
                    suspend: async (reason) => {
                        this.suspended.set(owner, reason);
                    },
                    unsuspend: async () => {
                        this.suspended.delete(owner);
                    },
                    blocked: async (address) =>
                        this.suppressions.has(`*:${address}`) ||
                        this.suppressions.has(`${owner}:${address}`),
                    suppress: async (address, reason) => {
                        this.suppressions.add(
                            `${reason === 'unsubscribe' ? owner : '*'}:${address}`,
                        );
                    },
                }),
            );
        this.locks.set(owner, task);
        try {
            return await task;
        } finally {
            if (this.locks.get(owner) === task) this.locks.delete(owner);
        }
    }
    async cleanup() {
        for (const [id, job] of this.jobs)
            if (Date.parse(job.createdAt) < Date.now() - 90 * 86400000) this.jobs.delete(id);
    }
}

export class PostgresEmailSending implements EmailSendingRepository {
    constructor(private pool: Pool) {}
    async find(id: string) {
        const result = await this.pool.query('SELECT job FROM email_send_jobs WHERE id=$1', [id]);
        return result.rows[0]?.job as EmailSendJob | undefined;
    }
    async withOwner<T>(owner: string, work: (session: SendingSession) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        let locked = false,
            destroy = false;
        try {
            await client.query('SELECT pg_advisory_lock(hashtextextended($1, 15))', [owner]);
            locked = true;
            return await work(new PostgresSendingSession(client, owner));
        } finally {
            try {
                if (locked)
                    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 15))', [
                        owner,
                    ]);
            } catch (error) {
                destroy = true;
                throw error;
            } finally {
                client.release(destroy);
            }
        }
    }
    async cleanup() {
        await this.pool.query(
            "DELETE FROM email_send_jobs WHERE created_at < clock_timestamp() - interval '90 days'",
        );
    }
}
class PostgresSendingSession implements SendingSession {
    constructor(
        private client: PoolClient,
        private owner: string,
    ) {}
    async job(key: string) {
        return (
            await this.client.query(
                'SELECT job FROM email_send_jobs WHERE owner_id=$1 AND request_key=$2',
                [this.owner, key],
            )
        ).rows[0]?.job as EmailSendJob | undefined;
    }
    async save(job: EmailSendJob) {
        await this.client.query(
            'INSERT INTO email_send_jobs(id, owner_id, request_key, job, created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET job=EXCLUDED.job',
            [job.id, this.owner, job.key, job, job.createdAt],
        );
    }
    async usage(period: 'day' | 'month' = 'day') {
        return Number(
            (
                await this.client.query(
                    "SELECT COALESCE(sum(jsonb_array_length(job->'recipients')),0)::integer AS used FROM email_send_jobs WHERE owner_id=$1 AND created_at >= (date_trunc($2, clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND job->>'status' != 'failed'",
                    [this.owner, period],
                )
            ).rows[0].used,
        );
    }
    async reputation() {
        const counts = (
            await this.client.query(
                "SELECT count(*) FILTER(WHERE recipient ? 'providerId' OR recipient ? 'attemptedAt')::integer AS sent, count(*) FILTER(WHERE recipient->>'bounced'='true')::integer AS bounced FROM email_send_jobs CROSS JOIN LATERAL jsonb_array_elements(job->'recipients') AS recipient WHERE owner_id=$1 AND created_at >= clock_timestamp() - interval '30 days'",
                [this.owner],
            )
        ).rows[0];
        const suspended =
            (
                await this.client.query(
                    'SELECT reason FROM email_sender_suspensions WHERE owner_id=$1',
                    [this.owner],
                )
            ).rows[0]?.reason ?? null;
        return { ...counts, suspended } as {
            sent: number;
            bounced: number;
            suspended: string | null;
        };
    }
    async suspend(reason: string) {
        await this.client.query(
            'INSERT INTO email_sender_suspensions(owner_id,reason) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING',
            [this.owner, reason],
        );
    }
    async blocked(address: string) {
        return !!(
            await this.client.query(
                "SELECT 1 FROM email_suppressions WHERE scope IN ('*',$1) AND address=$2",
                [this.owner, address],
            )
        ).rowCount;
    }
    async unsuspend() {
        await this.client.query('DELETE FROM email_sender_suspensions WHERE owner_id=$1', [
            this.owner,
        ]);
    }
    async suppress(address: string, reason: string) {
        await this.client.query(
            'INSERT INTO email_suppressions(scope,address,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [reason === 'unsubscribe' ? this.owner : '*', address, reason],
        );
    }
}
