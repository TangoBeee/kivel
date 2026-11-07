import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { buildApp } from './app.js';
import { ResourceStore } from './resources.js';
import { oauthLimits, validateOAuth } from '@kivel.io/tools/oauth';
import { Kivel } from '@kivel.io/sdk';
import { command, needsInput } from '@kivel.io/cli';

const origin = 'http://localhost:3000';
const config = {
    name: 'Test app',
    redirectUris: ['http://localhost:3333/callback?app=test'],
    users: [
        {
            sub: 'user-1',
            email: 'test@example.test',
            name: 'Test user',
            claims: { role: 'tester' },
        },
    ],
    claims: { tenant: 'sandbox' },
    headless: true,
};
const verifier = 'a'.repeat(43),
    challenge = createHash('sha256').update(verifier).digest('base64url');
async function oauthOwner(app: ReturnType<typeof buildApp>, username = 'oauth-owner') {
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username,
            email: `${username}@example.test`,
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(response.statusCode, 201, response.body);
    return { origin, cookie: String(response.headers['set-cookie']).split(';')[0]! };
}
async function oauthFlow(
    app: ReturnType<typeof buildApp>,
    provider: { id: string; client_id: string; client_secret: string },
) {
    const path = `/oauth/${provider.id}`;
    const params = new URLSearchParams({
        client_id: provider.client_id,
        redirect_uri: config.redirectUris[0]!,
        response_type: 'code',
        scope: 'openid email profile offline_access',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'test-state',
        nonce: 'test-nonce',
        prompt: 'none',
        login_hint: 'test@example.test',
    });
    const authorize = await app.inject(`${path}/authorize?${params}`);
    const location = authorize.headers.location
        ? new URL(String(authorize.headers.location))
        : undefined;
    const exchange = (fields: Record<string, string> = {}) =>
        app.inject({
            method: 'POST',
            url: `${path}/token`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: new URLSearchParams({
                client_id: provider.client_id,
                client_secret: provider.client_secret,
                grant_type: 'authorization_code',
                redirect_uri: config.redirectUris[0]!,
                code: location?.searchParams.get('code') ?? '',
                code_verifier: verifier,
                ...fields,
            }).toString(),
        });
    return { path, params, authorize, location, exchange };
}

