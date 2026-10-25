import { registerMusic } from './music-routes.js';
import { RecoveryService } from './recovery.js';
import { MemoryRecoveryRepository } from './recovery-store.js';
import type { RecoveryRepository } from './recovery-store.js';
import type { MailSender } from './mail.js';
import type DodoPayments from 'dodopayments';
import { isUtf8 } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import fastify, { LogController } from 'fastify';
import type { FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { InboxStore } from './inboxes.js';
import type { InboxRepository } from './inboxes.js';
import { CREATIONS_PER_MINUTE, RateLimiter, REQUESTS_PER_MINUTE } from './rate-limit.js';
import type { RateLimitRepository } from './rate-limit.js';
import { clientKey, documentPolicies, policy } from './security.js';
import { openApi } from './openapi.js';
import { ResourceStore } from './resources.js';
import type { ResourceRepository } from './resources.js';
import { registerResources } from './resource-routes.js';
import { registerMcp } from './mcp.js';
import { MemoryAllocations, QuotaError } from './allocations.js';
import { Access, HttpError, resourceToken } from './access.js';
import { MemoryIdentityRepository } from './identity.js';
import type { IdentityRepository } from './identity.js';
import { registerAccounts } from './account-routes.js';
import { ToolService, registerTools } from './tool-routes.js';
import { registerLifecycle } from './lifecycle-routes.js';
import { registerBilling } from './billing.js';
import type { BillingRepository, BillingConfig } from './billing.js';

export const MAX_BODY_BYTES = 100 * 1024;

interface AppOptions {
    publicBaseUrl?: string;
    inboxStore?: InboxRepository;
    resourceStore?: ResourceRepository;
    rateLimiter?: RateLimitRepository;
    frontendDir?: string;
    trustProxy?: string[];
    logger?: boolean;
    logLevel?: string;
    production?: boolean;
    identityStore?: IdentityRepository;
    authSecret?: string;
    billingRepository?: BillingRepository;
    billingConfig?: BillingConfig;
    dodoClient?: DodoPayments;
    recoveryStore?: RecoveryRepository;
    mailSender?: MailSender;
}

interface InboxRoute {
    Params: { id: string };
}

const NOT_FOUND = { error: 'Inbox not found or access denied.' };

function capturedHeaders(request: FastifyRequest): Record<string, string | string[]> {
    return Object.fromEntries(
        Object.entries(request.headers)
            .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
            .map(([name, value]) => [
                name,
                /authorization|cookie|token|api[-_]?key|secret|password/i.test(name)
                    ? '[REDACTED]'
                    : value,
            ]),
    );
}

export function buildApp({
    publicBaseUrl = 'http://localhost:3000',
    inboxStore: providedInboxes,
    resourceStore: providedResources,
    rateLimiter = new RateLimiter(),
    frontendDir,
    trustProxy = [],
    logger = false,
    logLevel = 'info',
    production = false,
    identityStore = new MemoryIdentityRepository(),
    authSecret,
    billingRepository,
    billingConfig,
    dodoClient,
    recoveryStore,
    mailSender,
}: AppOptions = {}) {
    const ledger = new MemoryAllocations();
    const inboxStore = providedInboxes ?? new InboxStore({ quotaLedger: ledger });
    const resourceStore =
        providedResources ?? new ResourceStore(Date.now, undefined, undefined, ledger);
    const access = new Access(identityStore, rateLimiter, publicBaseUrl, authSecret);
    const tools = new ToolService(access, frontendDir);
    const baseUrl = new URL(publicBaseUrl);
    if (
        !['http:', 'https:'].includes(baseUrl.protocol) ||
        baseUrl.username ||
        baseUrl.password ||
        baseUrl.pathname !== '/' ||
        baseUrl.search ||
        baseUrl.hash
    ) {
        throw new Error(
            'PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment.',
        );
    }

    const app = fastify({
        bodyLimit: MAX_BODY_BYTES,
        requestTimeout: 60_000,
        connectionTimeout: 45_000,
        exposeHeadRoutes: false,
        trustProxy: trustProxy.length ? trustProxy : false,
        logger: logger ? { level: logLevel } : false,
        logController: new LogController({ disableRequestLogging: true }),
        genReqId: () => randomUUID(),
    });
    app.server.maxConnections = 512;
    // Webhook senders may attach bodies to any supported method.
    for (const method of ['GET', 'HEAD', 'DELETE', 'OPTIONS']) {
        app.addHttpMethod(method, { hasBody: true, overrideExisting: true });
    }

    let cleanup: Promise<unknown> | undefined;
    const cleanupTimer = setInterval(() => {
        if (cleanup) return;
        cleanup = Promise.all([
            inboxStore.deleteExpired(),
            resourceStore.deleteExpired(),
            rateLimiter.deleteExpired(),
            identityStore.cleanup(),
        ])
            .catch(() => app.log.error('Resource cleanup failed'))
            .finally(() => {
                cleanup = undefined;
            });
    }, 60_000);
    cleanupTimer.unref();
    app.addHook('onClose', async () => {
        clearInterval(cleanupTimer);
        await cleanup;
        await tools.close();
    });

    let pagePolicies = new Map<string, string>();
    app.addHook('onReady', async () => {
        pagePolicies = await documentPolicies(frontendDir);
    });

    app.setErrorHandler((error, request, reply) => {
        const failure = error as { statusCode?: number; code?: string; message?: string };
        if (
            failure.message === 'account_resource_limit' ||
            failure.message === 'account_storage_limit'
        )
            error = new QuotaError(
                failure.message === 'account_resource_limit' ? 'resources' : 'storage',
            );
        const expected =
            error instanceof HttpError || error instanceof QuotaError ? error : undefined;
        if (expected) {
            if (expected instanceof HttpError && expected.retryAfter)
                reply.header('Retry-After', expected.retryAfter);
            return reply
                .code(expected.statusCode)
                .send({ error: expected.message, requestId: request.id });
        }
        const status =
            failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500
                ? failure.statusCode
                : 500;
        if (status === 500)
            app.log.error({ code: failure.code, requestId: request.id }, 'Request failed');
        const messages: Record<number, string> = {
            400: 'Invalid request.',
            413: `Request body exceeds ${Math.round((request.routeOptions.bodyLimit ?? MAX_BODY_BYTES) / 1024)} KiB.`,
            415: 'Unsupported content type.',
        };
        if (/^\/mcp(?:\/|$)/.test(new URL(request.url, baseUrl).pathname)) {
            const body = request.body as { id?: unknown } | null;
            const id =
                body &&
                (typeof body.id === 'string' ||
                    (typeof body.id === 'number' && Number.isSafeInteger(body.id)))
                    ? body.id
                    : null;
            return reply.code(status).send({
                jsonrpc: '2.0',
                id,
                error: {
                    code:
                        failure.code === 'FST_ERR_CTP_INVALID_JSON_BODY'
                            ? -32700
                            : status >= 500
                              ? -32603
                              : -32600,
                    message:
                        status >= 500
                            ? 'Service temporarily unavailable.'
                            : (messages[status] ?? 'Invalid MCP request.'),
                },
            });
        }
        return reply.code(status).send({
            error:
                messages[status] ??
                (status >= 500 ? 'Service temporarily unavailable.' : 'Request rejected.'),
            requestId: request.id,
        });
    });

    // Every JSON error socket.help sends carries the request ID, so a failure can be traced.
    // Mock endpoints are skipped: their responses are configured by the user and sent as written.
    app.addHook('onSend', async (request, reply, payload) => {
        if (
            reply.statusCode < 400 ||
            typeof payload !== 'string' ||
            !payload.startsWith('{"error":') ||
            /^\/mock\//.test(request.url)
        )
            return payload;
        try {
            const body = JSON.parse(payload);
            if (Object.keys(body).length === 1 && typeof body.error === 'string')
                return JSON.stringify({ error: body.error, requestId: request.id });
        } catch {}
        return payload;
    });

    app.addHook('onResponse', async (request, reply) => {
        app.log.info(
            {
                requestId: request.id,
                method: request.method,
                route: request.routeOptions.url ?? 'unmatched',
                status: reply.statusCode,
                duration: reply.elapsedTime,
            },
            'Request completed',
        );
    });

    app.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Request-Id', request.id);
        reply.header('Referrer-Policy', 'no-referrer');
        if (
            /^\/(api|hooks|mock|mcp|files|billing)(\/|$)/.test(
                new URL(request.url, baseUrl).pathname,
            )
        )
            reply.header('X-Robots-Tag', 'noindex, nofollow, nosnippet');
        reply.header(
            'Content-Security-Policy',
            pagePolicies.get(new URL(request.url, baseUrl).pathname) ?? policy(),
        );
        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if (production && request.protocol === 'https')
            reply.header('Strict-Transport-Security', 'max-age=31536000');
        if (
            request.url.startsWith('/api/') &&
            request.headers.origin &&
            request.headers.origin !== baseUrl.origin
        ) {
            return reply.code(403).send({ error: 'Origin not allowed.' });
        }
        if (['/health', '/ready'].includes(request.routeOptions.url ?? '')) return;
        if (
            frontendDir &&
            request.routeOptions.url === '/*' &&
            !request.url.startsWith('/api/') &&
            !request.url.startsWith('/hooks/')
        )
            return;
        if (request.url.startsWith('/api/') || request.url.split('?')[0] === '/mcp') {
            await access.rate(request);
            if (/^\/api\/(inboxes|mocks|files|mcp-servers)(\/|\?|$)/.test(request.url))
                await access.scope(
                    request,
                    ['GET', 'HEAD'].includes(request.method) ? 'resources:read' : 'resources:write',
                );
            return;
        }
        const retryAfter = await rateLimiter.consume(
            `ip:${clientKey(request.ip)}`,
            REQUESTS_PER_MINUTE,
        );
        if (retryAfter) {
            return reply
                .header('Retry-After', retryAfter)
                .code(429)
                .send({ error: 'Request rate limit exceeded.' });
        }
    });

    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/api/openapi.json', async () => openApi(baseUrl.origin));
    app.get('/ready', async (_request, reply) => {
        try {
            await Promise.all([inboxStore.ping(), resourceStore.ping()]);
            return { status: 'ok' };
        } catch {
            return reply.code(503).send({ status: 'unavailable' });
        }
    });

    app.post(
        '/api/inboxes',
        {
            onRequest: async (request, reply) => {
                await access.rate(request, true);
            },
        },
        async (request, reply) => {
            const inbox = await inboxStore.create(await access.allocation(request));
            if (!inbox) {
                return reply.code(503).send({ error: 'Inbox capacity reached. Try again later.' });
            }

            return reply.code(201).send({
                ...inbox,
                webhookUrl: new URL(`/hooks/${inbox.id}`, baseUrl).href,
            });
        },
    );

    // Keep raw webhook parsing isolated from management API JSON parsing.
    app.register(async (hooks) => {
        hooks.removeAllContentTypeParsers();
        hooks.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) =>
            done(null, body),
        );

        hooks.route<InboxRoute>({
            method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            url: '/hooks/:id',
            onRequest: async (request, reply) => {
                if (
                    !(await inboxStore.has(
                        request.params.id,
                        await access.publicCredential(request, 'resources:write'),
                    ))
                )
                    return reply.code(404).send(NOT_FOUND);
                const retryAfter = await rateLimiter.consume(
                    `hook:${request.params.id}`,
                    REQUESTS_PER_MINUTE,
                );
                if (retryAfter) {
                    return reply
                        .header('Retry-After', retryAfter)
                        .code(429)
                        .send({ error: 'Webhook rate limit exceeded.' });
                }
            },
            handler: async (request, reply) => {
                const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
                const encoding = isUtf8(body) ? 'utf8' : 'base64';
                const result = await inboxStore.capture(
                    request.params.id,
                    {
                        method: request.method,
                        path: request.url.split('?')[0]!,
                        headers: capturedHeaders(request),
                        query: request.query as Record<string, string | string[]>,
                        body: body.toString(encoding),
                        bodyEncoding: encoding,
                        bodySize: body.length,
                    },
                    await access.publicCredential(request, 'resources:write'),
                );

                switch (result.status) {
                    case 'not-found':
                        return reply.code(404).send(NOT_FOUND);
                    case 'inbox-full':
                        return reply.code(429).send({
                            error: 'Inbox history is full. Create another inbox or delete this one.',
                        });
                    case 'storage-full':
                        return reply
                            .code(503)
                            .send({ error: 'Capture storage capacity reached. Try again later.' });
                    case 'captured':
                        reply.header('X-Webhook-Request-Id', result.requestId);
                        if (request.method === 'HEAD') return reply.code(200).send();
                        return reply
                            .code(200)
                            .send({ received: true, requestId: result.requestId });
                }
            },
        });
    });

    app.get<InboxRoute>('/api/inboxes/:id/requests', async (request, reply) => {
        const token = resourceToken(request);
        const inbox = await inboxStore.info(
            request.params.id,
            token,
            (await access.actor(request)).identity?.account.id,
        );
        if (!inbox) return reply.code(404).send(NOT_FOUND);
        const etag = `"${inbox.id}:${inbox.requestCount}:${inbox.accessVersion}"`;
        reply
            .header('X-Resource-Visibility', inbox.visibility)
            .header('X-Access-Version', inbox.accessVersion)
            .header('X-Resource-Expires-At', inbox.expiresAt);
        reply.header('ETag', etag);
        if (request.headers['if-none-match'] === etag) return reply.code(304).send();
        const requests = await inboxStore.listRequests(
            request.params.id,
            token,
            (await access.actor(request)).identity?.account.id,
        );
        if (!requests) return reply.code(404).send(NOT_FOUND);
        return { requests };
    });

    app.get<InboxRoute>('/api/inboxes/:id', async (request, reply) => {
        const inbox = await inboxStore.info(
            request.params.id,
            resourceToken(request),
            (await access.actor(request)).identity?.account.id,
        );
        if (!inbox) return reply.code(404).send(NOT_FOUND);
        return inbox;
    });

    app.delete<InboxRoute>('/api/inboxes/:id', async (request, reply) => {
        if (
            !(await inboxStore.delete(
                request.params.id,
                resourceToken(request),
                (await access.actor(request)).identity?.account.id,
            ))
        ) {
            return reply.code(404).send(NOT_FOUND);
        }
        return reply.code(204).send();
    });

    if (!recoveryStore && !(identityStore instanceof MemoryIdentityRepository))
        throw new Error('Persistent identities require a recovery repository.');
    const recovery = new RecoveryService(
        recoveryStore ?? new MemoryRecoveryRepository(identityStore as MemoryIdentityRepository),
        mailSender,
        authSecret ?? randomUUID(),
        publicBaseUrl,
        rateLimiter,
        () => app.log.error('Recovery email delivery failed; pending mail will retry.'),
    );
    recovery.register(app, access);
    recovery.start();
    app.addHook('preClose', () => recovery.close());
    registerAccounts(app, access, rateLimiter, recovery);
    registerBilling(app, access, billingRepository, billingConfig, dodoClient, recovery.store);
    registerTools(app, access, tools);
    registerMusic(app, frontendDir);
    registerLifecycle(app, access, inboxStore, resourceStore);
    registerResources(app, resourceStore, rateLimiter, baseUrl.origin, access);
    registerMcp({
        app,
        inboxes: inboxStore,
        resources: resourceStore,
        limits: rateLimiter,
        origin: baseUrl.origin,
        access,
        tools,
    });

    if (frontendDir) {
        app.register(fastifyStatic, {
            root: frontendDir,
            index: 'index.html',
            redirect: true,
            dotfiles: 'ignore',
            cacheControl: false,
            setHeaders(response, path) {
                // Next exports the generated share image without a file extension.
                if (path.endsWith('/opengraph-image')) response.header('Content-Type', 'image/png');
                response.header(
                    'Cache-Control',
                    path.includes('/_next/static/')
                        ? 'public, max-age=31536000, immutable'
                        : 'no-cache',
                );
            },
        });
        app.setNotFoundHandler(async (request, reply) => {
            if (
                (request.method === 'GET' || request.method === 'HEAD') &&
                !/^\/(api|hooks|mock|files|mcp)(\/|$)/.test(request.url) &&
                request.headers.accept?.includes('text/html')
            ) {
                return reply
                    .code(404)
                    .header('Content-Security-Policy', pagePolicies.get('/404.html') ?? policy())
                    .type('text/html')
                    .sendFile('404.html');
            }
            return reply.code(404).send({ error: 'Route not found.' });
        });
    } else {
        app.setNotFoundHandler(async (_request, reply) =>
            reply.code(404).send({ error: 'Route not found.' }),
        );
    }

    return app;
}
