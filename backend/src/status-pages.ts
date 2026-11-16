import type { FastifyInstance } from 'fastify';
import { HttpError, resourceToken } from './access.js';
import type { Access } from './access.js';
import type { ResourceRepository } from './resources.js';
import type { MonitorRepository } from './monitors.js';
import { isUuid } from './security.js';
const escape = (input: string) =>
    input.replace(
        /[&<>"']/g,
        (value) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!,
    );
const componentStates = ['operational', 'degraded', 'outage'] as const;
const incidentStates = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
interface StatusComponent {
    id: string;
    name: string;
    status: (typeof componentStates)[number];
}
interface StatusIncident {
    id: string;
    name: string;
    componentIds: string[];
    updates: { at: string; status: (typeof incidentStates)[number]; message: string }[];
}
interface StatusMaintenance {
    id: string;
    name: string;
    componentIds: string[];
    startsAt: string;
    endsAt: string;
}
function records(value: unknown, max: number) {
    if (
        !Array.isArray(value) ||
        value.length > max ||
        value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    )
        throw new HttpError(400, `Provide up to ${max} entries.`);
    return value as Record<string, unknown>[];
}
function entryText(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        throw new HttpError(400, `Use text between 1 and ${max} characters.`);
    return value.trim();
}
function uniqueIds(values: Record<string, unknown>[]) {
    const ids = values.map((value) => value.id);
    if (ids.some((id) => typeof id !== 'string' || !isUuid(id)) || new Set(ids).size !== ids.length)
        throw new HttpError(400, 'Provide a distinct UUID for each entry.');
}
function timestamp(value: unknown) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
        !Number.isFinite(Date.parse(value))
    )
        throw new HttpError(400, 'Use ISO timestamps with an explicit timezone.');
    return new Date(value).toISOString();
}
function publication(payload: Record<string, unknown>) {
    return {
        components: (payload.components ?? []) as StatusComponent[],
        incidents: (payload.incidents ?? []) as StatusIncident[],
        maintenance: (payload.maintenance ?? []) as StatusMaintenance[],
    };
}
function updatePublication(payload: Record<string, unknown>, input: Record<string, unknown>) {
    if (Object.keys(input).some((key) => !['components', 'incidents', 'maintenance'].includes(key)))
        throw new HttpError(
            400,
            'Only components, incidents and maintenance can be published here.',
        );
    const saved = publication(payload);
    const result: Record<string, unknown> = {};
    if (input.components !== undefined) {
        const rows = records(input.components, 20);
        uniqueIds(rows);
        saved.components = rows.map((row) => {
            if (!componentStates.includes(row.status as StatusComponent['status']))
                throw new HttpError(
                    400,
                    'Choose operational, degraded or outage for each component.',
                );
            return {
                id: row.id as string,
                name: entryText(row.name, 80),
                status: row.status as StatusComponent['status'],
            };
        });
        result.components = saved.components;
    }
    const known = new Set(saved.components.map((component) => component.id));
    function affected(value: unknown): string[] {
        if (
            !Array.isArray(value) ||
            value.length > 20 ||
            new Set(value).size !== value.length ||
            value.some((id) => typeof id !== 'string' || !known.has(id))
        )
            throw new HttpError(400, 'Choose distinct components on this page.');
        return value;
    }
    if (input.incidents !== undefined) {
        const rows = records(input.incidents, 30);
        uniqueIds(rows);
        result.incidents = rows.map((row): StatusIncident => {
            const updates = records(row.updates, 20);
            if (!updates.length) throw new HttpError(400, 'An incident needs at least one update.');
            return {
                id: row.id as string,
                name: entryText(row.name, 80),
                componentIds: affected(row.componentIds ?? []),
                updates: updates
                    .map((update) => {
                        const status = update.status as StatusIncident['updates'][number]['status'];
                        if (!incidentStates.includes(status))
                            throw new HttpError(400, 'Choose a supported incident status.');
                        return {
                            at: timestamp(update.at),
                            status,
                            message: entryText(update.message, 500),
                        };
                    })
                    .sort((a, b) => a.at.localeCompare(b.at)),
            };
        });
    }
    if (input.maintenance !== undefined) {
        const rows = records(input.maintenance, 20);
        uniqueIds(rows);
        result.maintenance = rows.map((row): StatusMaintenance => {
            const startsAt = timestamp(row.startsAt),
                endsAt = timestamp(row.endsAt);
            if (endsAt <= startsAt || Date.parse(endsAt) - Date.parse(startsAt) > 30 * 86400000)
                throw new HttpError(
                    400,
                    'A maintenance window must end after it starts and last at most 30 days.',
                );
            return {
                id: row.id as string,
                name: entryText(row.name, 80),
                startsAt,
                endsAt,
                componentIds: affected(row.componentIds ?? []),
            };
        });
    }
    if (!Object.keys(result).length)
        throw new HttpError(400, 'Provide components, incidents or maintenance.');
    return result;
}
export function registerStatusPages(
    app: FastifyInstance,
    access: Access,
    resources: ResourceRepository,
    monitors: MonitorRepository,
) {
    app.post('/api/status-pages', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        await access.rate(request, true);
        const body = request.body as {
            name?: unknown;
            description?: unknown;
            monitorIds?: unknown;
        } | null;
        if (
            !body ||
            typeof body.name !== 'string' ||
            !body.name.trim() ||
            body.name.length > 80 ||
            (body.description !== undefined &&
                (typeof body.description !== 'string' || body.description.length > 240)) ||
            !Array.isArray(body.monitorIds) ||
            body.monitorIds.length > 20 ||
            body.monitorIds.some((id) => typeof id !== 'string' || !isUuid(id)) ||
            new Set(body.monitorIds).size !== body.monitorIds.length
        )
            throw new HttpError(
                400,
                'Provide a name (1–80 characters), optional description (240) and up to 20 distinct monitor IDs.',
            );
        for (const id of body.monitorIds)
            if (!(await monitors.get(actor.identity!.account.id, id)))
                throw new HttpError(404, 'A selected monitor is unavailable in this workspace.');
        const allocation = await access.allocation(request);
        const created = await resources.create(
            'status',
            {
                name: body.name.trim(),
                description: body.description ?? '',
                monitorIds: body.monitorIds,
            },
            undefined,
            allocation,
        );
        if (!created) throw new HttpError(503, 'Resource capacity reached.');
        return reply.code(201).send({
            ...created,
            persistent: allocation.persistent,
            pageUrl: `${access.origin}/status/${created.id}`,
        });
    });
    app.put<{ Params: { id: string } }>('/api/status-pages/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:write');
        const page = await resources.read(
            request.params.id,
            'status',
            resourceToken(request),
            actor.identity?.account.id,
        );
        if (!page || !actor.identity)
            throw new HttpError(404, 'Status page unavailable or access denied.');
        const body = request.body as {
            name?: unknown;
            description?: unknown;
            monitorIds?: unknown;
        } | null;
        if (
            !body ||
            typeof body.name !== 'string' ||
            !body.name.trim() ||
            body.name.length > 80 ||
            (body.description !== undefined &&
                (typeof body.description !== 'string' || body.description.length > 240)) ||
            !Array.isArray(body.monitorIds) ||
            body.monitorIds.length > 20 ||
            body.monitorIds.some((id) => typeof id !== 'string' || !isUuid(id)) ||
            new Set(body.monitorIds).size !== body.monitorIds.length
        )
            throw new HttpError(
                400,
                'Provide a name, description and up to 20 distinct monitor IDs.',
            );
        for (const id of body.monitorIds)
            if (!(await monitors.get(actor.identity!.account.id, id)))
                throw new HttpError(404, 'A selected monitor is unavailable in this workspace.');
        const result = await resources.update(
            page.id,
            'status',
            resourceToken(request),
            {
                name: body.name.trim(),
                description: body.description ?? '',
                monitorIds: body.monitorIds,
            },
            actor.identity!.account.id,
            true,
        );
        if (result === 'full') throw new HttpError(503, 'Resource capacity reached.');
        if (result !== 'updated') throw new HttpError(404, 'Status page expired before updating.');
        return { saved: true };
    });
    app.get<{ Params: { id: string } }>('/api/status-pages/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        const resource = await resources.read(
            request.params.id,
            'status',
            resourceToken(request),
            actor.identity?.account.id,
        );
        if (!resource) throw new HttpError(404, 'Status page unavailable or access denied.');
        return {
            id: resource.id,
            ...resource.payload,
            visibility: resource.visibility,
            expiresAt: resource.expiresAt,
            persistent: resource.persistent,
            pageUrl: `${access.origin}/status/${resource.id}`,
        };
    });
    app.patch<{ Params: { id: string } }>('/api/status-pages/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:write');
        await access.rate(request, true);
        const token = resourceToken(request);
        const accountId = actor.identity?.account.id;
        const page = await resources.read(request.params.id, 'status', token, accountId);
        if (!page || !accountId || page.ownerId !== accountId)
            throw new HttpError(404, 'Status page unavailable or access denied.');
        const input = request.body;
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new HttpError(400, 'Provide components, incidents or maintenance.');
        const changes = updatePublication(page.payload, input as Record<string, unknown>);
        const result = await resources.update(page.id, 'status', token, changes, accountId, true);
        if (result === 'full') throw new HttpError(503, 'Resource capacity reached.');
        if (result !== 'updated') throw new HttpError(404, 'Status page expired before updating.');
        return { saved: true };
    });
    app.delete<{ Params: { id: string } }>('/api/status-pages/:id', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        if (
            !(await resources.delete(
                request.params.id,
                'status',
                resourceToken(request),
                actor.identity?.account.id,
            ))
        )
            throw new HttpError(404, 'Status page unavailable or access denied.');
        return reply.code(204).send();
    });
    app.get('/status/style.css', async (_request, reply) =>
        reply
            .type('text/css')
            .send(
                `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#141414;font:16px/1.6 'Hanken Grotesk',system-ui,sans-serif}main{max-width:800px;margin:80px auto;padding:0 24px}h1{font-size:clamp(32px,6vw,48px);line-height:1.1;letter-spacing:-.035em;font-weight:500}p,small{color:#5b5b5b}.summary{padding:20px 0;border-block:1px solid #e8e8e8}.service{padding:24px 0;border-bottom:1px solid #e8e8e8}.row{display:flex;gap:16px;justify-content:space-between;align-items:baseline;overflow-wrap:anywhere}.status{border:1px solid #d3d4d0;border-radius:999px;padding:3px 12px;white-space:nowrap;font-size:14px}.up{color:#111312}.down{color:#ad3f3b}h2{font-size:18px;font-weight:500;margin:0}footer{margin-top:48px;font-size:14px}a{color:inherit;text-underline-offset:4px}details{margin-top:12px}ul{padding-left:20px}time{font-variant-numeric:tabular-nums}@media(max-width:480px){main{margin-block:40px}.row{align-items:flex-start}}`,
            ),
    );
    app.get<{ Params: { id: string } }>('/status/:id', async (request, reply) => {
        const resource = await resources.peek(
            request.params.id,
            'status',
            await access.publicCredential(request),
        );
        if (!resource?.ownerId)
            throw new HttpError(404, 'Status page unavailable or access denied.');
        const ids = resource.payload.monitorIds as string[];
        const published = await Promise.all(ids.map((id) => monitors.get(resource.ownerId!, id)));
        const name = escape(String(resource.payload.name)),
            description = escape(String(resource.payload.description));
        const stale = (monitor: NonNullable<(typeof published)[number]>) =>
            monitor.kind !== 'heartbeat' &&
            Boolean(
                monitor.lastCheckAt &&
                Date.now() - Date.parse(monitor.lastCheckAt) >
                    monitor.intervalSeconds * 2000 + 60000,
            );
        const { components, incidents, maintenance } = publication(resource.payload);
        const now = new Date().toISOString();
        const currentMaintenance = maintenance.filter(
            (entry) => entry.startsAt <= now && now < entry.endsAt,
        );
        const unresolved = incidents.some((entry) => entry.updates.at(-1)?.status !== 'resolved');
        const allUp =
            (published.length > 0 || components.length > 0) &&
            published.every(
                (monitor) =>
                    monitor && !monitor.paused && !stale(monitor) && monitor.status === 'up',
            );
        const down = published.some(
            (monitor) => monitor && !monitor.paused && monitor.status === 'down',
        );
        const manualIssue =
            components.some((component) => component.status !== 'operational') || unresolved;
        const summary =
            down || manualIssue
                ? 'Some services are experiencing issues.'
                : currentMaintenance.length
                  ? 'Scheduled maintenance is in progress.'
                  : allUp
                    ? 'All published services are operational.'
                    : 'Some services are awaiting checks or paused.';
        const services = await Promise.all(
            published.map(async (monitor) => {
                if (!monitor)
                    return '<section class="service"><h2>Service unavailable</h2><p>This service is no longer published.</p></section>';
                const status = monitor.paused
                    ? 'Paused'
                    : stale(monitor)
                      ? 'Checks delayed'
                      : monitor.status === 'up'
                        ? 'Operational'
                        : monitor.status === 'down'
                          ? 'Issue detected'
                          : 'Awaiting first check';
                const checks = monitor.recentChecks ?? [],
                    good = checks.filter((check) => check.status === 'up').length;
                const history = (await monitors.events(monitor.id)).slice(0, 10);
                return `<section class="service"><div class="row"><h2>${escape(monitor.name)}</h2><span class="status ${monitor.paused || stale(monitor) ? '' : monitor.status}">${status}</span></div><p>${monitor.lastCheckAt ? `Last checked <time datetime="${escape(monitor.lastCheckAt)}">${escape(new Date(monitor.lastCheckAt).toUTCString())}</time>.` : 'No completed checks yet.'}${monitor.lastDurationMs !== undefined ? ` Probe time: ${monitor.lastDurationMs} ms.` : ''}</p>${checks.length ? `<small>${good} of the latest ${checks.length} checks passed. This is a check sample, not a time-based uptime guarantee.</small>` : ''}${history.length ? `<details><summary>Recent status changes</summary><ul>${history.map((event) => `<li><time datetime="${escape(event.at)}">${escape(new Date(event.at).toUTCString())}</time> · ${event.status === 'down' ? 'Issue detected' : 'Operational'}</li>`).join('')}</ul></details>` : ''}</section>`;
            }),
        );
        const names = new Map(components.map(({ id, name }) => [id, name]));
        const affected = (ids: string[]) =>
            ids.flatMap((id) => (names.has(id) ? [escape(names.get(id)!)] : [])).join(', ');
        const time = (value: string) =>
            `<time datetime="${escape(value)}">${escape(new Date(value).toUTCString())}</time>`;
        const publicComponents = components
            .map(
                ({ name, status }) =>
                    `<section class="service"><div class="row"><h2>${escape(name)}</h2><span class="status ${status === 'operational' ? 'up' : 'down'}">${{ operational: 'Operational', degraded: 'Degraded', outage: 'Outage' }[status]}</span></div></section>`,
            )
            .join('');
        const publicIncidents = incidents
            .slice()
            .reverse()
            .map(
                (incident) =>
                    `<section class="service"><h2>${escape(incident.name)}</h2><small>${affected(incident.componentIds)}</small><ul>${incident.updates
                        .slice()
                        .reverse()
                        .map(
                            (entry) =>
                                `<li><strong>${escape(entry.status[0]!.toUpperCase() + entry.status.slice(1))}</strong> · ${time(entry.at)}<p>${escape(entry.message)}</p></li>`,
                        )
                        .join('')}</ul></section>`,
            )
            .join('');
        const publicMaintenance = maintenance
            .filter((entry) => entry.endsAt > now)
            .map(
                (entry) =>
                    `<section class="service"><h2>${escape(entry.name)}</h2><p>${time(entry.startsAt)} to ${time(entry.endsAt)}</p><small>${affected(entry.componentIds)}</small></section>`,
            )
            .join('');
        reply.header('X-Robots-Tag', 'noindex, nofollow');
        return reply
            .type('text/html')
            .send(
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · Status</title><link rel="stylesheet" href="/status/style.css"></head><body><main><header><h1>${name}</h1><p>${description}</p></header><p class="summary">${summary}</p>${services.join('')}${publicComponents}${publicIncidents ? '<h2>Incidents</h2>' + publicIncidents : ''}${publicMaintenance ? '<h2>Scheduled maintenance</h2>' + publicMaintenance : ''}<footer>Published by a Kivel workspace. <a href="/">Kivel</a> · Refresh to see new checks.</footer></main></body></html>`,
            );
    });
}
