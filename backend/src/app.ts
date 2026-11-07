import { MemoryCredentials, registerCredentials } from './credentials.js';
import type { CredentialRepository } from './credentials.js';
import { registerEmailDrafts } from './email-drafts.js';
import { registerEmailAttachments } from './email-attachments.js';
import { MemoryAuthenticators, registerAuthenticators } from './authenticators.js';
import type { AuthenticatorRepository } from './authenticators.js';
import websocket from '@fastify/websocket';
import { registerWebSocketMocks, webSocketMessageBytes } from './websocket-mock.js';
import { registerOAuth } from './oauth.js';
import { registerPhones } from './phone/routes.js';
import type { PhoneEntitlements } from './phone/routes.js';
import { MemoryPhones } from './phone/store.js';
import type { PhoneStore } from './phone/store.js';
import type { PhoneProvider } from './phone/provider.js';
import { registerSmtpCapture } from './smtp-capture.js';
import type { SmtpCaptureConfig } from './smtp-capture.js';
import { MemoryJobs, registerScheduledJobs } from './scheduled-jobs.js';
import type { JobStore, JobSend } from './scheduled-jobs.js';
import { registerMusic } from './music-routes.js';
import { RecoveryService } from './recovery.js';
import { MemoryRecoveryRepository } from './recovery-store.js';
import type { RecoveryRepository } from './recovery-store.js';
import type { MailSender } from './mail.js';
import type DodoPayments from 'dodopayments';
import { isUtf8 } from 'node:buffer';
import { METHODS } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import fastify, { LogController } from 'fastify';
import type { FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { InboxStore, validateInboxResponse } from './inboxes.js';
import type { InboxRepository } from './inboxes.js';
import { CREATIONS_PER_MINUTE, RateLimiter, REQUESTS_PER_MINUTE } from './rate-limit.js';
import type { RateLimitRepository } from './rate-limit.js';
import { clientKey, documentPolicies, policy } from './security.js';
import { openApi } from './openapi.js';
import { ResourceStore } from './resources.js';
import type { ResourceRepository } from './resources.js';
import { registerResources } from './resource-routes.js';
import { registerMcp } from './mcp.js';
import { Waiters, waitForRequests, waitSeconds } from './waiting.js';
import { MemoryMockCalls } from './mock-calls.js';
import { MemoryActivity } from './activity.js';
import { MemoryKv, registerKv } from './kv.js';
import { MemoryAgents, registerAgents, setAgentPepper } from './agents.js';
import { MemoryApprovals, registerApprovals } from './approvals.js';
import type { ApprovalRepository } from './approvals.js';
import type { AgentRepository } from './agents.js';
import { MemoryMonitors, registerMonitors } from './monitors.js';
import type { MonitorChecks, MonitorRepository } from './monitors.js';
import type { MemoryRepository } from './kv.js';
import type { ActivityRepository } from './activity.js';
import { MemoryEmailMessages, registerEmail } from './email.js';
import type { EmailMessageRepository } from './email.js';
import { MemoryEmailAddresses } from './email-addresses.js';
import type { EmailAddressRepository } from './email-addresses.js';
import { MemoryEmailSending } from './email-sending-store.js';
import type { EmailSendingRepository } from './email-sending-store.js';
import { receiveEmailFeedback, registerEmailSending } from './email-sending.js';
import type { AgentEmailConfig, AgentEmailSend } from './email-sending.js';
import { Forwarder } from './forwarding.js';
import type { ForwardSend } from './forwarding.js';
import { publicRequest, publicUrl } from './public-network.js';
import type { MockCallRepository } from './mock-calls.js';
import { MemoryAllocations, QuotaError } from './allocations.js';
import { Access, HttpError, resourceToken } from './access.js';
import { registerStatusPages } from './status-pages.js';
import { registerEvents } from './events.js';
import { PlanError, entitlement } from './entitlements.js';
import { effectivePlan, MemoryIdentityRepository } from './identity.js';
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
    authenticatorStore?: AuthenticatorRepository;
    credentialStore?: CredentialRepository;
    billingRepository?: BillingRepository;
    billingConfig?: BillingConfig;
    dodoClient?: DodoPayments;
    recoveryStore?: RecoveryRepository;
    mailSender?: MailSender;
    mockCalls?: MockCallRepository;
    forwardSend?: ForwardSend;
    forwardDelays?: number[];
    mockProxySend?: typeof publicRequest;
    webhookEventSend?: typeof publicRequest;
    emailMessages?: EmailMessageRepository;
    emailAddresses?: EmailAddressRepository;
    emailSending?: EmailSendingRepository;
    smtpCaptureConfig?: SmtpCaptureConfig;
    agentEmailConfig?: AgentEmailConfig;
    agentEmailSend?: AgentEmailSend;
    mailDomain?: string;
    emailIngestSecret?: string;
    activity?: ActivityRepository;
    memory?: MemoryRepository;
    monitorStore?: MonitorRepository;
    jobStore?: JobStore;
    phoneStore?: PhoneStore;
    phoneProvider?: PhoneProvider;
    phoneEnabled?: boolean;
    phoneEntitlements?: PhoneEntitlements;
    jobSend?: JobSend;
    monitorChecks?: MonitorChecks;
    agentStore?: AgentRepository;
    approvalStore?: ApprovalRepository;
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
    authenticatorStore = new MemoryAuthenticators(),
    credentialStore = new MemoryCredentials(),
    billingRepository,
    billingConfig,
    dodoClient,
    recoveryStore,
    mailSender,
    mockCalls = new MemoryMockCalls(),
    forwardSend,
    forwardDelays,
    mockProxySend,
    webhookEventSend,
    emailMessages = new MemoryEmailMessages(),
    emailAddresses = new MemoryEmailAddresses(),
    emailSending = new MemoryEmailSending(),
    agentEmailConfig,
    smtpCaptureConfig,
    agentEmailSend,
    mailDomain,
    emailIngestSecret,
    activity = new MemoryActivity(),
    memory = new MemoryKv(),
    monitorStore = new MemoryMonitors(),
    jobStore = new MemoryJobs(),
    phoneStore = new MemoryPhones(),
    phoneProvider,
    phoneEnabled = Boolean(phoneProvider),
    phoneEntitlements = billingRepository
        ? (owner) => billingRepository.phoneAllowance(owner)
        : async () => ({ count: 0, validUntil: null }),
    jobSend,
    monitorChecks,
    agentStore = new MemoryAgents(),
    approvalStore = new MemoryApprovals(),
}: AppOptions = {}) {
    const ledger = new MemoryAllocations();
    const inboxStore = providedInboxes ?? new InboxStore({ quotaLedger: ledger });
    const resourceStore =
        providedResources ?? new ResourceStore(Date.now, undefined, undefined, ledger);
    if (emailMessages instanceof MemoryEmailMessages && resourceStore instanceof ResourceStore)
        emailMessages.setBudget(
            (id, bytes) => resourceStore.adjustEmailBytes(id, bytes),
            (id) => resourceStore.emailExists(id),
        );
    const access = new Access(identityStore, rateLimiter, publicBaseUrl, authSecret);
    const waiters = new Waiters();
    // Paid features are re-checked on use, so they stop as soon as the owner's plan lapses.
    const ownerIsPaid = async (ownerId?: string) => {
        if (!ownerId) return false;
        const account = await identityStore.account(ownerId);
        const plan = account ? effectivePlan(account) : 'free';
        return plan === 'pro' || plan === 'team';
    };
    const forwarder = new Forwarder(inboxStore, forwardSend, forwardDelays);
    const tools = new ToolService(access, frontendDir, webhookEventSend);
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
    app.register(websocket, {
        options: {
            maxPayload: webSocketMessageBytes,
            maxBufferedChunks: 128,
            maxFragments: 128,
            perMessageDeflate: false,
        },
    });
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
            memory.deleteExpired(),
            agentStore.deleteExpired(),
            approvalStore.pruneDraftEdits(resourceStore),
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
            return reply.code(expected.statusCode).send({
                error: expected.message,
                requestId: request.id,
                ...(expected instanceof PlanError
                    ? { requiredPlan: expected.requiredPlan, upgradeUrl: expected.upgradeUrl }
                    : {}),
            });
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

    // Every JSON error Kivel sends carries the request ID, so a failure can be traced.
    // Mock endpoints are skipped: their responses are configured by the user and sent as written.
    app.addHook('onSend', async (request, reply, payload) => {
        if (
            reply.statusCode < 400 ||
            typeof payload !== 'string' ||
            !payload.startsWith('{"error":') ||
            /^\/(mock|oauth)\//.test(request.url)
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
            /^\/(api|hooks|mock|oauth|ws|mcp|files|billing)(\/|$)/.test(
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
        if (
            ['GET', 'HEAD'].includes(request.method) &&
            /^\/api\/(tools(?:\/[^/?]+)?|capabilities|openapi\.json)(?:\?|$)/.test(request.url)
        ) {
            const retry = await rateLimiter.consume(`catalog:${clientKey(request.ip)}`, 600);
            if (retry)
                return reply
                    .header('Retry-After', retry)
                    .code(429)
                    .send({ error: 'Catalog request rate limit exceeded.' });
            return;
        }
        if (request.url.startsWith('/api/') || request.url.split('?')[0] === '/mcp') {
            await access.rate(request);
            if (
                /^\/api\/(inboxes|mocks|files|mcp-servers|email-inboxes|memory|monitors|status-pages|scheduled-jobs|smtp-inboxes|phone-numbers)(\/|\?|$)/.test(
                    request.url,
                )
            )
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

    const capabilities = {
        emailReceiving: Boolean(mailDomain && emailIngestSecret),
        emailSending: Boolean(agentEmailConfig?.enabled),
        smtpCapture: Boolean(smtpCaptureConfig),
        authenticators: Boolean(authSecret),
        vault: Boolean(authSecret),
        oauthProviders: Boolean(authSecret),
        phones: Boolean(phoneProvider && phoneEnabled),
        phoneAddonSales: Boolean(billingConfig?.phoneAddonEnabled),
    };
    app.get('/api/capabilities', async () => capabilities);
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
            const input = request.query as Record<string, unknown>;
            const inbox = await inboxStore.create(
                await access.allocation(request, { visibility: 'public', ...input }),
            );
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

        const methods = METHODS.filter((method) => method !== 'CONNECT');
        for (const method of methods)
            if (!hooks.supportedMethods.includes(method))
                hooks.addHttpMethod(method, { hasBody: true });
        for (const url of ['/hooks/:id', '/hooks/:id/*'])
            hooks.route<InboxRoute>({
                method: methods,
                url,
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
                            rawQuery: request.url.includes('?')
                                ? request.url.slice(request.url.indexOf('?') + 1)
                                : '',
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
                            return reply.code(503).send({
                                error: 'Capture storage capacity reached. Try again later.',
                            });
                        case 'captured':
                            reply.header('X-Webhook-Request-Id', result.requestId);
                            if (result.forwardUrl && (await ownerIsPaid(result.ownerId)))
                                forwarder
                                    .deliver(request.params.id, result.forwardUrl, {
                                        id: result.requestId,
                                        method: request.method,
                                        query: request.url.split('?')[1] ?? '',
                                        headers: request.headers,
                                        body,
                                        utf8: encoding === 'utf8',
                                    })
                                    .catch((error) =>
                                        request.log.warn(
                                            { err: error },
                                            'Webhook forwarding failed.',
                                        ),
                                    );
                            if (result.response) {
                                const custom = result.response;
                                if (custom.delayMs)
                                    await new Promise((resolve) =>
                                        setTimeout(resolve, custom.delayMs),
                                    );
                                reply.code(custom.status).headers(custom.headers);
                                if (request.method === 'HEAD') return reply.send();
                                return reply
                                    .header('Content-Type', `${custom.contentType}; charset=utf-8`)
                                    .send(custom.body);
                            }
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

    // What the inbox answers senders with. Inspection credentials only; never the sender token.
    app.put<InboxRoute>('/api/inboxes/:id/response', async (request, reply) => {
        let response;
        try {
            response = validateInboxResponse(request.body);
        } catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
        const saved = await inboxStore.setResponse(
            request.params.id,
            resourceToken(request),
            response,
            (await access.actor(request)).identity?.account.id,
        );
        return saved ? { response } : reply.code(404).send(NOT_FOUND);
    });
    app.delete<InboxRoute>('/api/inboxes/:id/response', async (request, reply) => {
        const saved = await inboxStore.setResponse(
            request.params.id,
            resourceToken(request),
            null,
            (await access.actor(request)).identity?.account.id,
        );
        return saved ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
    });

    // Paid plans can relay every captured request to their own public endpoint.
    app.put<InboxRoute>('/api/inboxes/:id/forward', async (request, reply) => {
        const actor = await access.actor(request);
        entitlement(actor.identity, 'webhookForwarding', baseUrl.origin);
        const input = request.body as { url?: unknown } | undefined;
        let target: URL;
        try {
            if (typeof input?.url !== 'string' || input.url.length > 2048) throw new Error();
            target = publicUrl(input.url);
        } catch {
            return reply.code(400).send({
                error: 'Use a public http(s) URL on port 80, 443, 8080 or 8443, up to 2,048 characters.',
            });
        }
        // Forwarding back to Kivel could make inboxes relay to each other forever.
        if (target.hostname === baseUrl.hostname)
            return reply.code(400).send({ error: 'Forward to your own endpoint, not Kivel.' });
        const info = await inboxStore.info(
            request.params.id,
            resourceToken(request),
            actor.identity?.account.id,
        );
        if (!info) return reply.code(404).send(NOT_FOUND);
        if (info.ownerId !== actor.identity?.account.id)
            return reply
                .code(403)
                .send({ error: 'Forwarding needs an inbox created in your workspace.' });
        const saved = await inboxStore.setForward(
            request.params.id,
            resourceToken(request),
            target.href,
            actor.identity?.account.id,
        );
        return saved ? { forwardUrl: target.href } : reply.code(404).send(NOT_FOUND);
    });
    app.delete<InboxRoute>('/api/inboxes/:id/forward', async (request, reply) => {
        const saved = await inboxStore.setForward(
            request.params.id,
            resourceToken(request),
            null,
            (await access.actor(request)).identity?.account.id,
        );
        return saved ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
    });
    app.get<InboxRoute>('/api/inboxes/:id/deliveries', async (request, reply) => {
        const deliveries = await inboxStore.listDeliveries(
            request.params.id,
            resourceToken(request),
            (await access.actor(request)).identity?.account.id,
        );
        return deliveries ? { deliveries } : reply.code(404).send(NOT_FOUND);
    });

    // Long poll: answers as soon as the inbox has a request newer than `after`, so scripts and
    // agents can block on a webhook instead of polling.
    app.get<InboxRoute & { Querystring: { after?: string; timeoutSeconds?: string } }>(
        '/api/inboxes/:id/wait',
        async (request, reply) => {
            const token = resourceToken(request);
            const actor = await access.actor(request);
            const timeout = waitSeconds(request.query.timeoutSeconds);
            const abort = new AbortController();
            request.raw.once('close', () => abort.abort());
            const outcome = await waiters.run(actor.quotaKey, () =>
                waitForRequests(
                    inboxStore,
                    {
                        id: request.params.id,
                        token,
                        ...(actor.identity ? { ownerId: actor.identity.account.id } : {}),
                        ...(request.query.after ? { after: request.query.after } : {}),
                    },
                    timeout * 1000,
                    abort.signal,
                ),
            );
            if (outcome.status === 'gone') return reply.code(404).send(NOT_FOUND);
            return outcome.status === 'ready'
                ? { timedOut: false, requests: outcome.requests }
                : { timedOut: true, requests: [] };
        },
    );

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
    registerMonitors({
        app,
        access,
        monitors: monitorStore,
        identities: identityStore,
        recovery: recovery.store,
        ...(mailSender ? { mail: mailSender } : {}),
        limits: rateLimiter,
        origin: baseUrl.origin,
        ...(monitorChecks ? { checks: monitorChecks } : {}),
    });
    registerBilling(app, access, billingRepository, billingConfig, dodoClient, recovery.store);
    registerAuthenticators(
        app,
        access,
        authenticatorStore,
        rateLimiter,
        activity,
        authSecret,
        agentStore,
    );
    registerTools(app, access, tools, capabilities);
    registerMusic(app, frontendDir);
    if (authSecret) setAgentPepper(authSecret);
    registerAgents({
        app,
        access,
        identities: identityStore,
        agents: agentStore,
        origin: baseUrl.origin,
        limits: rateLimiter,
        ...(mailSender ? { mail: mailSender } : {}),
    });
    const review = registerApprovals({
        app,
        access,
        approvals: approvalStore,
        agents: agentStore,
        identities: identityStore,
        recovery: recovery.store,
        waiters,
        origin: baseUrl.origin,
        ...(mailSender ? { mail: mailSender } : {}),
    });
    registerKv(app, access, memory);
    const email = registerEmail({
        app,
        access,
        resources: resourceStore,
        messages: emailMessages,
        addresses: emailAddresses,
        sendingEnabled: agentEmailConfig?.enabled ?? false,
        feedback: (input) =>
            receiveEmailFeedback(
                emailSending,
                authSecret ?? 'local-development-email-secret',
                input,
            ),
        ...(forwardSend ? { forwardSend } : {}),
        waiters,
        ...(mailDomain ? { mailDomain } : {}),
        ...(emailIngestSecret ? { ingestSecret: emailIngestSecret } : {}),
    });
    registerEmailAttachments(
        app,
        access,
        resourceStore,
        emailMessages,
        authSecret ?? randomBytes(32).toString('hex'),
        (owner) => email.lifecycle.reconcile(owner),
    );
    registerSmtpCapture(app, access, resourceStore, emailMessages, rateLimiter, smtpCaptureConfig);
    registerCredentials(
        app,
        access,
        credentialStore,
        authenticatorStore,
        email,
        approvalStore,
        review,
        activity,
        rateLimiter,
        authSecret,
    );
    const deliverEmail = registerEmailSending({
        app,
        access,
        messages: emailMessages,
        owned: email.owned,
        recovery: recovery.store,
        store: emailSending,
        limits: rateLimiter,
        secret: authSecret ?? 'local-development-email-secret',
        ...(agentEmailConfig ? { config: agentEmailConfig } : {}),
        ...(agentEmailSend ? { send: agentEmailSend } : {}),
    });
    registerLifecycle(app, access, inboxStore, resourceStore, email.lifecycle);
    registerStatusPages(app, access, resourceStore, monitorStore);
    const phones = registerPhones(
        app,
        access,
        phoneStore,
        waiters,
        phoneEntitlements,
        phoneProvider,
        phoneEnabled,
    );
    app.decorate('runPhoneLifecycle', phones.tick);
    const sendDraft = registerEmailDrafts(
        app,
        access,
        resourceStore,
        jobStore,
        email,
        deliverEmail,
        approvalStore,
        review,
    );
    const scheduler = registerScheduledJobs(
        app,
        access,
        resourceStore,
        jobStore,
        jobSend,
        sendDraft,
    );
    app.decorate('runScheduledJobs', scheduler.tick);
    registerEvents({
        app,
        access,
        inboxes: inboxStore,
        emails: emailMessages,
        email,
        approvals: approvalStore,
        jobs: scheduler,
        phones,
        waiters,
    });
    app.register(async (sockets) => {
        registerWebSocketMocks(sockets, resourceStore, access, rateLimiter, mockCalls);
    });
    registerOAuth(app, access, resourceStore, rateLimiter, mockCalls, baseUrl.origin, authSecret);
    registerResources(
        app,
        resourceStore,
        rateLimiter,
        baseUrl.origin,
        access,
        mockCalls,
        mockProxySend,
        ownerIsPaid,
    );
    registerMcp({
        capabilities,
        app,
        inboxes: inboxStore,
        resources: resourceStore,
        limits: rateLimiter,
        origin: baseUrl.origin,
        access,
        tools,
        waiters,
        mockCalls,
        activity,
    });
    app.get('/api/account/activity', async (request) => {
        const identity = await access.require(request, 'account:read');
        return { activity: await activity.list(identity.account.id) };
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
