import { matchMockCondition, renderMockBody } from '@socket-help/tools/mock-behavior';
import { MemoryMockCalls, mockCall } from './mock-calls.js';
import type { MockCallRepository } from './mock-calls.js';
import { isUuid } from './security.js';
import { echoRequest } from './http-echo.js';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { resourceToken as token } from './access.js';
import type { Access } from './access.js';
import type { ResourceRepository } from './resources.js';
import { MAX_FILE_BYTES } from './resources.js';
import type { RateLimitRepository } from './rate-limit.js';

import type { MockConfig } from '@socket-help/tools/mock-config';
import { validateMock, mockPayload } from '@socket-help/tools/mock-config';
import { crudPath, initialCrud, executeCrud } from '@socket-help/tools/mock-crud';
import type { CrudState, CrudReply } from '@socket-help/tools/mock-crud';
import { parseJsonSafely } from '@socket-help/tools/engine';
export { validateMock, mockPayload } from '@socket-help/tools/mock-config';
export type { MockRoute, MockConfig } from '@socket-help/tools/mock-config';
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
    app.post('/api/mocks', { onRequest: createLimit }, async (request, reply) => {
        let config: MockConfig;
        try {
            config = validateMock(request.body);
        } catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
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
        return reply.code(201).send({ ...created, endpointUrl: `${origin}/mock/${created.id}` });
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
        const ownerId = (await access.actor(request)).identity?.account.id;
        const result = await store.mutateMock(
            request.params.id,
            { managementToken: token(request), ...(ownerId ? { ownerId } : {}) },
            (previous) => {
                const payload = mockPayload(config);
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
                ...resource.payload,
                ...(kind === 'file'
                    ? {
                          downloadUrl: `${origin}/files/${resource.id}`,
                          remainingDownloads: Math.max(
                              0,
                              (resource.maxUses ?? 100) - resource.uses,
                          ),
                      }
                    : { endpointUrl: `${origin}/mock/${resource.id}` }),
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
        url: '/files/:id',
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
    // The calls a mock received, oldest first. Same credentials as reading the mock itself.
    app.get<IdRoute>('/api/mocks/:id/calls', async (request, reply) => {
        const resource = await store.read(
            request.params.id,
            'mock',
            token(request),
            (await access.actor(request)).identity?.account.id,
        );
        if (!resource)
            return reply.code(404).send({ error: 'Resource unavailable or access denied.' });
        return { calls: await calls.list(resource.id) };
    });
    app.register(async (mocks) => {
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
                // Log what callers sent and what the mock answered, after the response is out.
                onResponse: async (request, reply) => {
                    if (
                        !isUuid(request.params.id) ||
                        (request.method === 'OPTIONS' &&
                            request.headers['access-control-request-method'])
                    )
                        return;
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
                        return reply
                            .header('Retry-After', retry)
                            .code(429)
                            .send({ error: 'Mock request limit exceeded.' });
                    const caller = await access.publicCredential(
                        request,
                        ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
                            ? 'resources:read'
                            : 'resources:write',
                    );
                    const metadata = await store.peek(request.params.id, 'mock', caller);
                    if (!metadata) return reply.code(404).send(missing);
                    const path = `/${request.params['*'] ?? ''}`;
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
                    const matches = (method: string) =>
                        config.routes.find(
                            (route) =>
                                route.method === method &&
                                routeMatches(route.path, path) &&
                                matchMockCondition(route, mockRequest),
                        );
                    const route =
                        matches(request.method) ??
                        (request.method === 'HEAD' ? matches('GET') : undefined) ??
                        matches('ANY');
                    if (!route) return reply.code(404).send({ error: 'No matching mock route.' });
                    // Simulated outages let callers test retries without a separate failing route.
                    if (route.failureRate && Math.random() * 100 < route.failureRate) {
                        if (route.delayMs)
                            await new Promise((resolve) => setTimeout(resolve, route.delayMs));
                        return reply
                            .header('X-Mock-Simulated-Failure', 'true')
                            .code(route.failureStatus ?? 503)
                            .send({ error: 'Simulated failure from socket.help mock.' });
                    }
                    if (route.requestsPerMinute !== undefined) {
                        const retry = await limits.consume(
                            `mock-quota:${resource.id}:${route.method}:${route.path}`,
                            route.requestsPerMinute,
                        );
                        if (retry)
                            return reply
                                .header('Retry-After', String(retry))
                                .code(429)
                                .send({ error: 'Configured mock quota exceeded.' });
                    }
                    if (route.stream && request.method !== 'HEAD') {
                        if (streams.size >= 16)
                            return reply
                                .header('Retry-After', '5')
                                .code(503)
                                .send({ error: 'Stream capacity reached. Try again shortly.' });
                        const controller = new AbortController(),
                            abort = () => controller.abort(),
                            chunks = route.body.split(/\r\n|\r|\n/),
                            behavior = route.stream;
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
                                        ? `id: ${i + 1}\nevent: message\ndata: ${chunks[i]}\n\n`
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
