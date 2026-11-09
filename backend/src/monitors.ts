import { plans } from '@kivel.io/tools/plans';
import { requireWorkspace } from './access.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import type { IdentityRepository } from './identity.js';
import type { MailSender } from './mail.js';
import { monitorDns, publicDnsDomain, inspectTls } from './network-tools.js';
import { publicRequest, publicUrl } from './public-network.js';
import type { RateLimitRepository } from './rate-limit.js';
import type { RecoveryRepository } from './recovery-store.js';
import { isUuid } from './security.js';

export type MonitorKind = 'heartbeat' | 'http' | 'ssl' | 'dns';
export type MonitorStatus = 'pending' | 'up' | 'down';

export interface Monitor {
    id: string;
    accountId: string;
    kind: MonitorKind;
    name: string;
    target?: string;
    intervalSeconds: number;
    graceSeconds: number;
    expectStatus?: number;
    expectText?: string;
    sslDays?: number;
    dnsRecordType?: string;
    dnsBaseline?: string[];
    lastDnsAnswers?: string[];
    lastDurationMs?: number;
    recentChecks?: { at: string; status: MonitorStatus; durationMs: number }[];
    alertWebhook?: string;
    paused: boolean;
    status: MonitorStatus;
    failures: number;
    lastCheckAt?: string;
    lastPingAt?: string;
    lastChangeAt?: string;
    lastMessage?: string;
    nextRunAt: string;
    createdAt: string;
}
export interface MonitorEvent {
    at: string;
    status: MonitorStatus;
    message: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

type MaybePromise<T> = T | Promise<T>;
export interface MonitorRepository {
    create(monitor: Monitor, pingHash?: string): MaybePromise<void>;
    count(accountId: string): MaybePromise<number>;
    list(accountId: string): MaybePromise<Monitor[]>;
    get(accountId: string, id: string): MaybePromise<Monitor | undefined>;
    delete(accountId: string, id: string): MaybePromise<boolean>;
    setPaused(accountId: string, id: string, paused: boolean): MaybePromise<boolean>;
    /** Claims monitors whose next check is due, pushing each a minute ahead as a lease. */
    claimDue(limit: number): MaybePromise<Monitor[]>;
    save(monitor: Monitor): MaybePromise<void>;
    byPing(pingHash: string): MaybePromise<Monitor | undefined>;
    addEvent(id: string, event: MonitorEvent): MaybePromise<void>;
    events(id: string): MaybePromise<MonitorEvent[]>;
}

export class MemoryMonitors implements MonitorRepository {
    private readonly monitors = new Map<string, Monitor>();
    private readonly pings = new Map<string, string>();
    private readonly log = new Map<string, MonitorEvent[]>();
    create(monitor: Monitor, pingHash?: string) {
        this.monitors.set(monitor.id, { ...monitor });
        if (pingHash) this.pings.set(pingHash, monitor.id);
    }
    count(accountId: string) {
        return this.list(accountId).length;
    }
    list(accountId: string) {
        return [...this.monitors.values()]
            .filter((monitor) => monitor.accountId === accountId)
            .map((monitor) => ({ ...monitor }));
    }
    get(accountId: string, id: string) {
        const monitor = this.monitors.get(id);
        return monitor?.accountId === accountId ? { ...monitor } : undefined;
    }
    delete(accountId: string, id: string) {
        if (!this.get(accountId, id)) return false;
        this.monitors.delete(id);
        this.log.delete(id);
        for (const [ping, owner] of this.pings) if (owner === id) this.pings.delete(ping);
        return true;
    }
    setPaused(accountId: string, id: string, paused: boolean) {
        const monitor = this.monitors.get(id);
        if (monitor?.accountId !== accountId) return false;
        monitor.paused = paused;
        return true;
    }
    claimDue(limit: number) {
        const now = Date.now();
        const due = [...this.monitors.values()]
            .filter((monitor) => !monitor.paused && Date.parse(monitor.nextRunAt) <= now)
            .slice(0, limit);
        for (const monitor of due) monitor.nextRunAt = new Date(now + 60000).toISOString();
        return due.map((monitor) => ({ ...monitor }));
    }
    save(monitor: Monitor) {
        if (this.monitors.has(monitor.id)) this.monitors.set(monitor.id, { ...monitor });
    }
    byPing(pingHash: string) {
        const id = this.pings.get(pingHash);
        const monitor = id ? this.monitors.get(id) : undefined;
        return monitor ? { ...monitor } : undefined;
    }
    addEvent(id: string, event: MonitorEvent) {
        this.log.set(id, [event, ...(this.log.get(id) ?? [])].slice(0, 50));
    }
    events(id: string) {
        return [...(this.log.get(id) ?? [])];
    }
}

export class PostgresMonitors implements MonitorRepository {
    constructor(private readonly pool: Pool) {}
    async create(monitor: Monitor, pingHash?: string) {
        await this.pool.query(
            'INSERT INTO monitors (id, account_id, monitor, ping_hash, next_run_at, paused) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
            [
                monitor.id,
                monitor.accountId,
                JSON.stringify(monitor),
                pingHash ?? null,
                monitor.nextRunAt,
                monitor.paused,
            ],
        );
    }
    async count(accountId: string) {
        const result = await this.pool.query<{ count: string }>(
            'SELECT count(*) FROM monitors WHERE account_id = $1',
            [accountId],
        );
        return Number(result.rows[0]!.count);
    }
    private static read(row: { monitor: Monitor; next_run_at: Date; paused: boolean }): Monitor {
        return { ...row.monitor, nextRunAt: row.next_run_at.toISOString(), paused: row.paused };
    }
    async list(accountId: string) {
        const result = await this.pool.query(
            'SELECT monitor, next_run_at, paused FROM monitors WHERE account_id = $1 ORDER BY created_at',
            [accountId],
        );
        return result.rows.map(PostgresMonitors.read);
    }
    async get(accountId: string, id: string) {
        if (!isUuid(id)) return undefined;
        const result = await this.pool.query(
            'SELECT monitor, next_run_at, paused FROM monitors WHERE account_id = $1 AND id = $2',
            [accountId, id],
        );
        return result.rows[0] ? PostgresMonitors.read(result.rows[0]) : undefined;
    }
    async delete(accountId: string, id: string) {
        if (!isUuid(id)) return false;
        const result = await this.pool.query(
            'DELETE FROM monitors WHERE account_id = $1 AND id = $2',
            [accountId, id],
        );
        return result.rowCount === 1;
    }
    async setPaused(accountId: string, id: string, paused: boolean) {
        if (!isUuid(id)) return false;
        const result = await this.pool.query(
            'UPDATE monitors SET paused = $3 WHERE account_id = $1 AND id = $2',
            [accountId, id, paused],
        );
        return result.rowCount === 1;
    }
    async claimDue(limit: number) {
        const result = await this.pool.query(
            `UPDATE monitors SET next_run_at = clock_timestamp() + interval '1 minute'
             WHERE id IN (
                SELECT id FROM monitors WHERE NOT paused AND next_run_at <= clock_timestamp()
                ORDER BY next_run_at LIMIT $1 FOR UPDATE SKIP LOCKED
             )
             RETURNING monitor, next_run_at, paused`,
            [limit],
        );
        return result.rows.map(PostgresMonitors.read);
    }
    async save(monitor: Monitor) {
        await this.pool.query(
            'UPDATE monitors SET monitor = $2::jsonb, next_run_at = $3 WHERE id = $1',
            [monitor.id, JSON.stringify(monitor), monitor.nextRunAt],
        );
    }
    async byPing(pingHash: string) {
        const result = await this.pool.query(
            'SELECT monitor, next_run_at, paused FROM monitors WHERE ping_hash = $1',
            [pingHash],
        );
        return result.rows[0] ? PostgresMonitors.read(result.rows[0]) : undefined;
    }
    async addEvent(id: string, event: MonitorEvent) {
        await this.pool.query(
            `WITH added AS (
                INSERT INTO monitor_events (monitor_id, event) VALUES ($1, $2::jsonb) RETURNING monitor_id
            )
            DELETE FROM monitor_events WHERE monitor_id IN (SELECT monitor_id FROM added)
                AND sequence <= (
                    SELECT sequence FROM monitor_events WHERE monitor_id = $1
                    ORDER BY sequence DESC OFFSET 49 LIMIT 1
                )`,
            [id, JSON.stringify(event)],
        );
    }
    async events(id: string) {
        const result = await this.pool.query<{ event: MonitorEvent }>(
            'SELECT event FROM monitor_events WHERE monitor_id = $1 ORDER BY sequence DESC',
            [id],
        );
        return result.rows.map((row) => row.event);
    }
}

export interface MonitorChecks {
    dns?(target: string, recordType: string, signal: AbortSignal): Promise<string[]>;
    http(url: string, signal: AbortSignal): Promise<{ status: number; body: string }>;
    tls(
        target: string,
        signal: AbortSignal,
    ): Promise<{ authorized: boolean; daysUntilExpiry: number }>;
    webhook(url: string, body: string, signal: AbortSignal): Promise<void>;
}
export const networkChecks: MonitorChecks = {
    dns: monitorDns,
    async http(url, signal) {
        const response = await publicRequest(url, signal, { body: true, limit: 256 * 1024 });
        return { status: response.status, body: response.body.toString('utf8') };
    },
    async tls(target, signal) {
        return (await inspectTls(target, signal)) as {
            authorized: boolean;
            daysUntilExpiry: number;
        };
    },
    async webhook(url, body, signal) {
        await publicRequest(url, signal, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            requestBody: body,
            body: false,
        });
    },
};