test('OAuth code and PKCE flow validates ID and access signatures against JWKS, rotates refresh tokens and revokes the family', async (t) => {
    const app = buildApp({ authSecret: 'oauth-test-server-secret-32-characters' });
    t.after(() => app.close());
    const headers = await oauthOwner(app);
    const created = await app.inject({
        method: 'POST',
        url: '/api/oauth-providers',
        headers,
        payload: config,
    });
    assert.equal(created.statusCode, 201, created.body);
    const provider = created.json();
    const f = await oauthFlow(app, provider);
    assert.equal(f.authorize.statusCode, 302, f.authorize.body);
    assert.equal(f.location?.searchParams.get('state'), 'test-state');
    const discovery = (await app.inject(`${f.path}/.well-known/openid-configuration`)).json();
    assert.equal(discovery.issuer, provider.issuer);
    const tokens = await f.exchange();
    assert.equal(tokens.statusCode, 200, tokens.body);
    const data = tokens.json();
    const jwk = (await app.inject(`${f.path}/jwks`)).json().keys[0];
    for (const token of [data.id_token, data.access_token]) {
        const [h, p, s] = token.split('.');
        const header = JSON.parse(Buffer.from(h, 'base64url').toString());
        assert.equal(header.kid, jwk.kid);
        assert.equal(header.alg, 'RS256');
        assert.equal(
            verify(
                'RSA-SHA256',
                Buffer.from(`${h}.${p}`),
                createPublicKey({ key: jwk, format: 'jwk' }),
                Buffer.from(s, 'base64url'),
            ),
            true,
        );
        const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
        assert.equal(claims.iss, provider.issuer);
        assert.equal(claims.aud, provider.client_id);
        assert.equal(claims.sub, 'user-1');
        assert.ok(claims.exp > Date.now() / 1000);
    }
    const idClaims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString());
    assert.equal(idClaims.nonce, 'test-nonce');
    assert.equal(idClaims.role, 'tester');
    assert.equal(idClaims.tenant, 'sandbox');
    assert.equal((await f.exchange()).json().error, 'invalid_grant');
    assert.equal(
        (
            await app.inject({
                url: `${f.path}/userinfo`,
                headers: { authorization: `Bearer ${data.access_token}` },
            })
        ).json().email,
        'test@example.test',
    );
    const post = (endpoint: string, body: Record<string, string>) =>
        app.inject({
            method: 'POST',
            url: `${f.path}/${endpoint}`,
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                authorization: `Basic ${Buffer.from(`${provider.client_id}:${provider.client_secret}`).toString('base64')}`,
            },
            payload: new URLSearchParams(body).toString(),
        });
    const refresh = await post('token', {
        grant_type: 'refresh_token',
        refresh_token: data.refresh_token,
    });
    assert.equal(refresh.statusCode, 200, refresh.body);
    assert.notEqual(refresh.json().refresh_token, data.refresh_token);
    assert.equal(
        (
            await post('token', { grant_type: 'refresh_token', refresh_token: data.refresh_token })
        ).json().error,
        'invalid_grant',
    );
    assert.equal((await post('revoke', { token: refresh.json().refresh_token })).statusCode, 200);
    assert.equal(
        (
            await app.inject({
                url: `${f.path}/userinfo`,
                headers: { authorization: `Bearer ${data.access_token}` },
            })
        ).statusCode,
        401,
    );
    assert.equal(
        (
            await post('token', {
                grant_type: 'refresh_token',
                refresh_token: refresh.json().refresh_token,
            })
        ).json().error,
        'invalid_grant',
    );
    const cc = await post('token', { grant_type: 'client_credentials' });
    assert.equal(cc.statusCode, 200, cc.body);
    assert.equal(cc.json().id_token, undefined);
    assert.equal(cc.json().refresh_token, undefined);
    const calls = (await app.inject({ url: `/api/mocks/${provider.id}/calls`, headers })).json()
        .calls;
    assert.ok(calls.some((c: { path: string }) => c.path.endsWith('/jwks')));
    assert.ok(calls.some((c: { path: string }) => c.path.endsWith('/token')));
    const logs = JSON.stringify(calls);
    for (const secret of [
        provider.client_secret,
        data.refresh_token,
        f.location!.searchParams.get('code')!,
    ])
        assert.ok(!logs.includes(secret));
    const inspection = await app.inject({ url: `/api/mocks/${provider.id}`, headers });
    assert.equal(inspection.json().oauthState, undefined);
    assert.ok(!inspection.body.includes('PRIVATE KEY'));
});

test('OAuth failure scenarios are deterministic and key rotation invalidates cached signing keys', async (t) => {
    const app = buildApp({ authSecret: 'oauth-test-server-secret-32-characters' });
    t.after(() => app.close());
    const headers = await oauthOwner(app);
    const provider = (
        await app.inject({ method: 'POST', url: '/api/oauth-providers', headers, payload: config })
    ).json();
    for (const scenario of [
        'access_denied',
        'invalid_grant',
        'expired_code',
        'wrong_redirect_uri',
        'invalid_pkce_verifier',
        'expired_tokens',
        'slow_token_endpoint',
        'rotated_signing_key',
    ]) {
        const oldJwk = (await app.inject(`/oauth/${provider.id}/jwks`)).json().keys[0];
        assert.equal(
            (
                await app.inject({
                    method: 'PUT',
                    url: `/api/oauth-providers/${provider.id}`,
                    headers,
                    payload: { ...config, scenario },
                })
            ).statusCode,
            204,
        );
        const f = await oauthFlow(app, provider);
        if (scenario === 'access_denied') {
            assert.equal(f.location?.searchParams.get('error'), 'access_denied');
            continue;
        }
        const start = Date.now();
        const response = await f.exchange();
        if (
            [
                'invalid_grant',
                'expired_code',
                'wrong_redirect_uri',
                'invalid_pkce_verifier',
            ].includes(scenario)
        ) {
            assert.equal(response.json().error, 'invalid_grant', response.body);
            continue;
        }
        assert.equal(response.statusCode, 200, response.body);
        if (scenario === 'expired_tokens') {
            const claims = JSON.parse(
                Buffer.from(response.json().id_token.split('.')[1], 'base64url').toString(),
            );
            assert.ok(claims.exp < Date.now() / 1000);
            assert.equal(
                (
                    await app.inject({
                        url: `${f.path}/userinfo`,
                        headers: { authorization: `Bearer ${response.json().access_token}` },
                    })
                ).statusCode,
                401,
            );
        }
        if (scenario === 'slow_token_endpoint') assert.ok(Date.now() - start >= 1400);
        if (scenario === 'rotated_signing_key') {
            const next = (await app.inject(`${f.path}/jwks`)).json().keys[0];
            assert.notEqual(next.kid, oldJwk.kid);
            const [h, p, s] = response.json().id_token.split('.');
            assert.equal(
                verify(
                    'RSA-SHA256',
                    Buffer.from(`${h}.${p}`),
                    createPublicKey({ key: oldJwk, format: 'jwk' }),
                    Buffer.from(s, 'base64url'),
                ),
                false,
            );
        }
    }
});

