import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { HttpError, resourceToken } from './access.js';
import type { Access } from './access.js';
import { requireWorkspace } from './access.js';
import type { ResourceRepository } from './resources.js';
import { publicRequest, publicUrl } from './public-network.js';

export interface DeliveryEvent {
    id: string;
    at: string;
    deliveryId: string;
    attempt: number;
    status: number | null;
    error?: string;
}
export interface ScheduledJob {
    id: string;
    ownerId: string;
    name: string;
    url: string;
    body: unknown;
    nextRunAt: string | null;
    intervalSeconds: number | null;
    remaining: number;
    run: number;
    attempt: number;
    status: 'scheduled' | 'completed' | 'failed' | 'cancelled';
    expiresAt: string;
    events: DeliveryEvent[];
}
export interface JobStore {
    create(job: ScheduledJob): Promise<void>;
    get(id: string): Promise<ScheduledJob | undefined>;
    list(owner: string): Promise<ScheduledJob[]>;
    claim(now: number): Promise<{ job: ScheduledJob; lease: string } | undefined>;
    finish(job: ScheduledJob, lease: string): Promise<void>;
    cancel(id: string): Promise<void>;
}
export class MemoryJobs implements JobStore {
    private jobs = new Map<string, ScheduledJob>();
    private leases = new Map<string, { id: string; until: number }>();
    async create(job: ScheduledJob) {
        this.jobs.set(job.id, structuredClone(job));
    }
    async get(id: string) {
        const job = this.jobs.get(id);
        return job && structuredClone(job);
    }
    async list(owner: string) {
        return [...this.jobs.values()]
            .filter(
                (job) =>
                    job.ownerId === owner &&
                    job.status !== 'cancelled' &&
                    Date.parse(job.expiresAt) > Date.now(),
            )
            .map((job) => structuredClone(job));
    }
    async claim(now: number) {
        const job = [...this.jobs.values()].find(
            (job) =>
                job.status === 'scheduled' &&
                job.nextRunAt &&
                Date.parse(job.nextRunAt) <= now &&
                Date.parse(job.expiresAt) > now &&
                (this.leases.get(job.id)?.until ?? 0) < now,
        );
        if (!job) return;
        const lease = randomUUID();
        this.leases.set(job.id, { id: lease, until: now + 90000 });
        return { job: structuredClone(job), lease };
    }
    async finish(job: ScheduledJob, lease: string) {
        if (this.leases.get(job.id)?.id !== lease || this.jobs.get(job.id)?.status !== 'scheduled')
            return;
        this.jobs.set(job.id, structuredClone(job));
        this.leases.delete(job.id);
    }
    async cancel(id: string) {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'cancelled';
            job.nextRunAt = null;
        }
    }
}
export class PostgresJobs implements JobStore {
    constructor(private pool: Pool) {}
    async create(job: ScheduledJob) {
        await this.pool.query(
            'INSERT INTO scheduled_jobs(id,owner_id,job,next_run_at,expires_at) VALUES($1,$2,$3,$4,$5)',
            [job.id, job.ownerId, job, job.nextRunAt, job.expiresAt],
        );
    }
    async get(id: string) {
        return (await this.pool.query('SELECT job FROM scheduled_jobs WHERE id=$1', [id])).rows[0]
            ?.job as ScheduledJob | undefined;
    }
    async list(owner: string) {
        return (
            await this.pool.query(
                'SELECT job FROM scheduled_jobs WHERE owner_id=$1 AND expires_at > clock_timestamp() ORDER BY next_run_at LIMIT 500',
                [owner],
            )
        ).rows.map((row) => row.job as ScheduledJob);
    }
    async claim(now: number) {
        const lease = randomUUID();
        const result = await this.pool.query(
            `UPDATE scheduled_jobs SET lease_id=$2,lease_until=$1::timestamptz + interval '90 seconds' WHERE id=(SELECT id FROM scheduled_jobs WHERE next_run_at <= $1 AND expires_at > $1 AND (lease_until IS NULL OR lease_until < $1) AND job->>'status'='scheduled' ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING job`,
            [new Date(now).toISOString(), lease],
        );
        return result.rows[0] ? { job: result.rows[0].job as ScheduledJob, lease } : undefined;
    }
    async finish(job: ScheduledJob, lease: string) {
        await this.pool.query(
            "UPDATE scheduled_jobs SET job=$3,next_run_at=$4,lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 AND job->>'status'='scheduled'",
            [job.id, lease, job, job.nextRunAt],
        );
    }
    async cancel(id: string) {
        await this.pool.query(
            "UPDATE scheduled_jobs SET job=jsonb_set(jsonb_set(job,'{status}','\"cancelled\"'),'{nextRunAt}','null'),next_run_at=NULL WHERE id=$1",
            [id],
        );
    }
}
export type JobSend = (
    url: string,
    body: string,
    id: string,
    signal: AbortSignal,
) => Promise<number>;
export function registerScheduledJobs(
    app: FastifyInstance,
    access: Access,
    resources: ResourceRepository,
    store: JobStore,
    send: JobSend = async (url, body, id, signal) =>
        (
            await publicRequest(url, signal, {
                method: 'POST',
                requestBody: body,
                headers: { 'content-type': 'application/json', 'x-socket-delivery-id': id },
                body: false,
            })
        ).status,
) {
    let running = false,
        closed = false;
    const controllers = new Set<AbortController>();
    const runningTasks = new Set<Promise<void>>();
    async function owned(request: Parameters<Access['actor']>[0], id: string, write = false) {
        const actor = await access.workspace(request, write ? 'resources:write' : 'resources:read');
        const resource = await resources.read(
            id,
            'job',
            resourceToken(request),
            actor.identity?.account.id,
        );
        const job = resource && (await store.get(id));
        if (!job || job.ownerId !== actor.identity?.account.id)
            throw new HttpError(404, 'Scheduled job unavailable or access denied.');
        return job;
    }
    app.post('/api/scheduled-jobs', async (request, reply) => {
        const actor = await access.scope(request, 'resources:write');
        requireWorkspace(actor);
        const input = request.body as Record<string, unknown> | null;
        if (
            !input ||
            typeof input.name !== 'string' ||
            !input.name.trim() ||
            input.name.length > 80 ||
            typeof input.url !== 'string' ||
            input.url.length > 2048 ||
            Object.keys(input).some(
                (key) =>
                    ![
                        'name',
                        'url',
                        'body',
                        'delaySeconds',
                        'startAt',
                        'intervalSeconds',
                        'maxRuns',
                    ].includes(key),
            )
        )
            throw new HttpError(
                400,
                'Provide a name, public destination URL, optional JSON body and schedule.',
            );
        let url: URL;
        try {
            url = publicUrl(input.url);
        } catch {
            throw new HttpError(400, 'Use a public HTTP(S) destination.');
        }
        if (url.origin === access.origin || url.search)
            throw new HttpError(400, 'Use your own destination without query-string credentials.');
        if (Buffer.byteLength(JSON.stringify(input.body ?? {})) > 16384)
            throw new HttpError(413, 'Scheduled payloads must fit within 16 KiB.');
        if (input.startAt !== undefined && input.delaySeconds !== undefined)
            throw new HttpError(400, 'Choose startAt or delaySeconds.');
        const delay = input.delaySeconds === undefined ? 60 : Number(input.delaySeconds);
        const at =
            input.startAt === undefined
                ? Date.now() + delay * 1000
                : typeof input.startAt === 'string'
                  ? Date.parse(input.startAt)
                  : NaN;
        if (
            !Number.isInteger(delay) ||
            delay < 5 ||
            delay > 604800 ||
            !Number.isFinite(at) ||
            at < Date.now() + 4000 ||
            at > Date.now() + 604800000
        )
            throw new HttpError(
                400,
                'Schedule 5 seconds to 7 days ahead using an ISO startAt or delaySeconds.',
            );
        const interval = input.intervalSeconds === undefined ? null : Number(input.intervalSeconds),
            runs = Number(input.maxRuns ?? 1);
        if (
            (interval !== null &&
                (!Number.isInteger(interval) || interval < 300 || interval > 86400)) ||
            !Number.isInteger(runs) ||
            runs < 1 ||
            runs > 100 ||
            (runs > 1 && !interval)
        )
            throw new HttpError(
                400,
                'Recurring jobs require an interval of 300–86400 seconds and at most 100 runs.',
            );
        const allocation = await access.allocation(request);
        if (
            Date.parse(allocation.expiresAt ?? new Date(Date.now() + 3600000).toISOString()) <=
            at + (runs - 1) * (interval ?? 0) * 1000
        )
            throw new HttpError(
                400,
                'The resource lifetime must cover every scheduled run. Increase ttlSeconds or shorten the schedule.',
            );
        await access.rate(request, true);
        const created = await resources.create(
            'job',
            { name: input.name.trim(), url: url.href, body: input.body ?? {} },
            undefined,
            { ...allocation, visibility: 'private' },
        );
        if (!created) throw new HttpError(503, 'Scheduled-job capacity reached.');
        const job: ScheduledJob = {
            id: created.id,
            ownerId: actor.identity!.account.id,
            name: input.name.trim(),
            url: url.href,
            body: input.body ?? {},
            nextRunAt: new Date(at).toISOString(),
            intervalSeconds: interval,
            remaining: runs,
            run: 0,
            attempt: 0,
            status: 'scheduled',
            expiresAt: created.expiresAt,
            events: [],
        };
        try {
            await store.create(job);
        } catch (error) {
            await resources.delete(
                created.id,
                'job',
                created.managementToken,
                actor.identity!.account.id,
            );
            throw error;
        }
        return reply.code(201).send(job);
    });
    app.get('/api/scheduled-jobs', async (request) => {
        const identity = await access.require(request, 'resources:read');
        return { jobs: await store.list(identity.account.id) };
    });
    app.get<{ Params: { id: string } }>('/api/scheduled-jobs/:id', (request) =>
        owned(request, request.params.id),
    );
    app.delete<{ Params: { id: string } }>('/api/scheduled-jobs/:id', async (request, reply) => {
        await owned(request, request.params.id, true);
        await store.cancel(request.params.id);
        await resources.delete(
            request.params.id,
            'job',
            '',
            (await access.actor(request)).identity!.account.id,
        );
        return reply.code(204).send();
    });
    async function deliver(job: ScheduledJob, lease: string, now: number) {
        const controller = new AbortController();
        controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const resource = await resources.read(job.id, 'job', '', job.ownerId);
            if (!resource) {
                job.status = 'cancelled';
                job.nextRunAt = null;
                await store.finish(job, lease);
                return;
            }
            const deliveryId = `${job.id}:${job.run}`;
            let status: number | null = null,
                error: string | undefined;
            try {
                status = await send(
                    job.url,
                    JSON.stringify(job.body),
                    deliveryId,
                    controller.signal,
                );
            } catch {
                error = 'Destination unavailable, blocked or timed out.';
            }
            job.events.push({
                id: randomUUID(),
                at: new Date(now).toISOString(),
                deliveryId,
                attempt: job.attempt + 1,
                status,
                ...(error ? { error } : {}),
            });
            job.events = job.events.slice(-20);
            if (status !== null && status >= 200 && status < 300) {
                job.remaining--;
                job.run++;
                job.attempt = 0;
                if (!job.remaining) {
                    job.status = 'completed';
                    job.nextRunAt = null;
                } else job.nextRunAt = new Date(now + job.intervalSeconds! * 1000).toISOString();
            } else if ((status === null || status === 429 || status >= 500) && job.attempt < 2) {
                job.attempt++;
                job.nextRunAt = new Date(now + job.attempt * 60000).toISOString();
            } else {
                job.status = 'failed';
                job.nextRunAt = null;
            }
            if (job.nextRunAt && Date.parse(job.nextRunAt) >= Date.parse(job.expiresAt)) {
                job.status = 'failed';
                job.nextRunAt = null;
            }
            await store.finish(job, lease);
        } finally {
            clearTimeout(timer);
            controllers.delete(controller);
        }
    }
    async function tick(now = Date.now()) {
        if (running || closed) return;
        running = true;
        try {
            for (let index = runningTasks.size; index < 4; index++) {
                const claimed = await store.claim(now);
                if (!claimed) break;
                const task = deliver(claimed.job, claimed.lease, now).catch(() =>
                    app.log.error('Scheduled delivery failed.'),
                );
                runningTasks.add(task);
                void task.finally(() => runningTasks.delete(task));
            }
            await Promise.all([...runningTasks]);
        } finally {
            running = false;
        }
    }
    const timer = setInterval(() => {
        void tick().catch(() => app.log.error('Scheduler tick failed.'));
    }, 1000).unref();
    app.addHook('preClose', async () => {
        closed = true;
        clearInterval(timer);
        for (const controller of controllers) controller.abort();
        await Promise.all([...runningTasks]);
    });
    return { tick, owned };
}

declare module 'fastify' {
    interface FastifyInstance {
        runScheduledJobs(now?: number): Promise<void>;
    }
}
