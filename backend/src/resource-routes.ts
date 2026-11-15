import { publicMockPayload } from './oauth.js';
import { sendLlmMock } from './llm-mock.js';
import { matchMockCondition, renderMockBody } from '@kivel.io/tools/mock-behavior';
import {
    assertMockCalls,
    MemoryMockCalls,
    MOCK_CALL_LIMIT,
    mockCall,
    pageMockCalls,
} from './mock-calls.js';
import type { MockCallRepository } from './mock-calls.js';
import { isUuid } from './security.js';
import { echoRequest } from './http-echo.js';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError, resourceToken as token } from './access.js';
import type { Actor } from './access.js';
import { RateLimitError } from './errors.js';
import { entitlement } from './entitlements.js';
import { publicRequest, publicUrl } from './public-network.js';
import type { Access } from './access.js';
import type { ResourceRepository } from './resources.js';
import { MAX_FILE_BYTES } from './resources.js';
import type { RateLimitRepository } from './rate-limit.js';

import { randomUUID } from 'node:crypto';
import type { MockConfig, MockRoute } from '@kivel.io/tools/mock-config';
import { webSocketMockUrl } from './websocket-mock.js';
import { mockConfigDocument, validateMock, mockPayload } from '@kivel.io/tools/mock-config';
import { crudPath, initialCrud, executeCrud } from '@kivel.io/tools/mock-crud';
import type { CrudState, CrudReply } from '@kivel.io/tools/mock-crud';
import { parseJsonSafely } from '@kivel.io/tools/engine';
export { validateMock, mockPayload } from '@kivel.io/tools/mock-config';

/** Proxy mocks are a paid feature and may only point at public APIs other than Kivel. */
export function checkMockProxy(config: MockConfig, actor: Actor, origin: string) {
    if (!config.proxy) return;
    entitlement(actor.identity, 'mockProxy', origin);
    let target: URL;
    try {
        target = publicUrl(config.proxy.target);
    } catch {
        throw new HttpError(400, 'The proxy target must be a public http(s) URL.');
    }
    if (target.hostname === new URL(origin).hostname)
        throw new HttpError(400, 'Proxy to your own API, not Kivel.');
}

const proxiedTypes =
    /^(application\/(json|problem\+json|xml)|text\/(plain|csv|xml))(;\s*charset=[\w-]+)?$/i;
const PROXY_BODY_LIMIT = 256 * 1024;
export type { MockRoute, MockConfig } from '@kivel.io/tools/mock-config';
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ANY'];
const missing = { error: 'Resource not found or access denied.' };
function routeMatches(pattern: string, path: string) {
    const expected = pattern.replace(/\/$/, '').split('/');
    const actual = path.replace(/\/$/, '').split('/');
    return (
        expected.length === actual.length &&
        expected.every((part, index) =>
            part.startsWith(':') ? !!actual[index] : part === actual[index],
        )
    );
}
interface MockRecording {
    id: string;
    at: string;
    route: MockRoute;
}
interface ScenarioRun {
    at: number;
    states: Record<string, string>;
}
const scenarioTtl = 60 * 60 * 1000;
const runId = (value: unknown) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value))
        throw new HttpError(400, 'Use a run ID of 1 to 64 letters, digits, underscores or dashes.');
    return `run:${value}`;
};
const scenarioState = (run: ScenarioRun | undefined, name: string) =>
    (run && Date.now() - run.at < scenarioTtl ? run.states[`state:${name}`] : undefined) ?? 'start';

function selectRoute(
    config: MockConfig,
    method: string,
    request: Parameters<typeof matchMockCondition>[1],
    run?: ScenarioRun,
    hasRun = false,
) {
    const methods = method === 'HEAD' ? ['HEAD', 'GET', 'ANY'] : [method, 'ANY'];
    for (const expected of methods) {
        const match = config.routes.find(
            (route) =>
                route.method === expected &&
                routeMatches(route.path, request.path) &&
                (!route.scenario ||
                    (hasRun && scenarioState(run, route.scenario.name) === route.scenario.from)) &&
                matchMockCondition(route, request),
        );
        if (match) return match;
    }
    return undefined;
}