test('OAuth enforces exact redirects, S256 PKCE, consent and headless opt in without accepting real credentials', async (t) => {
    const app = buildApp({ authSecret: 'oauth-test-server-secret-32-characters' });
    t.after(() => app.close());
    const headers = await oauthOwner(app);
    const provider = (
        await app.inject({
            method: 'POST',
            url: '/api/oauth-providers',
            headers,
            payload: { ...config, headless: false },
        })
    ).json();
    const f = await oauthFlow(app, provider);
    assert.equal(f.location?.searchParams.get('error'), 'login_required');
    for (const redirect of [
        'https://evil.test/',
        'https://client.example/callback?app=test#fragment',
        'https://client.example/callback?app=test&next=evil',
        'https://client.example/callback',
        'https://client.example.evil/callback',
    ]) {
        f.params.set('redirect_uri', redirect);
        const r = await app.inject(`${f.path}/authorize?${f.params}`);
        assert.equal(r.statusCode, 400);
        assert.equal(r.headers.location, undefined);
    }
    f.params.set('redirect_uri', config.redirectUris[0]!);
    f.params.delete('prompt');
    const page = await app.inject(`${f.path}/authorize?${f.params}`);
    assert.equal(page.statusCode, 200, page.body);
    assert.match(page.body, /<h1>Kivel test provider<\/h1>/);
    assert.match(String(page.headers['x-robots-tag']), /noindex/);
    assert.match(String(page.headers['content-security-policy']), /frame-ancestors 'none'/);
    assert.ok(!page.body.includes('password"'));
    const consent = /name="consent" value="([^"]+)"/.exec(page.body)![1]!;
    const approve = await app.inject({
        method: 'POST',
        url: `${f.path}/authorize`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ consent, user: 'user-1', decision: 'approve' }).toString(),
    });
    assert.ok(new URL(String(approve.headers.location)).searchParams.get('code'));
    const deny = await app.inject({
        method: 'POST',
        url: `${f.path}/authorize`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ consent, user: 'user-1', decision: 'deny' }).toString(),
    });
    assert.equal(new URL(String(deny.headers.location)).searchParams.get('error'), 'access_denied');
    f.params.set('code_challenge_method', 'plain');
    assert.equal(
        new URL(
            String((await app.inject(`${f.path}/authorize?${f.params}`)).headers.location),
        ).searchParams.get('error'),
        'invalid_request',
    );
    assert.equal((await app.inject(`${f.path}/token`)).statusCode, 405);
    for (const uri of [
        'https://example.test/#',
        'javascript:alert(1)',
        'http://remote.test/cb',
        'https://a:b@example.test/cb',
    ])
        assert.throws(() => validateOAuth({ ...config, redirectUris: [uri] }));
    assert.throws(() => validateOAuth({ ...config, claims: { iss: 'forged' } }));
});