function validate(input: Record<string, unknown>, minInterval: number, origin: string) {
    const kind = input.kind;
    if (kind !== 'heartbeat' && kind !== 'http' && kind !== 'ssl' && kind !== 'dns')
        throw new HttpError(400, 'kind must be heartbeat, http, ssl or dns.');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!name) throw new HttpError(400, 'Give the monitor a name.');
    const interval = Number(input.intervalSeconds ?? (kind === 'ssl' ? 86400 : 300));
    if (!Number.isInteger(interval) || interval < minInterval || interval > 7 * 86400)
        throw new HttpError(
            400,
            `intervalSeconds must be between ${minInterval} (your plan’s minimum) and 604800.`,
        );
    const grace = Number(input.graceSeconds ?? 60);
    if (!Number.isInteger(grace) || grace < 0 || grace > 86400)
        throw new HttpError(400, 'graceSeconds must be between 0 and 86400.');
    let target: string | undefined;
    if (kind === 'dns') {
        try {
            target = publicDnsDomain(String(input.target ?? ''));
        } catch {
            throw new HttpError(400, 'DNS monitors need a public domain name.');
        }
        if (target === new URL(origin).hostname)
            throw new HttpError(400, 'Monitor your own domain, not Kivel.');
    } else if (kind !== 'heartbeat') {
        try {
            const raw = String(input.target ?? '');
            target = publicUrl(
                kind === 'ssl' && !raw.includes('://') ? `https://${raw}` : raw,
            ).href;
        } catch {
            throw new HttpError(400, 'target must be a public http(s) URL or hostname.');
        }
        if (new URL(target).hostname === new URL(origin).hostname)
            throw new HttpError(400, 'Monitor your own sites, not Kivel.');
    }
    let alertWebhook: string | undefined;
    if (input.alertWebhook !== undefined && input.alertWebhook !== '') {
        try {
            alertWebhook = publicUrl(String(input.alertWebhook)).href;
        } catch {
            throw new HttpError(400, 'alertWebhook must be a public http(s) URL.');
        }
    }
    const expectStatus = input.expectStatus === undefined ? undefined : Number(input.expectStatus);
    if (
        expectStatus !== undefined &&
        (!Number.isInteger(expectStatus) || expectStatus < 100 || expectStatus > 599)
    )
        throw new HttpError(400, 'expectStatus must be an HTTP status code.');
    const expectText =
        typeof input.expectText === 'string' && input.expectText
            ? input.expectText.slice(0, 200)
            : undefined;
    const sslDays = Number(input.sslDays ?? 14);
    if (!Number.isInteger(sslDays) || sslDays < 1 || sslDays > 90)
        throw new HttpError(400, 'sslDays must be between 1 and 90.');
    const dnsRecordType = String(input.dnsRecordType ?? 'A');
    if (kind === 'dns' && !['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'].includes(dnsRecordType))
        throw new HttpError(400, 'Choose A, AAAA, CNAME, MX, TXT, NS or CAA.');
    return {
        kind,
        name,
        intervalSeconds: interval,
        graceSeconds: grace,
        ...(target ? { target } : {}),
        ...(alertWebhook ? { alertWebhook } : {}),
        ...(kind === 'http' && expectStatus !== undefined ? { expectStatus } : {}),
        ...(kind === 'http' && expectText ? { expectText } : {}),
        ...(kind === 'ssl' ? { sslDays } : {}),
        ...(kind === 'dns' ? { dnsRecordType } : {}),
    } as const;
}

