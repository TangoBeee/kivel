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
            !body.monitorIds.length ||
            body.monitorIds.length > 20 ||
            body.monitorIds.some((id) => typeof id !== 'string' || !isUuid(id)) ||
            new Set(body.monitorIds).size !== body.monitorIds.length
        )
            throw new HttpError(
                400,
                'Provide a name (1–80 characters), optional description (240) and 1–20 distinct monitor IDs.',
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
            !body.monitorIds.length ||
            body.monitorIds.length > 20 ||
            body.monitorIds.some((id) => typeof id !== 'string' || !isUuid(id)) ||
            new Set(body.monitorIds).size !== body.monitorIds.length
        )
            throw new HttpError(400, 'Provide a name, description and 1–20 distinct monitor IDs.');
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
        const allUp = published.every(
            (monitor) => monitor && !monitor.paused && !stale(monitor) && monitor.status === 'up',
        );
        const down = published.some(
            (monitor) => monitor && !monitor.paused && monitor.status === 'down',
        );
        const summary = allUp
            ? 'All published services are operational.'
            : down
              ? 'Some services are experiencing issues.'
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
        reply.header('X-Robots-Tag', 'noindex, nofollow');
        return reply
            .type('text/html')
            .send(
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · Status</title><link rel="stylesheet" href="/status/style.css"></head><body><main><header><h1>${name}</h1><p>${description}</p></header><p class="summary">${summary}</p>${services.join('')}<footer>Published by a Kivel workspace. <a href="/">Kivel</a> · Refresh to see new checks.</footer></main></body></html>`,
            );
    });
}