test('OAuth workspace limits, isolation, expiry and atomic code consumption apply to every adapter', async (t) => {
    let now = Date.now();
    const store = new ResourceStore(() => now);
    const app = buildApp({
        resourceStore: store,
        authSecret: 'oauth-test-server-secret-32-characters',
    });
    t.after(() => app.close());
    const headers = await oauthOwner(app),
        other = await oauthOwner(app, 'oauth-other');
    assert.deepEqual(oauthLimits, { anonymous: 0, free: 1, pro: 10, team: 50 });
    const advertised = (await app.inject('/api/plans')).json().plans;
    for (const plan of ['free', 'pro', 'team'] as const)
        assert.equal(advertised[plan].oauthProviders, oauthLimits[plan]);
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/oauth-providers', payload: config }))
            .statusCode,
        401,
    );
    const created = await Promise.all(
        [1, 2].map(() =>
            app.inject({ method: 'POST', url: '/api/oauth-providers', headers, payload: config }),
        ),
    );
    assert.deepEqual(created.map((r) => r.statusCode).sort(), [201, 429]);
    const provider = created.find((r) => r.statusCode === 201)!.json();
    for (const url of [
        `/api/oauth-providers/${provider.id}`,
        `/api/mocks/${provider.id}`,
        `/api/mocks/${provider.id}/calls`,
    ])
        assert.equal((await app.inject({ url, headers: other })).statusCode, 404);
    for (const method of ['PUT', 'DELETE'] as const)
        assert.equal(
            (
                await app.inject({
                    method,
                    url: `/api/oauth-providers/${provider.id}`,
                    headers: other,
                    ...(method === 'PUT' ? { payload: config } : {}),
                })
            ).statusCode,
            404,
        );
    const f = await oauthFlow(app, provider);
    const exchanged = await Promise.all([f.exchange(), f.exchange()]);
    assert.deepEqual(exchanged.map((r) => r.statusCode).sort(), [200, 400]);
    const sdk = new Kivel({
        baseUrl: origin,
        fetch: async (url, init) => {
            const u = new URL(String(url));
            const r = await app.inject({
                method: (init?.method ?? 'GET') as 'GET',
                url: u.pathname + u.search,
                headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers },
                ...(init?.body ? { payload: String(init.body) } : {}),
            });
            return new Response(r.statusCode === 204 ? null : r.body, {
                status: r.statusCode,
                headers: r.headers as Record<string, string>,
            });
        },
    });
    assert.equal((await sdk.oauthProvider(provider.id)).id, provider.id);
    assert.equal(
        ((await command(sdk, ['oauth', 'list'])) as { providers: unknown[] }).providers.length,
        1,
    );
    assert.equal(needsInput(['oauth', 'create']), true);
    const mcp = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...headers, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'inspect_mock_api', arguments: { id: provider.id } },
        },
    });
    assert.ok(!mcp.body.includes('PRIVATE KEY'));
    assert.ok(!mcp.body.includes('oauthState'));
    now += 3600001;
    assert.equal((await app.inject(`${f.path}/jwks`)).statusCode, 404);
    assert.equal((await sdk.oauthProviders()).providers.length, 0);
    const next = (await command(sdk, ['oauth', 'create'], Buffer.from(JSON.stringify(config)))) as {
        id: string;
    };
    assert.ok(next.id);
    await sdk.deleteOAuthProvider(next.id);
    assert.equal((await app.inject(`/oauth/${next.id}/jwks`)).statusCode, 404);
});