interface MonitorContext {
    app: FastifyInstance;
    access: Access;
    monitors: MonitorRepository;
    identities: IdentityRepository;
    recovery: RecoveryRepository;
    mail?: MailSender;
    limits: RateLimitRepository;
    origin: string;
    checks?: MonitorChecks;
    tickMs?: number;
}

export function registerMonitors({
    app,
    access,
    monitors,
    identities,
    recovery,
    mail,
    limits,
    origin,
    checks = networkChecks,
    tickMs = 15000,
}: MonitorContext) {
    const view = (monitor: Monitor) => {
        const { accountId: _account, failures: _failures, ...rest } = monitor;
        return rest;
    };
    async function owner(request: FastifyRequest, write: boolean) {
        const actor = await access.scope(request, write ? 'resources:write' : 'resources:read');
        requireWorkspace(actor);
        return { accountId: actor.identity.account.id, plan: actor.plan };
    }

    async function alert(monitor: Monitor, message: string) {
        const subject = `${monitor.status === 'down' ? '🔴 Down' : '🟢 Up again'}: ${monitor.name}`;
        const signal = AbortSignal.timeout(8000);
        if (monitor.alertWebhook)
            await checks
                .webhook(
                    monitor.alertWebhook,
                    JSON.stringify({
                        monitor: { id: monitor.id, name: monitor.name, kind: monitor.kind },
                        status: monitor.status,
                        message,
                        at: new Date().toISOString(),
                    }),
                    signal,
                )
                .catch(() =>
                    app.log.warn({ monitor: monitor.id }, 'Monitor webhook alert failed.'),
                );
        if (!mail) return;
        // At most 10 alert emails a minute per workspace, so a flapping site cannot flood an inbox.
        if (await limits.consume(`monitor-mail:${monitor.accountId}`, 10)) return;
        const members = await identities.members(monitor.accountId);
        const ownerId = members.find((member) => member.role === 'owner')?.userId;
        const contact = ownerId ? await recovery.status(ownerId) : undefined;
        if (!contact?.email || !contact.verifiedAt) return;
        await mail
            .send({
                to: contact.email,
                subject,
                text: `${monitor.name} is ${monitor.status === 'down' ? 'DOWN' : 'back UP'}.\n\n${message}\n\nManage your monitors: ${access.appUrl('/monitors/', '/account/#monitors')}\n`,
            })
            .catch(() => app.log.warn({ monitor: monitor.id }, 'Monitor email alert failed.'));
    }

    async function check(monitor: Monitor) {
        const now = Date.now();
        const signal = AbortSignal.timeout(10000);
        let ok = true;
        let message = '';
        const started = performance.now();
        let dnsBaseline = monitor.dnsBaseline,
            lastDnsAnswers = monitor.lastDnsAnswers;
        if (monitor.kind === 'heartbeat') {
            const last = Date.parse(monitor.lastPingAt ?? monitor.createdAt);
            ok = now < last + (monitor.intervalSeconds + monitor.graceSeconds) * 1000;
            message = ok
                ? 'Pings are on time.'
                : `No ping for ${Math.round((now - last) / 60000)} minutes.`;
        } else if (monitor.kind === 'http') {
            try {
                const response = await checks.http(monitor.target!, signal);
                const statusOk = monitor.expectStatus
                    ? response.status === monitor.expectStatus
                    : response.status < 400;
                const textOk = !monitor.expectText || response.body.includes(monitor.expectText);
                ok = statusOk && textOk;
                message = !statusOk
                    ? `Answered ${response.status}.`
                    : !textOk
                      ? `Answered ${response.status} without “${monitor.expectText}”.`
                      : `Answered ${response.status}.`;
            } catch (error) {
                ok = false;
                message = error instanceof Error ? error.message : 'No answer.';
            }
        } else if (monitor.kind === 'dns') {
            try {
                lastDnsAnswers = (
                    await (checks.dns ?? monitorDns)(
                        monitor.target!,
                        monitor.dnsRecordType ?? 'A',
                        signal,
                    )
                ).sort();
                dnsBaseline ??= lastDnsAnswers;
                ok = JSON.stringify(lastDnsAnswers) === JSON.stringify(dnsBaseline);
                message = ok
                    ? `${monitor.dnsRecordType ?? 'A'} records match the baseline.`
                    : `${monitor.dnsRecordType ?? 'A'} records changed. Review the new answers and accept them only if expected.`;
            } catch (error) {
                ok = false;
                message = error instanceof Error ? error.message : 'DNS check failed.';
            }
        } else {
            try {
                const tls = await checks.tls(monitor.target!, signal);
                ok = tls.authorized && tls.daysUntilExpiry >= (monitor.sslDays ?? 14);
                message = !tls.authorized
                    ? 'The certificate is not valid for this host.'
                    : `The certificate expires in ${tls.daysUntilExpiry} days.`;
            } catch (error) {
                ok = false;
                message = error instanceof Error ? error.message : 'TLS check failed.';
            }
        }
        const failures = ok ? 0 : monitor.failures + 1;
        // Active checks confirm a failure once, 30 seconds later, before calling it down.
        const confirming = !ok && monitor.kind !== 'heartbeat' && failures < 2;
        const status: MonitorStatus = ok ? 'up' : confirming ? monitor.status : 'down';
        const changed = status !== monitor.status && status !== 'pending';
        const durationMs = Math.round(performance.now() - started);
        const next: Monitor = {
            ...monitor,
            lastDurationMs: durationMs,
            recentChecks: [
                ...(monitor.recentChecks ?? []),
                {
                    at: new Date(now).toISOString(),
                    status: ok ? ('up' as const) : ('down' as const),
                    durationMs,
                },
            ].slice(-50),
            ...(dnsBaseline ? { dnsBaseline } : {}),
            ...(lastDnsAnswers ? { lastDnsAnswers } : {}),
            status,
            failures,
            lastCheckAt: new Date(now).toISOString(),
            lastMessage: message,
            nextRunAt: new Date(
                now + (confirming ? 30 : monitor.intervalSeconds) * 1000,
            ).toISOString(),
            ...(changed ? { lastChangeAt: new Date(now).toISOString() } : {}),
        };
        await monitors.save(next);
        if (changed) {
            await monitors.addEvent(monitor.id, { at: next.lastCheckAt!, status, message });
            // A first "up" after creation is not news; only real transitions alert.
            if (monitor.status !== 'pending' || status === 'down') await alert(next, message);
        }
    }

    let running: Promise<unknown> | undefined;
    async function tick() {
        const due = await monitors.claimDue(20);
        for (let index = 0; index < due.length; index += 8)
            await Promise.all(
                due
                    .slice(index, index + 8)
                    .map((monitor) =>
                        check(monitor).catch((error) =>
                            app.log.warn(
                                { err: error, monitor: monitor.id },
                                'Monitor check failed.',
                            ),
                        ),
                    ),
            );
    }
    const timer = setInterval(() => {
        if (running) return;
        running = tick()
            .catch(() => app.log.error('Monitor scheduler failed.'))
            .finally(() => {
                running = undefined;
            });
    }, tickMs);
    timer.unref();
    app.addHook('onClose', async () => {
        clearInterval(timer);
        await running;
    });
    app.decorate('runMonitors', tick);

    app.post('/api/monitors', async (request, reply) => {
        const { accountId, plan } = await owner(request, true);
        const allowed = plans[plan].monitors;
        if ((await monitors.count(accountId)) >= allowed.count)
            throw new HttpError(
                403,
                `Your plan includes ${allowed.count} monitors. Delete one or upgrade for more.`,
            );
        const settings = validate(
            (request.body ?? {}) as Record<string, unknown>,
            allowed.minInterval,
            origin,
        );
        const now = new Date();
        const token =
            settings.kind === 'heartbeat' ? randomBytes(24).toString('base64url') : undefined;
        const monitor: Monitor = {
            id: randomUUID(),
            accountId,
            ...settings,
            paused: false,
            status: 'pending',
            failures: 0,
            createdAt: now.toISOString(),
            nextRunAt: new Date(
                now.getTime() +
                    (settings.kind === 'heartbeat'
                        ? (settings.intervalSeconds + settings.graceSeconds) * 1000
                        : 0),
            ).toISOString(),
        };
        await monitors.create(monitor, token ? hash(token) : undefined);
        return reply.code(201).send({
            ...view(monitor),
            ...(token ? { pingUrl: `${origin}/ping/${token}` } : {}),
        });
    });
    app.post<{ Params: { id: string } }>('/api/monitors/:id/accept-dns', async (request) => {
        const actor = await owner(request, true);
        const monitor = await monitors.get(actor.accountId, request.params.id);
        if (!monitor || monitor.kind !== 'dns')
            throw new HttpError(404, 'DNS monitor unavailable.');
        if (!monitor.lastDnsAnswers?.length)
            throw new HttpError(
                409,
                'Wait for a successful DNS lookup before accepting its answers.',
            );
        await monitors.save({
            ...monitor,
            dnsBaseline: [...monitor.lastDnsAnswers],
            failures: 0,
            status: 'up',
            lastMessage: 'DNS baseline updated by the workspace.',
            nextRunAt: new Date().toISOString(),
        });
        return { accepted: true };
    });
    app.get('/api/monitors', async (request) => {
        const { accountId, plan } = await owner(request, false);
        return {
            monitors: (await monitors.list(accountId)).map(view),
            limit: plans[plan].monitors.count,
            minIntervalSeconds: plans[plan].monitors.minInterval,
        };
    });
    app.get<{ Params: { id: string } }>('/api/monitors/:id', async (request) => {
        const { accountId } = await owner(request, false);
        const monitor = await monitors.get(accountId, request.params.id);
        if (!monitor) throw new HttpError(404, 'Monitor not found.');
        return { ...view(monitor), events: await monitors.events(monitor.id) };
    });
    app.patch<{ Params: { id: string } }>('/api/monitors/:id', async (request) => {
        const { accountId } = await owner(request, true);
        const body = (request.body ?? {}) as { paused?: unknown };
        if (typeof body.paused !== 'boolean')
            throw new HttpError(400, 'Send {"paused": true|false}.');
        if (!(await monitors.setPaused(accountId, request.params.id, body.paused)))
            throw new HttpError(404, 'Monitor not found.');
        return { paused: body.paused };
    });
    app.delete<{ Params: { id: string } }>('/api/monitors/:id', async (request, reply) => {
        const { accountId } = await owner(request, true);
        return (await monitors.delete(accountId, request.params.id))
            ? reply.code(204).send()
            : reply.code(404).send({ error: 'Monitor not found.' });
    });

    // Heartbeats: jobs call this when they finish. /fail reports an explicit failure.
    for (const url of ['/ping/:token', '/ping/:token/fail'])
        app.route<{ Params: { token: string } }>({
            method: ['GET', 'POST', 'HEAD'],
            url,
            handler: async (request, reply) => {
                if (!/^[A-Za-z0-9_-]{32}$/.test(request.params.token))
                    return reply.code(404).send({ error: 'Unknown ping URL.' });
                const retry = await limits.consume(`ping:${request.params.token}`, 60);
                if (retry)
                    return reply
                        .header('Retry-After', retry)
                        .code(429)
                        .send({ error: 'Too many pings.' });
                const monitor = await monitors.byPing(hash(request.params.token));
                if (!monitor) return reply.code(404).send({ error: 'Unknown ping URL.' });
                const failed = request.url.split('?')[0]!.endsWith('/fail');
                const now = new Date();
                const status: MonitorStatus = failed ? 'down' : 'up';
                const message = failed ? 'The job reported a failure.' : 'Ping received.';
                const changed = status !== monitor.status;
                const next: Monitor = {
                    ...monitor,
                    status,
                    failures: 0,
                    lastPingAt: now.toISOString(),
                    lastCheckAt: now.toISOString(),
                    lastMessage: message,
                    nextRunAt: new Date(
                        now.getTime() + (monitor.intervalSeconds + monitor.graceSeconds) * 1000,
                    ).toISOString(),
                    ...(changed ? { lastChangeAt: now.toISOString() } : {}),
                };
                await monitors.save(next);
                if (changed) {
                    await monitors.addEvent(monitor.id, { at: now.toISOString(), status, message });
                    if (monitor.status !== 'pending' || failed) void alert(next, message);
                }
                return reply.send({ ok: true, status });
            },
        });
}

declare module 'fastify' {
    interface FastifyInstance {
        /** Runs one scheduler pass immediately; used by tests. */
        runMonitors(): Promise<void>;
    }
}