function mockOptions(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Provide a JSON object.');
    return value as Record<string, unknown>;
}
interface IdRoute {
    Params: { id: string; '*': string };
}
export function registerResources(
    app: FastifyInstance,
    store: ResourceRepository,
    limits: RateLimitRepository,
    origin: string,
    access: Access,
    calls: MockCallRepository = new MemoryMockCalls(),
    proxySend: typeof publicRequest = publicRequest,
    ownerIsPaid: (ownerId?: string) => Promise<boolean> = async () => true,
) {
    const transfers = new Set<FastifyRequest>();
    const streams = new Set<AbortController>();
    app.addHook('preClose', async () => {
        for (const controller of streams) controller.abort();
    });
    const transferLimit = async (
        request: FastifyRequest,
        reply: import('fastify').FastifyReply,
    ) => {
        if (transfers.size >= 2)
            return reply
                .header('Retry-After', '5')
                .code(503)
                .send({ error: 'File transfers are busy. Try again shortly.' });
        transfers.add(request);
    };
    app.addHook('onResponse', async (request) => {
        transfers.delete(request);
    });
    app.addHook('onRequestAbort', async (request) => {
        transfers.delete(request);
    });
    const createLimit = async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
        await access.rate(request, true);
    };
    app.post('/api/mocks/validate', async (request) => {
        try {
            return mockConfigDocument(request.body);
        } catch (error) {
            throw new HttpError(400, (error as Error).message);
        }
    });
    app.post('/api/mocks', { onRequest: createLimit }, async (request, reply) => {
        let config: MockConfig;
        try {
            config = validateMock(request.body);
        } catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
        checkMockProxy(config, await access.actor(request), origin);
        const created = await store.create(
            'mock',
            mockPayload(config),
            undefined,
            await access.allocation(request),
        );
        if (!created)
            return reply
                .code(503)
                .send({ error: 'Temporary resource capacity reached. Try again later.' });
        return reply.code(201).send({
            ...created,
            endpointUrl: config.websocket
                ? webSocketMockUrl(origin, created.id)
                : `${origin}/mock/${created.id}`,
        });
    });
    app.put<IdRoute>('/api/mocks/:id', async (request, reply) => {
        if (
            !(await store.read(
                request.params.id,
                'mock',
                token(request),
                (await access.actor(request)).identity?.account.id,
            ))
        )
            return reply.code(404).send(missing);
        let config: MockConfig;
        try {
            config = validateMock(request.body);
        } catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
        checkMockProxy(config, await access.actor(request), origin);
        const ownerId = (await access.actor(request)).identity?.account.id;
        const result = await store.mutateMock(
            request.params.id,
            { managementToken: token(request), ...(ownerId ? { ownerId } : {}) },
            (previous) => {
                if (previous.payment)
                    throw new HttpError(400, 'Use the test payments API to update this resource.');
                if (previous.oauth)
                    throw new HttpError(400, 'Use /api/oauth-providers to update this provider.');
                if (Boolean(previous.websocket) !== Boolean(config.websocket))
                    throw new HttpError(400, 'Create a new mock to change its protocol.');
                const payload: Record<string, unknown> = mockPayload(config);
                const previousProxy = previous.proxy as MockConfig['proxy'];
                if (
                    config.proxy?.record === 'staged' &&
                    previousProxy?.record === 'staged' &&
                    config.proxy.target === previousProxy.target &&
                    config.proxy.pathPrefix === previousProxy.pathPrefix &&
                    previous.mockRecordings
                )
                    payload.mockRecordings = previous.mockRecordings;
                if (config.crud || previous.crudState)
                    payload.crudState = {
                        records: config.crud ? initialCrud(config.crud).records : [],
                        revision:
                            Number((previous.crudState as CrudState | undefined)?.revision ?? -1) +
                            1,
                    };
                return { payload, result: true };
            },
        );
        if (!result) return reply.code(404).send(missing);
        if (result === 'full')
            return reply
                .code(503)
                .send({ error: 'Temporary resource capacity reached. Try again later.' });
        return reply.code(204).send();
    });
    app.post<IdRoute>('/api/mocks/:id/reset', async (request, reply) => {
        const actor = await access.scope(request, 'resources:write');
        const result = await store.mutateMock(
            request.params.id,
            {
                managementToken: token(request),
                ...(actor.identity ? { ownerId: actor.identity.account.id } : {}),
            },
            (payload) => {
                if (payload.payment)
                    throw new HttpError(
                        400,
                        'Test payment resources cannot be reset as mock APIs.',
                    );
                const config = payload as unknown as MockConfig;
                if (!config.crud)
                    return {
                        payload,
                        result: { status: 404, body: missing, revision: 0 } as CrudReply,
                    };
                const revision =
                    Number((payload.crudState as CrudState | undefined)?.revision ?? 0) + 1;
                return {
                    payload: { ...payload, crudState: { ...initialCrud(config.crud), revision } },
                    result: {
                        status: 200,
                        body: { reset: true, records: config.crud.seed.length, revision },
                        revision,
                    } as CrudReply,
                };
            },
        );
        if (!result) return reply.code(404).send(missing);
        if (result === 'full')
            return reply.code(503).send({ error: 'Temporary resource capacity reached.' });
        return reply
            .header('X-Mock-Revision', String(result.revision))
            .code(result.status)
            .send(result.body);
    });
    for (const [path, kind] of [
        ['mocks', 'mock'],
        ['files', 'file'],
    ] as const) {
        app.get<IdRoute>(`/api/${path}/:id`, async (request, reply) => {
            const resource = await store.read(
                request.params.id,
                kind,
                token(request),
                (await access.actor(request)).identity?.account.id,
            );
            if (!resource) return reply.code(404).send(missing);
            return {
                id: resource.id,
                visibility: resource.visibility,
                accessVersion: resource.accessVersion,
                expiresAt: resource.expiresAt,
                uses: resource.uses,
                ...publicMockPayload(resource.payload),
                ...(kind === 'file'
                    ? {
                          downloadUrl: `${origin}/files/${resource.id}`,
                          remainingDownloads: Math.max(
                              0,
                              (resource.maxUses ?? 100) - resource.uses,
                          ),
                      }
                    : {
                          endpointUrl: resource.payload.payment
                              ? `${origin}/${({ wallet: 'api/test-wallets', paywall: 'pay', checkout: 'checkout' } as Record<string, string>)[(resource.payload.payment as { kind: string }).kind]}/${resource.id}`
                              : resource.payload.oauth
                                ? `${origin}/oauth/${resource.id}`
                                : resource.payload.websocket
                                  ? webSocketMockUrl(origin, resource.id)
                                  : `${origin}/mock/${resource.id}`,
                          ...(resource.payload.oauth
                              ? {
                                    issuer: `${origin}/oauth/${resource.id}`,
                                    client_id: (resource.payload.oauthState as { clientId: string })
                                        .clientId,
                                }
                              : {}),
                      }),
            };
        });
        app.delete<IdRoute>(`/api/${path}/:id`, async (request, reply) => {
            if (
                !(await store.delete(
                    request.params.id,
                    kind,
                    token(request),
                    (await access.actor(request)).identity?.account.id,
                ))
            )
                return reply.code(404).send(missing);
            return reply.code(204).send();
        });
    }
    app.register(async (uploads) => {
        uploads.removeAllContentTypeParsers();
        uploads.addContentTypeParser(
            'application/octet-stream',
            { parseAs: 'buffer', bodyLimit: MAX_FILE_BYTES },
            (_request, body, done) => done(null, body),
        );
        uploads.post(
            '/api/files',
            { bodyLimit: MAX_FILE_BYTES, onRequest: [transferLimit, createLimit] },
            async (request, reply) => {
                if (!(request.body instanceof Buffer) || !request.body.length)
                    return reply
                        .code(400)
                        .send({ error: 'Upload a nonempty file using application/octet-stream.' });
                const header = request.headers['x-file-name'];
                let name = '';
                try {
                    name = typeof header === 'string' ? decodeURIComponent(header) : '';
                } catch {}
                name =
                    name
                        .split(/[\\/]/)
                        .pop()
                        ?.replace(/[\x00-\x1f\x7f]/g, '')
                        .trim() ?? '';
                if (!name || name.length > 150)
                    return reply.code(400).send({
                        error: 'Provide a URL-encoded filename of up to 150 characters in X-File-Name.',
                    });
                const created = await store.create(
                    'file',
                    { name, size: request.body.length },
                    request.body,
                    await access.allocation(request),
                );
                if (!created)
                    return reply
                        .code(503)
                        .send({ error: 'Temporary resource capacity reached. Try again later.' });
                return reply.code(201).send({
                    ...created,
                    name,
                    size: request.body.length,
                    downloadUrl: `${origin}/files/${created.id}`,
                    remainingDownloads: (await access.allocation(request)).maxUses,
                });
            },
        );
    });
    app.get<IdRoute>('/files/:id/info', async (request, reply) => {
        const info = await store.peek(
            request.params.id,
            'file',
            await access.publicCredential(request),
        );
        if (!info) return reply.code(404).send(missing);
        return {
            id: info.id,
            name: info.payload.name,
            size: info.payload.size,
            expiresAt: info.expiresAt,
            visibility: info.visibility,
            remainingDownloads: Math.max(0, (info.maxUses ?? 100) - info.uses),
        };
    });
    app.route<IdRoute>({
        method: ['GET', 'HEAD'],
        url: '/files/:id([a-fA-F0-9-]{36})',
        onRequest: transferLimit,
        handler: async (request, reply) => {
            const accessCredential = await access.publicCredential(request);
            if (request.method === 'HEAD') {
                const info = await store.peek(request.params.id, 'file', accessCredential);
                if (!info) return reply.code(404).send(missing);
                return reply
                    .type('application/octet-stream')
                    .header('Content-Length', String(info.payload.size))
                    .send();
            }
            const file = await store.use(
                request.params.id,
                'file',
                undefined,
                await access.publicCredential(request),
            );
            if (!file)
                return reply
                    .code(404)
                    .send({ error: 'File unavailable, expired, or download limit reached.' });
            const name = String(file.payload.name);
            const encoded = encodeURIComponent(name).replace(
                /['()*]/g,
                (character) => `%${character.charCodeAt(0).toString(16)}`,
            );
            reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
            reply.header(
                'Content-Disposition',
                `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encoded}`,
            );
            reply.type('application/octet-stream').header('Content-Length', file.data.length);
            return reply.send(request.method === 'HEAD' ? undefined : file.data);
        },
    });
    const readMock = async (request: FastifyRequest<IdRoute>, includeMcp = false) => {
        const ownerId = (await access.actor(request)).identity?.account.id;
        const managementToken = token(request);
        const mock = await store.read(request.params.id, 'mock', managementToken, ownerId);
        return (
            mock ??
            (includeMcp
                ? await store.read(request.params.id, 'mcp', managementToken, ownerId)
                : undefined)
        );
    };
    app.get<IdRoute>('/api/mocks/:id/config', async (request, reply) => {
        const resource = await readMock(request);
        if (!resource) return reply.code(404).send(missing);
        if (resource.payload.oauth || resource.payload.payment)
            throw new HttpError(
                400,
                'Use the protocol resource endpoint to read this configuration.',
            );
        return mockConfigDocument(resource.payload);
    });
    app.get<IdRoute & { Querystring: Record<string, unknown> }>(
        '/api/mocks/:id/calls',
        async (request, reply) => {
            const resource = await readMock(request, true);
            if (!resource)
                return reply.code(404).send({ error: 'Resource unavailable or access denied.' });
            const history = await calls.list(resource.id);
            return pageMockCalls(history, request.query) ?? { calls: history };
        },
    );
    app.post<IdRoute>('/api/mocks/:id/assertions', async (request, reply) => {
        const resource = await readMock(request, true);
        if (!resource) return reply.code(404).send(missing);
        return assertMockCalls(await calls.list(resource.id), mockOptions(request.body));
    });
    app.get<IdRoute>('/api/mocks/:id/recordings', async (request, reply) => {
        const resource = await readMock(request);
        if (!resource) return reply.code(404).send(missing);
        return {
            recordings: (resource.payload.mockRecordings as MockRecording[] | undefined) ?? [],
        };
    });
    app.post<IdRoute>('/api/mocks/:id/recordings/promote', async (request, reply) => {
        const { recordingId } = mockOptions(request.body);
        if (typeof recordingId !== 'string' || !isUuid(recordingId))
            throw new HttpError(400, 'Provide the ID from this mock’s recordings.');
        const actor = await access.actor(request);
        const updated = await store.mutateMock(
            request.params.id,
            {
                managementToken: token(request),
                ...(actor.identity ? { ownerId: actor.identity.account.id } : {}),
            },
            (payload) => {
                const config = payload as unknown as MockConfig;
                const recordings = (payload.mockRecordings as MockRecording[] | undefined) ?? [];
                const candidate = recordings.find((entry) => entry.id === recordingId);
                if (!candidate) throw new HttpError(404, 'Recording unavailable or expired.');
                if (config.routes.length >= 20)
                    throw new HttpError(
                        409,
                        'The mock has 20 routes. Remove a route before promoting.',
                    );
                if (
                    config.routes.some(
                        (route) =>
                            route.method === candidate.route.method &&
                            route.path === candidate.route.path &&
                            !route.condition &&
                            !route.graphql &&
                            !route.scenario,
                    )
                )
                    throw new HttpError(409, 'A fixture already exists for this method and path.');
                return {
                    payload: {
                        ...payload,
                        routes: [...config.routes, candidate.route],
                        mockRecordings: recordings.filter((item) => item.id !== recordingId),
                    },
                    result: { route: candidate.route },
                };
            },
        );
        if (!updated) return reply.code(404).send(missing);
        if (updated === 'full') return reply.code(503).send({ error: 'Mock storage is full.' });
        return updated;
    });
    app.post<IdRoute>('/api/mocks/:id/scenarios/reset', async (request, reply) => {
        const key = runId(mockOptions(request.body).run);
        const actor = await access.actor(request);
        const updated = await store.mutateMock(
            request.params.id,
            {
                managementToken: token(request),
                ...(actor.identity ? { ownerId: actor.identity.account.id } : {}),
            },
            (payload) => {
                const runs = {
                    ...(payload.scenarioRuns as Record<string, ScenarioRun> | undefined),
                };
                if (!Object.hasOwn(runs, key)) return { payload, result: { reset: false } };
                delete runs[key];
                return { payload: { ...payload, scenarioRuns: runs }, result: { reset: true } };
            },
        );
        if (!updated) return reply.code(404).send(missing);
        if (updated === 'full') return reply.code(503).send({ error: 'Mock storage is full.' });
        return updated;
    });
    app.post<IdRoute>('/api/mocks/:id/match', async (request, reply) => {
        const resource = await readMock(request);
        if (!resource) return reply.code(404).send(missing);
        const config = resource.payload as unknown as MockConfig;
        if (
            config.websocket ||
            config.echo ||
            config.llm ||
            resource.payload.oauth ||
            resource.payload.payment
        )
            throw new HttpError(400, 'Match diagnostics are available for REST routes.');
        const input = mockOptions(request.body);
        const { method, path } = input;
        if (
            typeof method !== 'string' ||
            method === 'ANY' ||
            !methods.includes(method) ||
            typeof path !== 'string' ||
            !/^\/[^?#\x00-\x20]{0,511}$/.test(path)
        )
            throw new HttpError(
                400,
                'Provide an uppercase HTTP method and an exact path starting with /.',
            );
        const mockRequest = {
            path,
            body: input.body,
            query: input.query === undefined ? {} : mockOptions(input.query),
            headers: Object.fromEntries(
                Object.entries(input.headers === undefined ? {} : mockOptions(input.headers)).map(
                    ([key, value]) => [key.toLowerCase(), value],
                ),
            ),
        };
        const runKey = input.run === undefined ? undefined : runId(input.run);
        const run = runKey
            ? (resource.payload.scenarioRuns as Record<string, ScenarioRun> | undefined)?.[runKey]
            : undefined;
        const selected =
            config.crud && crudPath(config.crud, path)
                ? undefined
                : selectRoute(config, method, mockRequest, run, Boolean(runKey));
        return {
            selected: selected ? config.routes.indexOf(selected) + 1 : null,
            ...(selected
                ? { status: selected.status }
                : {
                      fallback:
                          config.crud && crudPath(config.crud, path)
                              ? 'crud'
                              : config.proxy
                                ? 'proxy'
                                : 'notFound',
                  }),
            routes: config.routes.map((route, index) => ({
                index: index + 1,
                method: route.method,
                path: route.path,
                result: !routeMatches(route.path, path)
                    ? 'pathMismatch'
                    : route.method !== method &&
                        route.method !== 'ANY' &&
                        !(method === 'HEAD' && route.method === 'GET')
                      ? 'methodMismatch'
                      : route.scenario &&
                          (!runKey ||
                              scenarioState(run, route.scenario.name) !== route.scenario.from)
                        ? 'scenarioMismatch'
                        : !matchMockCondition(route, mockRequest)
                          ? 'conditionMismatch'
                          : route === selected
                            ? 'selected'
                            : 'lowerPriority',
                ...(route.condition
                    ? { condition: { source: route.condition.source, key: route.condition.key } }
                    : {}),
                ...(route.graphql ? { operationName: route.graphql.operationName } : {}),
            })),
        };
    });
    app.register(async (mocks) => {
        const accepted = new WeakSet<FastifyRequest>();
        mocks.removeAllContentTypeParsers();
        mocks.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) =>
            done(null, body),
        );
        for (const url of ['/mock/:id', '/mock/:id/*']) {
            mocks.route<IdRoute>({
                method: methods.filter(
                    (method) => method !== 'ANY',
                ) as import('fastify').HTTPMethods[],
                url,
                onSend: async (request, reply, payload) => {
                    if (!accepted.delete(request)) return payload;
                    try {
                        await calls.record(
                            request.params.id,
                            mockCall({
                                method: request.method,
                                path: `/${request.params['*'] ?? ''}`,
                                query: request.query,
                                status: reply.statusCode,
                                durationMs: reply.elapsedTime,
                                headers: request.headers,
                                body: request.body,
                            }),
                        );
                    } catch (error) {
                        request.log.warn({ err: error }, 'Unable to record a mock call.');
                    }
                    return payload;
                },
                handler: async (request, reply) => {
                    reply
                        .header('Access-Control-Allow-Origin', '*')
                        .header('Access-Control-Expose-Headers', 'X-Mock-Revision');
                    if (
                        request.method === 'OPTIONS' &&
                        request.headers['access-control-request-method']
                    ) {
                        const requested = String(
                            request.headers['access-control-request-headers'] ?? '',
                        )
                            .toLowerCase()
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean);
                        if (
                            requested.length > 20 ||
                            requested.some(
                                (name) =>
                                    name.length > 80 ||
                                    !/^(?:accept|content-type|authorization|x-[a-z0-9-]+)$/.test(
                                        name,
                                    ) ||
                                    /^x-(?:forwarded-|real-ip|original-|http-method|method-override|host)/.test(
                                        name,
                                    ),
                            )
                        )
                            return reply
                                .code(400)
                                .send({ error: 'Unsupported cross-origin request headers.' });
                        return reply
                            .header(
                                'Access-Control-Allow-Methods',
                                'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
                            )
                            .header(
                                'Access-Control-Allow-Headers',
                                [
                                    ...new Set([
                                        'content-type',
                                        'authorization',
                                        'x-access-token',
                                        'x-mock-if-revision',
                                        ...requested,
                                    ]),
                                ].join(', '),
                            )
                            .header('Access-Control-Max-Age', '600')
                            .code(204)
                            .send();
                    }
                    if (!isUuid(request.params.id))
                        return reply.code(404).send({ error: 'Mock API unavailable or expired.' });
                    const retry = await limits.consume(`mock:${request.params.id}`, 120);
                    if (retry)
                        throw new RateLimitError(
                            'mocks.requests',
                            'Mock request limit exceeded.',
                            retry,
                        );
                    const caller = await access.publicCredential(
                        request,
                        ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
                            ? 'resources:read'
                            : 'resources:write',
                    );
                    const metadata = await store.peek(request.params.id, 'mock', caller);
                    if (!metadata) return reply.code(404).send(missing);
                    const path = `/${request.params['*'] ?? ''}`;
                    if (metadata.payload.payment)
                        return reply
                            .code(404)
                            .send({ error: 'Use the test payment resource URL.' });
                    if (metadata.payload.oauth)
                        return reply.code(404).send({ error: 'Use this provider’s issuer URL.' });
                    if (metadata.payload.websocket)
                        return reply.code(404).send({ error: 'Use this mock’s WebSocket URL.' });
                    accepted.add(request);
                    const initialConfig = metadata.payload as unknown as MockConfig;
                    if (initialConfig.crud && crudPath(initialConfig.crud, path)) {
                        if (request.method === 'OPTIONS')
                            return reply
                                .header('Allow', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
                                .header(
                                    'X-Mock-Revision',
                                    String(
                                        (metadata.payload.crudState as CrudState | undefined)
                                            ?.revision ?? 0,
                                    ),
                                )
                                .code(204)
                                .send();
                        let body: unknown;
                        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
                            if (
                                !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(
                                    request.headers['content-type'] ?? '',
                                )
                            )
                                return reply
                                    .code(415)
                                    .send({ error: 'Send record bodies as application/json.' });
                            if (!Buffer.isBuffer(request.body) || request.body.length > 4096)
                                return reply
                                    .code(413)
                                    .send({ error: 'A record body must fit within 4 KiB.' });
                            try {
                                body = parseJsonSafely(request.body.toString('utf8'));
                            } catch {
                                return reply.code(400).send({
                                    error: 'Provide valid JSON without numeric precision loss. Use strings for large IDs.',
                                });
                            }
                        }
                        const result = await store.mutateMock<CrudReply>(
                            request.params.id,
                            caller,
                            (payload) => {
                                if (payload.payment)
                                    throw new HttpError(
                                        400,
                                        'Test payment resources cannot be reset as mock APIs.',
                                    );
                                const config = payload as unknown as MockConfig;
                                if (!config.crud || !crudPath(config.crud, path))
                                    return {
                                        payload,
                                        result: { status: 404, body: missing, revision: 0 },
                                    };
                                const state = (payload.crudState ??
                                    initialCrud(config.crud)) as CrudState;
                                const result = executeCrud(config.crud, state, {
                                    method: request.method,
                                    path,
                                    query: request.query as Record<string, unknown>,
                                    body,
                                    ifRevision:
                                        typeof request.headers['x-mock-if-revision'] === 'string'
                                            ? request.headers['x-mock-if-revision']
                                            : undefined,
                                });
                                return { payload: { ...payload, crudState: state }, result };
                            },
                        );
                        if (!result) return reply.code(404).send(missing);
                        if (result === 'full')
                            return reply
                                .code(503)
                                .send({ error: 'Temporary resource capacity reached.' });
                        return reply
                            .type('application/json')
                            .header('X-Mock-Revision', String(result.revision))
                            .code(result.status)
                            .send(request.method === 'HEAD' ? undefined : result.body);
                    }
                    const resource = await store.use(request.params.id, 'mock', undefined, caller);
                    if (!resource) return reply.code(404).send(missing);
                    const config = resource.payload as unknown as MockConfig;
                    if (config.llm) return sendLlmMock(config.llm, path, request, reply, streams);
                    if (config.echo)
                        return reply
                            .type('application/json')
                            .send(
                                request.method === 'HEAD' ? undefined : echoRequest(request, path),
                            );
                    let body: unknown = request.body;
                    if (
                        config.routes.some(
                            (route) =>
                                route.condition?.source === 'body' ||
                                route.graphql ||
                                (route.template && route.body.includes('{{body.')),
                        ) &&
                        Buffer.isBuffer(body) &&
                        body.length > 0 &&
                        /^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(
                            request.headers['content-type'] ?? '',
                        )
                    ) {
                        try {
                            body = JSON.parse(body.toString('utf8'));
                        } catch {
                            return reply
                                .code(400)
                                .send({ error: 'Provide a valid JSON request body.' });
                        }
                    }
                    const mockRequest = {
                        path,
                        query: request.query as Record<string, unknown>,
                        headers: request.headers,
                        body,
                    };
                    const runHeader = request.headers['x-kivel-mock-run'];
                    let route = selectRoute(config, request.method, mockRequest);
                    if (runHeader !== undefined && config.routes.some((item) => item.scenario)) {
                        const key = runId(runHeader);
                        const now = Date.now();
                        const result = await store.mutateMock(
                            request.params.id,
                            caller,
                            (payload) => {
                                const current = payload as unknown as MockConfig;
                                const runs = Object.fromEntries(
                                    Object.entries(
                                        (payload.scenarioRuns as
                                            Record<string, ScenarioRun> | undefined) ?? {},
                                    ).filter(([, value]) => now - value.at < scenarioTtl),
                                );
                                const run = runs[key];
                                const matched = selectRoute(
                                    current,
                                    request.method,
                                    mockRequest,
                                    run,
                                    true,
                                );
                                const transition = matched?.scenario;
                                if (!transition) return { payload, result: { route: matched } };
                                if (!run && Object.keys(runs).length >= MOCK_CALL_LIMIT)
                                    throw new HttpError(
                                        429,
                                        'Too many active scenario runs. Reset a run or wait for expiry.',
                                    );
                                runs[key] = {
                                    at: now,
                                    states: {
                                        ...run?.states,
                                        [`state:${transition.name}`]: transition.to,
                                    },
                                };
                                return {
                                    payload: { ...payload, scenarioRuns: runs },
                                    result: { route: matched },
                                };
                            },
                        );
                        if (!result) return reply.code(404).send(missing);
                        if (result === 'full')
                            return reply.code(503).send({ error: 'Mock storage is full.' });
                        route = result.route;
                    }
                    if (!route && config.proxy && !(await ownerIsPaid(resource.ownerId)))
                        return reply.code(402).send({
                            error: 'This mock’s proxy is paused because its owner’s plan no longer includes it.',
                        });
                    if (!route && config.proxy) {
                        const target = new URL(config.proxy.target);
                        target.pathname = `${target.pathname.replace(/\/$/, '')}${path}` || '/';
                        target.search = request.url.split('?')[1] ?? '';
                        const outgoing = Buffer.isBuffer(request.body) ? request.body : undefined;
                        const method = request.method as 'GET';
                        let upstream;
                        try {
                            upstream = await proxySend(target.href, AbortSignal.timeout(8000), {
                                method,
                                headers: {
                                    ...(typeof request.headers['content-type'] === 'string'
                                        ? { 'Content-Type': request.headers['content-type'] }
                                        : {}),
                                    Accept: String(request.headers.accept ?? '*/*'),
                                },
                                ...(outgoing?.length
                                    ? { requestBody: outgoing.toString('utf8') }
                                    : {}),
                                limit: PROXY_BODY_LIMIT,
                            });
                        } catch {
                            return reply
                                .code(502)
                                .send({ error: 'The proxied API did not answer in time.' });
                        }
                        const upstreamType = String(upstream.headers['content-type'] ?? '');
                        const safeType = proxiedTypes.test(upstreamType)
                            ? upstreamType
                            : 'application/octet-stream';
                        const recordable =
                            config.proxy.record &&
                            safeType !== 'application/octet-stream' &&
                            !upstream.truncated &&
                            upstream.body.length <= 50 * 1024 &&
                            upstream.status >= 200 &&
                            upstream.status <= 599 &&
                            !['HEAD', 'OPTIONS'].includes(request.method) &&
                            path.length <= 200 &&
                            /^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*\/?)?$/.test(path) &&
                            !path.split('/').some((part) => part === '.' || part === '..');
                        if (
                            recordable &&
                            (config.proxy.record === true ||
                                path === config.proxy.pathPrefix ||
                                path.startsWith(`${config.proxy.pathPrefix}/`))
                        ) {
                            const snapshot = config.proxy;
                            const fixture: MockRoute = {
                                method: request.method,
                                path,
                                status: upstream.status,
                                body: upstream.body.toString('utf8'),
                                headers: { 'content-type': safeType.split(';')[0]! },
                                delayMs: 0,
                            };
                            await store.mutateMock(request.params.id, caller, (payload) => {
                                const current = payload as unknown as MockConfig;
                                if (
                                    current.proxy?.target !== snapshot.target ||
                                    current.proxy.record !== snapshot.record ||
                                    current.proxy.pathPrefix !== snapshot.pathPrefix ||
                                    current.routes.some(
                                        (item) =>
                                            item.method === fixture.method && item.path === path,
                                    )
                                )
                                    return { payload, result: false };
                                if (snapshot.record === 'staged') {
                                    const recordings =
                                        (payload.mockRecordings as MockRecording[] | undefined) ??
                                        [];
                                    return {
                                        payload: {
                                            ...payload,
                                            mockRecordings: [
                                                {
                                                    id: randomUUID(),
                                                    at: new Date().toISOString(),
                                                    route: fixture,
                                                },
                                                ...recordings.filter(
                                                    (item) =>
                                                        item.route.method !== fixture.method ||
                                                        item.route.path !== path,
                                                ),
                                            ].slice(0, 5),
                                        },
                                        result: true,
                                    };
                                }
                                if (current.routes.length >= 20) return { payload, result: false };
                                return {
                                    payload: { ...payload, routes: [...current.routes, fixture] },
                                    result: true,
                                };
                            });
                        }
                        return reply
                            .header('Content-Security-Policy', "default-src 'none'; sandbox")
                            .header('X-Mock-Proxied', 'true')
                            .type(safeType)
                            .code(upstream.status)
                            .send(request.method === 'HEAD' ? undefined : upstream.body);
                    }
                    if (!route) return reply.code(404).send({ error: 'No matching mock route.' });
                    // Simulated outages let callers test retries without a separate failing route.
                    if (route.failureRate && Math.random() * 100 < route.failureRate) {
                        if (route.delayMs)
                            await new Promise((resolve) => setTimeout(resolve, route.delayMs));
                        return reply
                            .header('X-Mock-Simulated-Failure', 'true')
                            .code(route.failureStatus ?? 503)
                            .send({ error: 'Simulated failure from Kivel mock.' });
                    }
                    if (route.requestsPerMinute !== undefined) {
                        const retry = await limits.consume(
                            `mock-quota:${resource.id}:${route.method}:${route.path}`,
                            route.requestsPerMinute,
                        );
                        if (retry)
                            throw new RateLimitError(
                                'mocks.route',
                                'Configured mock quota exceeded.',
                                retry,
                            );
                    }
                    if (route.stream && request.method !== 'HEAD') {
                        if (streams.size >= 16)
                            return reply
                                .header('Retry-After', '5')
                                .code(503)
                                .send({ error: 'Stream capacity reached. Try again shortly.' });
                        const controller = new AbortController(),
                            abort = () => controller.abort(),
                            behavior = route.stream,
                            formattedSse =
                                behavior.mode === 'sse' &&
                                /^(?:data|event|id|retry):|^:/m.test(route.body),
                            chunks = formattedSse
                                ? route.body
                                      .replace(/\r\n|\r/g, '\n')
                                      .split('\n\n')
                                      .filter(Boolean)
                                : route.body.split(/\r\n|\r|\n/);
                        streams.add(controller);
                        const output = Readable.from(
                            (async function* () {
                                if (route.delayMs)
                                    await delay(route.delayMs, undefined, {
                                        signal: controller.signal,
                                    });
                                for (let i = 0; i < chunks.length; i++) {
                                    if (i)
                                        await delay(behavior.intervalMs, undefined, {
                                            signal: controller.signal,
                                        });
                                    if (controller.signal.aborted) return;
                                    yield behavior.mode === 'sse'
                                        ? formattedSse
                                            ? `${chunks[i]}\n\n`
                                            : `id: ${i + 1}\nevent: message\ndata: ${chunks[i]}\n\n`
                                        : chunks[i] + (i < chunks.length - 1 ? '\n' : '');
                                }
                            })(),
                            { signal: controller.signal },
                        );
                        reply.raw.once('close', abort);
                        request.raw.once('aborted', abort);
                        output.once('close', () => {
                            streams.delete(controller);
                            reply.raw.removeListener('close', abort);
                            request.raw.removeListener('aborted', abort);
                            controller.abort();
                        });
                        return reply
                            .header('Content-Security-Policy', "default-src 'none'; sandbox")
                            .header('X-Accel-Buffering', 'no')
                            .type(behavior.mode === 'sse' ? 'text/event-stream' : 'text/plain')
                            .send(output);
                    }
                    let rendered: string;
                    try {
                        rendered = renderMockBody(route, mockRequest);
                    } catch (error) {
                        return reply.code(400).send({ error: (error as Error).message });
                    }
                    if (route.delayMs)
                        await new Promise((resolve) => setTimeout(resolve, route.delayMs));
                    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
                    reply.type(route.headers['content-type'] ?? 'application/json');
                    for (const [key, value] of Object.entries(route.headers))
                        reply.header(key, value);
                    return reply
                        .code(route.status)
                        .send(
                            request.method === 'HEAD' || [204, 205, 304].includes(route.status)
                                ? undefined
                                : rendered,
                        );
                },
            });
        }
    });
}
