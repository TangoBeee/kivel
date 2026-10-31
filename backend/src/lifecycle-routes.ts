import type { FastifyInstance } from 'fastify';
import { plans } from '@socket-help/tools/plans';
import { Access, HttpError, resourceToken } from './access.js';
import type { EmailLifecycle } from './email-lifecycle.js';
import type { Visibility } from './sharing.js';
import type { InboxRepository } from './inboxes.js';
import type { ResourceRepository, ResourceKind } from './resources.js';
export function registerLifecycle(
    app: FastifyInstance,
    access: Access,
    inboxes: InboxRepository,
    resources: ResourceRepository,
    email?: EmailLifecycle,
) {
    app.get('/api/account/resources', async (request) => {
        const identity = await access.require(request, 'resources:read');
        await email?.reconcile(identity.account.id);
        const emailRows = new Map(
            ((await email?.addresses.list(identity.account.id)) ?? []).map((row) => [
                row.resourceId,
                row,
            ]),
        );
        const [inboxList, resourceList] = await Promise.all([
            inboxes.listOwned(identity.account.id),
            resources.listOwned(identity.account.id),
        ]);
        const items = [
            ...inboxList.map((inbox) => ({
                id: inbox.id,
                kind: 'inbox',
                visibility: inbox.visibility,
                createdAt: inbox.createdAt,
                expiresAt: inbox.expiresAt,
                persistent: inbox.persistent,
                storedBytes: inbox.storedBytes,
            })),
            ...resourceList.map((resource) => ({
                id: resource.id,
                kind: resource.kind,
                ...(resource.kind === 'email' && emailRows.get(resource.id)
                    ? {
                          name: emailRows.get(resource.id)!.address,
                          status: emailRows.get(resource.id)!.pausedAt ? 'paused' : 'active',
                      }
                    : {}),
                ...(resource.kind === 'email' && resource.payload.smtpCapture
                    ? { toolId: 'email-mock-smtp' }
                    : resource.kind === 'mock' && resource.payload.llm
                      ? { toolId: 'agents-mock-llm-endpoint' }
                      : resource.kind === 'mock' && resource.payload.crud
                        ? { toolId: 'mock-apis-stateful-crud-api' }
                        : resource.kind === 'mock' && resource.payload.echo
                          ? { toolId: 'network-http-echo' }
                          : {}),
                ...(typeof resource.payload.name === 'string'
                    ? { name: resource.payload.name }
                    : {}),
                available: resource.kind !== 'file' || resource.uses < (resource.maxUses ?? 100),
                visibility:
                    resource.kind === 'email' || resource.kind === 'job'
                        ? 'private'
                        : resource.visibility,
                createdAt: resource.createdAt,
                expiresAt: resource.expiresAt,
                persistent: resource.persistent,
                storedBytes: resource.storedBytes,
            })),
        ];
        return {
            resources: items.sort(
                (a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''),
            ),
            usage: {
                resourceCount: items.length,
                storedBytes: items.reduce((sum, item) => sum + item.storedBytes, 0),
            },
        };
    });
    for (const [path, kind] of [
        ['inboxes', 'inbox'],
        ['mocks', 'mock'],
        ['files', 'file'],
        ['mcp-servers', 'mcp'],
        ['status-pages', 'status'],
    ] as const)
        app.post<{ Params: { id: string } }>(`/api/${path}/:id/sharing`, async (request) => {
            const actor = await access.scope(request, 'resources:write'),
                body = request.body as { visibility?: unknown } | null;
            if (body?.visibility !== 'public' && body?.visibility !== 'private')
                throw new HttpError(400, 'visibility must be public or private.');
            const visibility: Visibility = body.visibility;
            const result =
                kind === 'inbox'
                    ? await inboxes.setSharing(
                          request.params.id,
                          resourceToken(request),
                          visibility,
                          actor.identity?.account.id,
                      )
                    : await resources.setSharing(
                          request.params.id,
                          kind,
                          resourceToken(request),
                          visibility,
                          actor.identity?.account.id,
                      );
            if (!result) throw new HttpError(404, 'Resource not found or access denied.');
            return result;
        });
    for (const [path, kind] of [
        ['inboxes', 'inbox'],
        ['mocks', 'mock'],
        ['files', 'file'],
        ['mcp-servers', 'mcp'],
        ['status-pages', 'status'],
    ] as const)
        app.post<{ Params: { id: string } }>(`/api/${path}/:id/renew`, async (request) => {
            const actor = await access.scope(request, 'resources:write'),
                ownerId = actor.identity?.account.id,
                token = resourceToken(request);
            const item =
                kind === 'inbox'
                    ? await inboxes.info(request.params.id, token, ownerId)
                    : await resources.read(request.params.id, kind, token, ownerId);
            if (!item) throw new HttpError(404, 'Resource not found or access denied.');
            const context = await access.allocation(request, request.body ?? {});
            const maxExpiry =
                (item.persistent && !context.persistent
                    ? Date.now()
                    : Date.parse(item.createdAt ?? item.expiresAt)) +
                plans[actor.plan].maxRetentionSeconds * 1000;
            const expiresAt = context.persistent
                ? context.expiresAt!
                : new Date(maxExpiry).toISOString();
            if (Date.parse(expiresAt) <= Date.now())
                throw new HttpError(
                    409,
                    'This resource has reached its maximum lifetime. Create a new resource.',
                );
            if (!context.persistent && !item.persistent && Date.parse(item.expiresAt) > maxExpiry)
                throw new HttpError(
                    409,
                    'Existing retention exceeds the current plan. It will expire on its existing date.',
                );
            const renewed =
                kind === 'inbox'
                    ? await inboxes.renew(item.id, token, expiresAt, ownerId, context.persistent)
                    : await resources.renew(
                          item.id,
                          kind as ResourceKind,
                          token,
                          expiresAt,
                          ownerId,
                          context.persistent,
                      );
            if (!renewed) throw new HttpError(404, 'Resource expired before renewal.');
            return { id: item.id, expiresAt, persistent: context.persistent };
        });
}
