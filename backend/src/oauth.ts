import {
    createHash,
    createHmac,
    generateKeyPair,
    randomBytes,
    randomUUID,
    sign,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { oauthSchema, validateOAuth } from '@kivel.io/tools/oauth';
import type { OAuthConfig, OAuthUser } from '@kivel.io/tools/oauth';
import { Access, HttpError, resourceToken } from './access.js';
import type { ResourceRepository } from './resources.js';
import type { RateLimitRepository } from './rate-limit.js';
import type { MockCallRepository } from './mock-calls.js';
import { mockCall } from './mock-calls.js';
import { secretVault } from './secret-vault.js';

interface Grant {
    hash: string;
    type: 'code' | 'access' | 'refresh' | 'used_refresh';
    expires: number;
    sub: string;
    scope: string;
    nonce?: string;
    redirect?: string;
    challenge?: string;
    family: string;
    publicClient?: boolean;
}
interface State {
    clientId: string;
    secretHash: string;
    formSecret: string;
    encryptedPrivateKey: string;
    keyExpiresAt?: number;
    lastRotationAt?: number;
    previousKeys?: { jwk: Record<string, unknown>; expires: number }[];
    jwk: Record<string, unknown>;
    grants: Grant[];
}
const random = () => randomBytes(32).toString('base64url');
const hash = (v: string) => createHash('sha256').update(v).digest('base64url');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const escape = (v: string) =>
    v.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
export function publicMockPayload(payload: Record<string, unknown>) {
    const { oauthState: _, ...visible } = payload;
    return visible;
}
async function keys() {
    const pair = await promisify(generateKeyPair)('rsa', { modulusLength: 2048 });
    return {
        privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        jwk: {
            ...pair.publicKey.export({ format: 'jwk' }),
            kid: randomUUID(),
            alg: 'RS256',
            use: 'sig',
        },
    };
}
function jwt(state: State, claims: Record<string, unknown>, privateKey: string) {
    state.keyExpiresAt = Math.max(state.keyExpiresAt ?? 0, Number(claims.exp) * 1000);
    const data = [{ alg: 'RS256', typ: 'JWT', kid: state.jwk.kid }, claims]
        .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
        .join('.');
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}
function parameters(value: unknown) {
    const entries =
        value instanceof URLSearchParams
            ? [...value]
            : Object.entries((value ?? {}) as Record<string, unknown>);
    const result: Record<string, string> = {};
    for (const [key, v] of entries) {
        if (key in result || typeof v !== 'string' || v.length > 8192)
            throw new HttpError(400, 'Parameters must occur once and contain text.');
        result[key] = v;
    }
    return result;
}
const fail = (reply: FastifyReply, error: string, description: string, status = 400) =>
    reply.code(status).send({ error, error_description: description });
const userClaims = (config: OAuthConfig, user: OAuthUser, scope: string) => ({
    ...(scope.split(' ').includes('email') ? { email_verified: true } : {}),
    ...config.claims,
    ...user.claims,
    sub: user.sub,
    ...(scope.split(' ').includes('email') ? { email: user.email } : {}),
    ...(scope.split(' ').includes('profile') ? { name: user.name } : {}),
});
function parseConfig(value: unknown) {
    try {
        return validateOAuth(value);
    } catch (e) {
        throw new HttpError(400, (e as Error).message);
    }
}
export { oauthSchema };
export function registerOAuth(
    app: FastifyInstance,
    access: Access,
    store: ResourceRepository,
    limits: RateLimitRepository,
    calls: MockCallRepository,
    origin: string,
    serverSecret?: string,
) {
    const vault = serverSecret ? secretVault(serverSecret, 'oauth-rsa-v1') : undefined;
    const configured = () => {
        if (!vault)
            throw new HttpError(503, 'OAuth signing keys require AUTH_SECRET on this server.');
        return vault;
    };
    const signingKey = (state: State, id: string) => {
        try {
            return configured().decrypt(state.encryptedPrivateKey, id);
        } catch {
            throw new HttpError(
                503,
                'Signing key unavailable. Restore AUTH_SECRET or recreate this test provider.',
            );
        }
    };
    const issuer = (id: string) => `${origin}/oauth/${id}`;
    const info = (id: string, payload: Record<string, unknown>) => ({
        ...publicMockPayload(payload),
        client_id: (payload.oauthState as State).clientId,
        issuer: issuer(id),
        endpointUrl: issuer(id),
        discoveryUrl: `${issuer(id)}/.well-known/openid-configuration`,
    });
    app.get('/api/oauth-providers', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        return {
            providers: (await store.listOwned(actor.identity.account.id))
                .filter((r) => r.payload.oauth)
                .map((r) => ({ id: r.id, expiresAt: r.expiresAt, ...info(r.id, r.payload) })),
        };
    });
    app.post('/api/oauth-providers', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        const config = parseConfig(request.body);
        await access.rate(request, true);
        const clientSecret = random();
        const encryption = configured(),
            pair = await keys();
        const allocation = await access.allocation(request);
        let payload: Record<string, unknown> = {};
        const resource = await store.create(
            'mock',
            (id) => {
                const state: State = {
                    clientId: `mock_${randomUUID()}`,
                    secretHash: hash(clientSecret),
                    formSecret: random(),
                    encryptedPrivateKey: encryption.encrypt(pair.privateKey, id),
                    jwk: pair.jwk,
                    grants: [],
                };
                payload = { name: config.name, routes: [], oauth: config, oauthState: state };
                return payload;
            },
            undefined,
            { ...allocation, ownerId: actor.identity.account.id, visibility: 'public' },
        );
        if (!resource) throw new HttpError(503, 'Temporary resource capacity reached.');
        return reply
            .code(201)
            .send({ ...resource, ...info(resource.id, payload), client_secret: clientSecret });
    });
    app.put<{ Params: { id: string } }>('/api/oauth-providers/:id', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        const config = parseConfig(request.body);
        const existing = await store.read(request.params.id, 'mock', '', actor.identity.account.id);
        if (!existing?.payload.oauth) throw new HttpError(404, 'Provider unavailable or expired.');
        let rotated: Awaited<ReturnType<typeof keys>> | undefined;
        if (config.scenario === 'rotated_signing_key') {
            configured();
            const reserved = await store.mutateMock(
                request.params.id,
                { ownerId: actor.identity.account.id, managementToken: '' },
                (payload) => {
                    const state = payload.oauthState as State,
                        now = Date.now();
                    const retry =
                        state.lastRotationAt === undefined
                            ? 0
                            : Math.max(0, Math.ceil((state.lastRotationAt + 60000 - now) / 1000));
                    if (!retry) state.lastRotationAt = now;
                    return { payload, result: { retry } };
                },
            );
            if (!reserved) throw new HttpError(404, 'Provider unavailable or expired.');
            if (reserved === 'full')
                throw new HttpError(503, 'Temporary resource capacity reached.');
            if (reserved.retry)
                throw new HttpError(
                    429,
                    'Signing keys can rotate only once per provider per minute.',
                    reserved.retry,
                );
            rotated = await keys();
        }
        const result = await store.mutateMock(
            request.params.id,
            { ownerId: actor.identity.account.id, managementToken: '' },
            (payload) => {
                const state = payload.oauthState as State;
                if (rotated) {
                    state.previousKeys = (state.previousKeys ?? []).filter(
                        (key) => key.expires > Date.now(),
                    );
                    if ((state.keyExpiresAt ?? 0) > Date.now())
                        state.previousKeys.push({ jwk: state.jwk, expires: state.keyExpiresAt! });
                    state.encryptedPrivateKey = configured().encrypt(
                        rotated.privateKey,
                        request.params.id,
                    );
                    state.jwk = rotated.jwk;
                    state.keyExpiresAt = 0;
                }
                return {
                    payload: {
                        ...payload,
                        name: config.name,
                        oauth: config,
                        oauthState: state,
                    },
                    result: true,
                };
            },
        );
        if (result === 'full') throw new HttpError(503, 'Temporary resource capacity reached.');
        if (!result) throw new HttpError(404, 'Provider unavailable or expired.');
        return reply.code(204).send();
    });
    app.get<{ Params: { id: string } }>('/api/oauth-providers/:id', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        const resource = await store.read(
            request.params.id,
            'mock',
            resourceToken(request),
            actor.identity.account.id,
        );
        if (!resource?.payload.oauth) throw new HttpError(404, 'Provider unavailable or expired.');
        return {
            id: resource.id,
            expiresAt: resource.expiresAt,
            ...info(resource.id, resource.payload),
        };
    });
    app.delete<{ Params: { id: string } }>('/api/oauth-providers/:id', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        const resource = await store.read(request.params.id, 'mock', '', actor.identity.account.id);
        if (
            !resource?.payload.oauth ||
            !(await store.delete(resource.id, 'mock', '', actor.identity.account.id))
        )
            throw new HttpError(404, 'Provider unavailable or expired.');
        return reply.code(204).send();
    });
    app.register(async (provider) => {
        provider.setErrorHandler((error, request, reply) => {
            const code =
                error && typeof error === 'object' && 'statusCode' in error
                    ? Number(error.statusCode)
                    : 500;
            const status = Number.isInteger(code) && code >= 400 && code <= 599 ? code : 500;
            if (status >= 500) request.log.error({ err: error }, 'OAuth provider request failed');
            if (error instanceof HttpError && error.retryAfter)
                reply.header('Retry-After', error.retryAfter);
            return fail(
                reply,
                status === 429
                    ? 'temporarily_unavailable'
                    : status >= 500
                      ? 'server_error'
                      : 'invalid_request',
                error instanceof HttpError
                    ? error.message
                    : status >= 500
                      ? 'The test provider could not complete this request.'
                      : 'Invalid request body or parameters.',
                status,
            );
        });
        provider.addContentTypeParser(
            'application/x-www-form-urlencoded',
            { parseAs: 'string' },
            (_req, body, done) => {
                try {
                    done(null, parameters(new URLSearchParams(body as string)));
                } catch (e) {
                    done(e as Error);
                }
            },
        );
        provider.addHook('onRequest', async (req, reply) => {
            reply
                .header('Cache-Control', 'no-store')
                .header('Pragma', 'no-cache')
                .header('X-Robots-Tag', 'noindex, nofollow')
                .header('Referrer-Policy', 'no-referrer')
                .header('X-Content-Type-Options', 'nosniff');
            const retry = await limits.consume(`oauth:${(req.params as { id: string }).id}`, 120);
            if (retry)
                return fail(
                    reply.header('Retry-After', retry),
                    'temporarily_unavailable',
                    'Provider request limit reached.',
                    429,
                );
        });
        const logging = new WeakSet<FastifyRequest>();
        provider.addHook('onSend', async (request, reply, response) => {
            if (reply.statusCode >= 400) {
                let body: Record<string, unknown> = {};
                try {
                    body = JSON.parse(String(response));
                } catch {}
                const known = [
                    'invalid_request',
                    'invalid_client',
                    'invalid_grant',
                    'invalid_scope',
                    'invalid_token',
                    'unsupported_grant_type',
                    'unsupported_response_type',
                    'access_denied',
                    'login_required',
                    'temporarily_unavailable',
                    'server_error',
                ];
                const error =
                    typeof body.error === 'string' && known.includes(body.error)
                        ? body.error
                        : reply.statusCode === 429
                          ? 'temporarily_unavailable'
                          : reply.statusCode >= 500
                            ? 'server_error'
                            : 'invalid_request';
                const description =
                    typeof body.error_description === 'string'
                        ? body.error_description
                        : typeof body.error === 'string' && !known.includes(body.error)
                          ? body.error
                          : 'The test provider could not complete this request.';
                reply.type('application/json');
                response = JSON.stringify({ error, error_description: description });
            }
            if (logging.has(request)) return response;
            logging.add(request);
            const id = (request.params as { id: string }).id;
            const resource = await store.peek(id, 'mock');
            if (!resource?.payload.oauth) return response;
            const safe = (value: unknown) =>
                Object.fromEntries(
                    Object.entries((value ?? {}) as Record<string, unknown>).map(([key, v]) => [
                        key,
                        [
                            'grant_type',
                            'response_type',
                            'scope',
                            'code_challenge_method',
                            'error',
                            'decision',
                        ].includes(key)
                            ? v
                            : '[redacted]',
                    ]),
                );
            await calls.record(
                id,
                mockCall({
                    method: request.method,
                    path: request.url.split('?')[0]!,
                    query: safe(request.query),
                    status: reply.statusCode,
                    durationMs: reply.elapsedTime,
                    headers: request.headers,
                    body: Buffer.from(JSON.stringify(safe(request.body))),
                }),
            );
            return response;
        });
        provider.route({
            method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            url: '/oauth/*',
            handler: (_request, reply) =>
                fail(reply, 'invalid_request', 'Provider endpoint unavailable.', 404),
        });
        provider.route<{ Params: { id: string; '*': string } }>({
            method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            url: '/oauth/:id/*',
            bodyLimit: 32768,
            handler: async (request, reply) => {
                const { id } = request.params,
                    path = request.params['*'];
                const resource = await store.peek(id, 'mock');
                if (!resource?.payload.oauth)
                    return fail(reply, 'invalid_request', 'Provider unavailable or expired.', 404);
                const config = resource.payload.oauth as OAuthConfig,
                    initial = resource.payload.oauthState as State,
                    base = issuer(id);
                if (path !== 'authorize')
                    reply
                        .header('Access-Control-Allow-Origin', '*')
                        .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
                        .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                if (request.method === 'OPTIONS') return reply.code(204).send();
                const allowed =
                    path === 'authorize' || path === 'userinfo'
                        ? ['GET', 'POST']
                        : ['token', 'revoke'].includes(path)
                          ? ['POST']
                          : ['GET'];
                if (!allowed.includes(request.method))
                    return reply
                        .header('Allow', [...allowed, 'OPTIONS'].join(', '))
                        .code(405)
                        .send({
                            error: 'invalid_request',
                            error_description: 'Method not allowed.',
                        });
                const p = parameters(request.method === 'GET' ? request.query : request.body);
                if (path === '.well-known/openid-configuration' && request.method === 'GET')
                    return {
                        issuer: base,
                        authorization_endpoint: `${base}/authorize`,
                        token_endpoint: `${base}/token`,
                        userinfo_endpoint: `${base}/userinfo`,
                        revocation_endpoint: `${base}/revoke`,
                        jwks_uri: `${base}/jwks`,
                        response_types_supported: ['code'],
                        grant_types_supported: [
                            'authorization_code',
                            'client_credentials',
                            'refresh_token',
                        ],
                        subject_types_supported: ['public'],
                        id_token_signing_alg_values_supported: ['RS256'],
                        token_endpoint_auth_methods_supported: [
                            'client_secret_basic',
                            'client_secret_post',
                            'none',
                        ],
                        code_challenge_methods_supported: ['S256'],
                        scopes_supported: ['openid', 'email', 'profile', 'offline_access'],
                        claims_supported: [
                            'sub',
                            'email',
                            'email_verified',
                            'name',
                            'iss',
                            'aud',
                            'iat',
                            'exp',
                            'nonce',
                        ],
                    };
                if (path === 'jwks' && request.method === 'GET')
                    return {
                        keys: [
                            initial.jwk,
                            ...(initial.previousKeys ?? [])
                                .filter((key) => key.expires > Date.now())
                                .map((key) => key.jwk),
                        ],
                    };
                if (path === 'authorize') {
                    let auth = p;
                    let pending: Record<string, string> | undefined;
                    if (request.method === 'POST') {
                        const [data, signature, extra] = (p.consent ?? '').split('.');
                        if (
                            !data ||
                            !signature ||
                            extra ||
                            !equal(
                                signature,
                                createHmac('sha256', initial.formSecret)
                                    .update(data)
                                    .digest('base64url'),
                            )
                        )
                            return fail(
                                reply,
                                'invalid_request',
                                'Consent form expired or invalid.',
                            );
                        let saved: {
                            parameters: Record<string, string>;
                            expires: number;
                            result?: Record<string, string>;
                        };
                        try {
                            saved = JSON.parse(Buffer.from(data, 'base64url').toString());
                        } catch {
                            return fail(reply, 'invalid_request', 'Invalid consent form.');
                        }
                        if (
                            !saved.parameters ||
                            !Number.isFinite(saved.expires) ||
                            saved.expires < Date.now()
                        )
                            return fail(reply, 'invalid_request', 'Consent form expired.');
                        auth = saved.parameters;
                        pending = saved.result;
                    }
                    if (
                        auth.client_id !== initial.clientId ||
                        !config.redirectUris.includes(auth.redirect_uri ?? '')
                    )
                        return fail(
                            reply,
                            'invalid_request',
                            'client_id or redirect_uri is not registered.',
                        );
                    const target = new URL(auth.redirect_uri!);
                    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
                    const confirmed = request.method === 'POST' && p.decision === 'continue';
                    if (
                        request.method === 'POST' &&
                        ((!local && request.headers.origin !== origin) ||
                            (request.headers.origin && request.headers.origin !== origin))
                    )
                        return fail(
                            reply,
                            'invalid_request',
                            'Submit the continue form from this test provider page.',
                            403,
                        );
                    const page = (result?: Record<string, string>) => {
                        // Keep form Origin intact without sending referrers to other origins.
                        reply.header('Referrer-Policy', 'same-origin');
                        const data = Buffer.from(
                            JSON.stringify({
                                parameters: auth,
                                expires: Date.now() + 300000,
                                ...(result ? { result } : {}),
                            }),
                        ).toString('base64url');
                        const consent = `${data}.${createHmac('sha256', initial.formSecret).update(data).digest('base64url')}`;
                        reply.header(
                            'Content-Security-Policy',
                            `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${target.origin}; frame-ancestors 'none'; base-uri 'none'`,
                        );
                        const notice = local
                            ? `<p>Return to <strong>${escape(auth.redirect_uri!)}</strong></p>`
                            : `<p class="leaving">You are leaving Kivel for <strong>${escape(target.origin)}</strong></p><p>Continue only if you recognize and trust this destination.</p>`;
                        const choices = result
                            ? `<p>The test provider will return <code>${escape(result.error ?? 'a result')}</code> to that destination.</p>`
                            : `<p>No real account or password is needed. Choose a synthetic user for ${escape(config.name)}.</p>${config.users.map((u, i) => `<label><input type="radio" name="user" value="${escape(u.sub)}" ${u.sub === auth.login_hint || u.email === auth.login_hint || (!auth.login_hint && i === 0) ? 'checked' : ''}> ${escape(u.name)}<small>${escape(u.email)}</small></label>`).join('')}`;
                        return reply
                            .type('text/html; charset=utf-8')
                            .send(
                                `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kivel test provider</title><style>body{font:16px/1.5 system-ui;color:#202720;background:#f4f4f1;margin:0;padding:24px}main{max-width:520px;margin:8vh auto;background:white;border:1px solid #e7e7e3;border-radius:16px;padding:32px}h1{font-size:30px;line-height:1.15}p{color:#5d615e;overflow-wrap:anywhere}.leaving{color:#202720}label{display:block;overflow-wrap:anywhere;padding:12px;border-bottom:1px solid #eee}button{font:inherit;padding:12px 22px;margin:24px 8px 0 0;border:1px solid #ccd4cc;border-radius:8px;background:white}button[value=approve],button[value=continue]{background:#111312;color:white}small{display:block;color:#5d615e}a{color:#111312;display:block;margin-top:24px}</style><main><h1>Kivel test provider</h1>${notice}<form method="post" action="${escape(base)}/authorize"><input type="hidden" name="consent" value="${escape(consent)}">${choices}<button name="decision" value="${!local || result ? 'continue' : 'approve'}">${!local || result ? 'Continue' : 'Approve test sign in'}</button>${result ? '' : '<button name="decision" value="deny">Deny</button>'}</form><a href="${escape(origin)}/">Stay on Kivel</a><p>Never enter real credentials on this page.</p></main></html>`,
                            );
                    };
                    const redirect = (values: Record<string, string>) => {
                        if (!local && !confirmed) return page(values);
                        for (const key of ['code', 'error', 'error_description', 'state'])
                            target.searchParams.delete(key);
                        for (const [key, value] of Object.entries({
                            ...values,
                            ...(auth.state === undefined ? {} : { state: auth.state }),
                        }))
                            target.searchParams.set(key, value);
                        return reply.redirect(target.href);
                    };
                    if (pending) {
                        if (!confirmed)
                            return fail(
                                reply,
                                'invalid_request',
                                'Choose Continue to leave this test provider.',
                            );
                        return redirect(pending);
                    }
                    if (auth.response_type !== 'code')
                        return redirect({
                            error: 'unsupported_response_type',
                            error_description: 'Only authorization code responses are supported.',
                        });
                    if (
                        auth.code_challenge_method !== 'S256' ||
                        !/^[A-Za-z0-9_-]{43}$/.test(auth.code_challenge ?? '')
                    )
                        return redirect({
                            error: 'invalid_request',
                            error_description: 'S256 PKCE is required.',
                        });
                    const scope = auth.scope ?? '';
                    if (
                        scope
                            .split(' ')
                            .some(
                                (s) =>
                                    s &&
                                    !['openid', 'email', 'profile', 'offline_access'].includes(s),
                            )
                    )
                        return redirect({
                            error: 'invalid_scope',
                            error_description: 'The requested scope is not supported.',
                        });
                    if (config.scenario === 'access_denied' || p.decision === 'deny')
                        return redirect({
                            error: 'access_denied',
                            error_description: 'The test authorization was denied.',
                        });
                    const headless =
                        request.method === 'GET' && config.headless && auth.prompt === 'none';
                    const user = config.users.find((u) =>
                        request.method === 'POST'
                            ? u.sub === p.user
                            : u.email === auth.login_hint || u.sub === auth.login_hint,
                    );
                    if (headless && !user)
                        return redirect({
                            error: 'login_required',
                            error_description: 'Provide a configured test user as login_hint.',
                        });
                    if (request.method === 'GET' && (!headless || !local)) {
                        if (!headless && auth.prompt === 'none')
                            return redirect({
                                error: 'login_required',
                                error_description: 'Headless approval is not enabled.',
                            });
                        return page();
                    }
                    if (!local && !confirmed) return page();
                    if (
                        !user ||
                        (request.method === 'POST' &&
                            !['approve', 'continue'].includes(p.decision ?? ''))
                    )
                        return redirect({
                            error: 'invalid_request',
                            error_description: 'Choose a configured test user.',
                        });
                    const code = random();
                    const result = await store.mutateMock(id, {}, (payload) => {
                        const state = payload.oauthState as State;
                        state.grants = state.grants.filter((g) => g.expires > Date.now());
                        if (state.grants.length >= 500) return { payload, result: false };
                        state.grants.push({
                            hash: hash(code),
                            type: 'code',
                            expires:
                                Date.now() + (config.scenario === 'expired_code' ? -1000 : 60000),
                            sub: user.sub,
                            scope,
                            ...(auth.nonce ? { nonce: auth.nonce } : {}),
                            redirect: auth.redirect_uri!,
                            challenge: auth.code_challenge!,
                            family: randomUUID(),
                        });
                        return { payload, result: true };
                    });
                    if (!result || result === 'full')
                        return redirect({
                            error: 'temporarily_unavailable',
                            error_description: 'Provider grant capacity reached.',
                        });
                    return redirect({ code });
                }
                if (path === 'userinfo' && ['GET', 'POST'].includes(request.method)) {
                    const token =
                        /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
                    const grant = initial.grants.find(
                        (g) =>
                            g.type === 'access' && g.hash === hash(token) && g.expires > Date.now(),
                    );
                    const user = grant && config.users.find((u) => u.sub === grant.sub);
                    if (!grant || !user || !grant.scope.split(' ').includes('openid'))
                        return reply
                            .header('WWW-Authenticate', 'Bearer error="invalid_token"')
                            .code(401)
                            .send({
                                error: 'invalid_token',
                                error_description: 'Access token is invalid, expired or revoked.',
                            });
                    return userClaims(config, user, grant.scope);
                }
                if (!['token', 'revoke'].includes(path) || request.method !== 'POST')
                    return fail(reply, 'invalid_request', 'Endpoint or method unavailable.', 404);
                let clientId = p.client_id ?? '',
                    secret = p.client_secret ?? '';
                if (request.headers.authorization) {
                    const basic = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(request.headers.authorization);
                    if (!basic || p.client_secret !== undefined)
                        return fail(
                            reply,
                            'invalid_client',
                            'Use one client authentication method.',
                            401,
                        );
                    const decoded = Buffer.from(basic[1]!, 'base64').toString(),
                        colon = decoded.indexOf(':');
                    try {
                        clientId = decodeURIComponent(decoded.slice(0, colon));
                        secret = decodeURIComponent(decoded.slice(colon + 1));
                    } catch {
                        return fail(reply, 'invalid_client', 'Invalid client credentials.', 401);
                    }
                }
                const publicClient = !secret && !request.headers.authorization;
                const publicRequest =
                    publicClient &&
                    (path === 'revoke' ||
                        ['authorization_code', 'refresh_token'].includes(p.grant_type ?? ''));
                if (
                    clientId !== initial.clientId ||
                    (!publicRequest && !equal(hash(secret), initial.secretHash))
                )
                    return fail(
                        reply.header('WWW-Authenticate', 'Basic realm="Kivel test provider"'),
                        'invalid_client',
                        'Client authentication failed.',
                        401,
                    );
                if (config.scenario === 'slow_token_endpoint' && path === 'token')
                    await delay(1500);
                const result = await store.mutateMock(id, {}, (payload) => {
                    const current = payload.oauth as OAuthConfig,
                        state = payload.oauthState as State;
                    const now = Date.now();
                    state.grants = state.grants.filter((g) => g.expires > now);
                    const error = (e: string) => ({
                        payload,
                        result: {
                            status: e === 'invalid_client' ? 401 : 400,
                            body: {
                                error: e,
                                error_description:
                                    (
                                        {
                                            invalid_grant:
                                                'The grant is invalid, expired, already used or revoked.',
                                            invalid_scope: 'The requested scope is not allowed.',
                                            invalid_client: 'Client authentication failed.',
                                            unsupported_grant_type:
                                                'This grant type is not supported.',
                                            temporarily_unavailable:
                                                'Provider grant capacity reached.',
                                        } as Record<string, string>
                                    )[e] ?? 'Invalid OAuth request.',
                            } as Record<string, unknown>,
                        },
                    });
                    if (path === 'revoke') {
                        const target = state.grants.find(
                            (g) => g.hash === hash(p.token ?? '') && g.type !== 'code',
                        );
                        if (target && publicClient && !target.publicClient)
                            return error('invalid_client');
                        if (target)
                            state.grants = state.grants.filter((g) => g.family !== target.family);
                        return {
                            payload,
                            result: { status: 200, body: {} as Record<string, unknown> },
                        };
                    }
                    if (current.scenario === 'invalid_grant') return error('invalid_grant');
                    let source: Grant;
                    if (p.grant_type === 'client_credentials')
                        source = {
                            hash: '',
                            type: 'access',
                            expires: now + 300000,
                            sub: state.clientId,
                            scope: p.scope ?? '',
                            family: randomUUID(),
                        };
                    else if (
                        p.grant_type === 'authorization_code' ||
                        p.grant_type === 'refresh_token'
                    ) {
                        const type = p.grant_type === 'authorization_code' ? 'code' : 'refresh';
                        const requestedHash = hash(
                            type === 'code' ? (p.code ?? '') : (p.refresh_token ?? ''),
                        );
                        const index = state.grants.findIndex(
                            (g) =>
                                g.hash === requestedHash &&
                                (g.type === type ||
                                    (type === 'refresh' && g.type === 'used_refresh')),
                        );
                        if (index < 0) return error('invalid_grant');
                        source = { ...state.grants[index]! };
                        if (type === 'refresh' && publicClient && !source.publicClient)
                            return error('invalid_client');
                        if (source.type === 'used_refresh') {
                            state.grants = state.grants.filter((g) => g.family !== source.family);
                            return error('invalid_grant');
                        }
                        if (type === 'code') {
                            state.grants.splice(index, 1);
                            if (
                                p.redirect_uri !== source.redirect ||
                                current.scenario === 'wrong_redirect_uri' ||
                                current.scenario === 'invalid_pkce_verifier' ||
                                !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier ?? '') ||
                                hash(p.code_verifier!) !== source.challenge
                            )
                                return error('invalid_grant');
                            source.publicClient = publicClient;
                        } else {
                            if (
                                p.scope &&
                                p.scope.split(' ').some((s) => !source.scope.split(' ').includes(s))
                            )
                                return error('invalid_scope');
                            if (p.scope) source.scope = p.scope;
                            state.grants[index] = {
                                ...source,
                                type: 'used_refresh',
                                expires: now + 3600000,
                            };
                            for (const grant of state.grants)
                                if (grant.family === source.family && grant.type === 'used_refresh')
                                    grant.expires = now + 3600000;
                        }
                    } else return error('unsupported_grant_type');
                    if (
                        source.scope
                            .split(' ')
                            .some(
                                (s) =>
                                    s &&
                                    !['openid', 'email', 'profile', 'offline_access'].includes(s),
                            )
                    )
                        return error('invalid_scope');
                    if (
                        p.grant_type !== 'client_credentials' &&
                        !current.users.some((u) => u.sub === source.sub)
                    )
                        return error('invalid_grant');
                    if (state.grants.length > 496) return error('temporarily_unavailable');
                    const seconds = current.scenario === 'expired_tokens' ? -60 : 300,
                        timestamp = Math.floor(now / 1000),
                        jti = randomUUID();
                    const privateKey = signingKey(state, id);
                    const accessToken = jwt(
                        state,
                        {
                            iss: base,
                            sub: source.sub,
                            aud: state.clientId,
                            iat: timestamp,
                            exp: timestamp + seconds,
                            scope: source.scope,
                            jti,
                        },
                        privateKey,
                    );
                    state.grants.push({
                        ...source,
                        type: 'access',
                        hash: hash(accessToken),
                        expires: now + seconds * 1000,
                    });
                    const body: Record<string, unknown> = {
                        access_token: accessToken,
                        token_type: 'Bearer',
                        expires_in: Math.max(0, seconds),
                        scope: source.scope,
                    };
                    const user = current.users.find((u) => u.sub === source.sub);
                    if (p.grant_type !== 'client_credentials' && user) {
                        if (source.scope.split(' ').includes('openid'))
                            body.id_token = jwt(
                                state,
                                {
                                    ...userClaims(current, user, source.scope),
                                    iss: base,
                                    aud: state.clientId,
                                    iat: timestamp,
                                    exp: timestamp + seconds,
                                    ...(source.nonce ? { nonce: source.nonce } : {}),
                                    at_hash: createHash('sha256')
                                        .update(accessToken)
                                        .digest()
                                        .subarray(0, 16)
                                        .toString('base64url'),
                                },
                                privateKey,
                            );
                        if (source.scope.split(' ').includes('offline_access')) {
                            const refresh = random();
                            body.refresh_token = refresh;
                            state.grants.push({
                                ...source,
                                type: 'refresh',
                                hash: hash(refresh),
                                expires: now + 3600000,
                            });
                        }
                    }
                    return { payload, result: { status: 200, body } };
                });
                if (!result) return fail(reply, 'invalid_request', 'Provider expired.', 404);
                if (result === 'full')
                    return fail(reply, 'temporarily_unavailable', 'Storage capacity reached.', 503);
                return reply.code(result.status).send(result.body);
            },
        });
    });
}