test('MCP agents create, authorize, exchange and inspect a provider without leaving the mock tools', async (t) => {
    const app = buildApp({ authSecret: 'oauth-test-server-secret-32-characters' });
    t.after(() => app.close());
    const headers = await oauthOwner(app);
    const mcp = async (name: string, args: Record<string, unknown>) => {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { ...headers, accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        assert.ok(response.json().result, response.body);
        const result = response.json().result;
        assert.ok(!result.isError, response.body);
        return JSON.parse(result.content[0].text);
    };
    const provider = await mcp('create_oauth_provider', { ...config, ttlSeconds: 120 });
    const f = await oauthFlow(app, provider);
    const auth = await mcp('call_mock_api', {
        id: provider.id,
        method: 'GET',
        path: `/authorize?${f.params}`,
    });
    assert.equal(auth.status, 302);
    const code = new URL(auth.location).searchParams.get('code');
    assert.ok(code);
    const token = await mcp('call_mock_api', {
        id: provider.id,
        method: 'POST',
        path: '/token',
        body: {
            grant_type: 'authorization_code',
            client_id: provider.client_id,
            client_secret: provider.client_secret,
            redirect_uri: config.redirectUris[0],
            code,
            code_verifier: verifier,
        },
    });
    assert.equal(token.status, 200);
    assert.ok(token.body.id_token);
    const user = await mcp('call_mock_api', {
        id: provider.id,
        method: 'GET',
        path: '/userinfo',
        accessToken: token.body.access_token,
    });
    assert.equal(user.body.sub, 'user-1');
    const inspection = await mcp('inspect_mock_api', { id: provider.id });
    assert.equal(inspection.issuer, provider.issuer);
    assert.ok(inspection.recentCalls.length >= 3);
    assert.equal(inspection.oauthState, undefined);
    const search = await mcp('search_tools', { query: 'OAuth' });
    assert.ok(JSON.stringify(search).includes('create_oauth_provider'));
    const description = await mcp('describe_tool', { toolId: 'mock-apis-mock-oauth-provider' });
    assert.equal(description.mcpTool, 'create_oauth_provider');
    await mcp('resource_request', {
        kind: 'oauth-providers',
        action: 'update',
        id: provider.id,
        config: { ...config, scenario: 'access_denied' },
    });
    assert.equal(
        (
            await mcp('resource_request', {
                kind: 'oauth-providers',
                action: 'inspect',
                id: provider.id,
            })
        ).oauth.scenario,
        'access_denied',
    );
    await mcp('delete_mock_api', { id: provider.id });
    assert.equal((await app.inject(`/oauth/${provider.id}/jwks`)).statusCode, 404);
});

test('provider plan counts enforce Free, Pro and Team limits and deletion restores an allocation', () => {
    for (const plan of ['free', 'pro', 'team'] as const) {
        const store = new ResourceStore();
        const context = {
            ownerId: 'owner',
            quotaKey: 'quota',
            plan,
            visibility: 'public' as const,
        };
        const payload = { oauth: config };
        const created = Array.from({ length: oauthLimits[plan] }, () =>
            store.create('mock', payload, undefined, context)!,
        );
        assert.throws(
            () => store.create('mock', payload, undefined, context),
            /active resource limit/,
        );
        assert.equal(store.delete(created[0]!.id, 'mock', '', context.ownerId), true);
        assert.ok(store.create('mock', payload, undefined, context));
    }
});

test('token endpoints reject mismatched redirects, incorrect verifiers, unknown clients and repeated form parameters', async (t) => {
    const app = buildApp({ authSecret: 'oauth-test-server-secret-32-characters' });
    t.after(() => app.close());
    const headers = await oauthOwner(app);
    const provider = (
        await app.inject({ method: 'POST', url: '/api/oauth-providers', headers, payload: config })
    ).json();
    for (const fields of [
        { redirect_uri: 'https://evil.test/callback' },
        { code_verifier: 'b'.repeat(43) },
        { code_verifier: 'short' },
        { client_secret: 'wrong' },
    ]) {
        const flow = await oauthFlow(app, provider);
        const r = await flow.exchange(fields);
        assert.equal(r.statusCode, fields.client_secret ? 401 : 400, r.body);
    }
    const flow = await oauthFlow(app, provider);
    assert.equal((await flow.exchange({ client_id: 'unknown-client' })).statusCode, 401);
    const duplicate = await app.inject({
        method: 'POST',
        url: `${flow.path}/token`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'grant_type=client_credentials&grant_type=refresh_token',
    });
    assert.equal(duplicate.statusCode, 400);
    const wrongClient = new URLSearchParams(flow.params);
    wrongClient.set('client_id', 'unknown');
    const rejected = await app.inject(`${flow.path}/authorize?${wrongClient}`);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.headers.location, undefined);
    const publicFlow = await oauthFlow(app, provider);
    assert.equal((await publicFlow.exchange({ client_secret: '' })).statusCode, 200);
    const sharing = await app.inject({
        method: 'POST',
        url: `/api/mocks/${provider.id}/sharing`,
        headers,
        payload: { visibility: 'private' },
    });
    assert.equal(sharing.statusCode, 400);
    for (const method of ['PUT', 'DELETE', 'HEAD'] as const)
        assert.equal((await app.inject({ method, url: `${flow.path}/jwks` })).statusCode, 405);
    const calls = (await app.inject({ url: `/api/mocks/${provider.id}/calls`, headers })).json()
        .calls;
    assert.ok(
        calls.some(
            (c: { method: string; status: number }) => c.method === 'DELETE' && c.status === 405,
        ),
    );
});
