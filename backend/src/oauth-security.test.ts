import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { ResourceStore } from './resources.js';
import { MemoryMockCalls } from './mock-calls.js';
import { secretVault } from './secret-vault.js';

const origin = 'http://localhost:3000',
    serverSecret = 'oauth-security-server-secret-32-characters';
const callback = 'http://localhost:3333/callback';
const configuration = {
    name: 'Security fixture',
    redirectUris: [callback],
    users: [{ sub: 'test-user', email: 'test@example.test', name: 'Test user' }],
    headless: true,
};
const verifier = 'a'.repeat(43),
    challenge = createHash('sha256').update(verifier).digest('base64url');
type Provider = { id: string; issuer: string; client_id: string; client_secret: string };
async function fixture(
    t: { after(fn: () => unknown): void },
    options: { calls?: MemoryMockCalls; secret?: string | null } = {},
) {
    const identities = new MemoryIdentityRepository(),
        resources = new ResourceStore();
    const user = identities.register('oauth-security', 'test')!,
        session = 'q'.repeat(43);
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    const key = identities.createKey(
        identity,
        'OAuth test',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const headers = { authorization: `Bearer ${key.key}` };
    const app = buildApp({
        identityStore: identities,
        resourceStore: resources,
        ...(options.secret === null ? {} : { authSecret: options.secret ?? serverSecret }),
        ...(options.calls ? { mockCalls: options.calls } : {}),
    });
    t.after(() => app.close());
    const create = async (config: object = configuration) => {
        const r = await app.inject({
            method: 'POST',
            url: '/api/oauth-providers',
            headers,
            payload: config,
        });
        assert.equal(r.statusCode, 201, r.body);
        return r.json<Provider>();
    };
    const params = (p: Provider, redirect = callback, extra: Record<string, string> = {}) =>
        new URLSearchParams({
            client_id: p.client_id,
            redirect_uri: redirect,
            response_type: 'code',
            scope: 'openid email offline_access',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'test-state',
            prompt: 'none',
            login_hint: 'test-user',
            ...extra,
        });
    const exchange = (p: Provider, code: string, extra: Record<string, string> = {}) =>
        app.inject({
            method: 'POST',
            url: `/oauth/${p.id}/token`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: new URLSearchParams({
                client_id: p.client_id,
                client_secret: p.client_secret,
                grant_type: 'authorization_code',
                redirect_uri: callback,
                code_verifier: verifier,
                code,
                ...extra,
            }).toString(),
        });
    const tokens = async (p: Provider, extra: Record<string, string> = {}) => {
        const a = await app.inject(`/oauth/${p.id}/authorize?${params(p)}`);
        assert.equal(a.statusCode, 302, a.body);
        const r = await exchange(
            p,
            new URL(String(a.headers.location)).searchParams.get('code')!,
            extra,
        );
        assert.equal(r.statusCode, 200, r.body);
        return r.json();
    };
    const post = (
        p: Provider,
        endpoint: string,
        body: Record<string, string>,
        publicClient = false,
    ) =>
        app.inject({
            method: 'POST',
            url: `/oauth/${p.id}/${endpoint}`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: new URLSearchParams({
                client_id: p.client_id,
                ...(publicClient ? {} : { client_secret: p.client_secret }),
                ...body,
            }).toString(),
        });
    return {
        app,
        resources,
        identities,
        owner: user.personalAccountId,
        headers,
        create,
        params,
        exchange,
        tokens,
        post,
    };
}
function validateJwt(token: string, keys: Record<string, unknown>[]) {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(Buffer.from(h!, 'base64url').toString());
    const key = keys.find((k) => k.kid === header.kid);
    assert.ok(key, 'JWT key must remain in JWKS until token expiry');
    assert.equal(
        verify(
            'RSA-SHA256',
            Buffer.from(`${h}.${p}`),
            createPublicKey({ key, format: 'jwk' }),
            Buffer.from(s!, 'base64url'),
        ),
        true,
    );
    return JSON.parse(Buffer.from(p!, 'base64url').toString());
}

test('public destinations require a same-origin Continue step for unsupported responses, denial and headless approval', async (t) => {
    const f = await fixture(t);
    const destinations = [
        'http://localhost:3333/callback',
        'http://127.0.0.1:3333/callback',
        'http://[::1]:3333/callback',
        'https://external.example/callback',
    ];
    const provider = await f.create({ ...configuration, redirectUris: destinations });
    for (const destination of destinations)
        for (const scenario of ['unsupported', 'access_denied', 'headless']) {
            assert.equal(
                (
                    await f.app.inject({
                        method: 'PUT',
                        url: `/api/oauth-providers/${provider.id}`,
                        headers: f.headers,
                        payload: {
                            ...configuration,
                            redirectUris: destinations,
                            scenario: scenario === 'access_denied' ? 'access_denied' : 'none',
                        },
                    })
                ).statusCode,
                204,
            );
            const query = f.params(
                provider,
                destination,
                scenario === 'unsupported' ? { response_type: 'token' } : {},
            );
            const response = await f.app.inject(`/oauth/${provider.id}/authorize?${query}`);
            const expectedError =
                scenario === 'unsupported'
                    ? 'unsupported_response_type'
                    : scenario === 'access_denied'
                      ? 'access_denied'
                      : null;
            if (new URL(destination).hostname !== 'external.example') {
                assert.equal(response.statusCode, 302, response.body);
                const target = new URL(String(response.headers.location));
                assert.equal(target.origin, new URL(destination).origin);
                assert.equal(target.searchParams.get('error'), expectedError);
                if (!expectedError) assert.ok(target.searchParams.get('code'));
                continue;
            }
            assert.equal(response.statusCode, 200, response.body);
            assert.equal(response.headers.location, undefined);
            assert.match(response.body, /<h1>socket.help test provider<\/h1>/);
            assert.match(response.body, /You are leaving socket.help for/);
            assert.ok(response.body.includes(new URL(destination).origin));
            assert.match(response.body, />Continue<\/button>/);
            assert.match(String(response.headers['x-robots-tag']), /noindex/);
            const consent = /name="consent" value="([^"]+)"/.exec(response.body)![1]!;
            const confirm = (requestOrigin?: string) =>
                f.app.inject({
                    method: 'POST',
                    url: `/oauth/${provider.id}/authorize`,
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        ...(requestOrigin ? { origin: requestOrigin } : {}),
                    },
                    payload: new URLSearchParams({
                        consent,
                        user: 'test-user',
                        decision: 'continue',
                    }).toString(),
                });
            for (const requestOrigin of [undefined, 'https://attacker.example']) {
                const blocked = await confirm(requestOrigin);
                assert.equal(blocked.statusCode, 403, blocked.body);
                assert.equal(blocked.headers.location, undefined);
            }
            const continued = await confirm(origin);
            assert.equal(continued.statusCode, 302, continued.body);
            const target = new URL(String(continued.headers.location));
            assert.equal(target.origin, 'https://external.example');
            assert.equal(target.searchParams.get('state'), 'test-state');
            assert.equal(target.searchParams.get('error'), expectedError);
            if (!expectedError) assert.ok(target.searchParams.get('code'));
        }
});

test('provider responses wait for request logs to commit before inspection can run', async (t) => {
    const entered = Promise.withResolvers<void>(),
        gate = Promise.withResolvers<void>();
    class DelayedCalls extends MemoryMockCalls {
        override async record(...args: Parameters<MemoryMockCalls['record']>) {
            entered.resolve();
            await gate.promise;
            super.record(...args);
        }
    }
    const f = await fixture(t, { calls: new DelayedCalls() }),
        provider = await f.create();
    let sent = false;
    const response = f.app.inject(`/oauth/${provider.id}/jwks`).then((r) => {
        sent = true;
        return r;
    });
    try {
        await entered.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(sent, false, 'reply must not finish before logging');
    } finally {
        gate.resolve();
    }
    assert.equal((await response).statusCode, 200);
    const inspected = await f.app.inject({
        url: `/api/mocks/${provider.id}/calls`,
        headers: f.headers,
    });
    assert.equal(inspected.json().calls.length, 1);
    assert.equal(inspected.json().calls[0].path, `/oauth/${provider.id}/jwks`);
});

test('RSA private keys are encrypted with resource binding and rotation keeps live public keys with a one minute limit', async (t) => {
    const original = Date.now;
    let now = original();
    Date.now = () => now;
    t.after(() => {
        Date.now = original;
    });
    const f = await fixture(t),
        provider = await f.create();
    const stored = (await f.resources.read(provider.id, 'mock', '', f.owner))!;
    const state = stored.payload.oauthState as { encryptedPrivateKey: string };
    assert.ok(!JSON.stringify(stored.payload).includes('PRIVATE KEY'));
    assert.ok(!('privateKey' in state));
    const vault = secretVault(serverSecret, 'oauth-rsa-v1');
    assert.match(vault.decrypt(state.encryptedPrivateKey, provider.id), /PRIVATE KEY/);
    assert.throws(() => vault.decrypt(state.encryptedPrivateKey, 'another-resource'));
    assert.throws(() =>
        secretVault('different-server-secret', 'oauth-rsa-v1').decrypt(
            state.encryptedPrivateKey,
            provider.id,
        ),
    );
    const first = await f.tokens(provider);
    const rotate = () =>
        f.app.inject({
            method: 'PUT',
            url: `/api/oauth-providers/${provider.id}`,
            headers: f.headers,
            payload: { ...configuration, scenario: 'rotated_signing_key' },
        });
    const rotations = await Promise.all([rotate(), rotate()]);
    assert.deepEqual(rotations.map((r) => r.statusCode).sort(), [204, 429]);
    assert.equal(rotations.find((r) => r.statusCode === 429)!.headers['retry-after'], '60');
    const jwks = async () =>
        (await f.app.inject(`/oauth/${provider.id}/jwks`)).json().keys as Record<string, unknown>[];
    const retained = await jwks();
    assert.equal(retained.length, 2);
    validateJwt(first.id_token, retained);
    const second = await f.tokens(provider);
    validateJwt(second.id_token, retained);
    const firstKid = JSON.parse(
        Buffer.from(first.id_token.split('.')[0], 'base64url').toString(),
    ).kid;
    const nextKid = JSON.parse(
        Buffer.from(second.id_token.split('.')[0], 'base64url').toString(),
    ).kid;
    assert.notEqual(firstKid, nextKid);
    now += 60000;
    assert.equal((await rotate()).statusCode, 204);
    assert.equal((await jwks()).length, 3);
    now += 241000;
    assert.equal((await jwks()).length, 1);
});

test('refresh token reuse revokes every active token in its family without affecting another grant', async (t) => {
    const f = await fixture(t),
        provider = await f.create();
    const first = await f.tokens(provider),
        separate = await f.tokens(provider);
    const rotated = await f.post(provider, 'token', {
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
    });
    assert.equal(rotated.statusCode, 200, rotated.body);
    const latest = rotated.json();
    const reused = await f.post(provider, 'token', {
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
    });
    assert.equal(reused.statusCode, 400);
    assert.equal(reused.json().error, 'invalid_grant');
    assert.equal(
        (
            await f.post(provider, 'token', {
                grant_type: 'refresh_token',
                refresh_token: latest.refresh_token,
            })
        ).json().error,
        'invalid_grant',
    );
    for (const token of [first.access_token, latest.access_token])
        assert.equal(
            (
                await f.app.inject({
                    url: `/oauth/${provider.id}/userinfo`,
                    headers: { authorization: `Bearer ${token}` },
                })
            ).statusCode,
            401,
        );
    assert.equal(
        (
            await f.app.inject({
                url: `/oauth/${provider.id}/userinfo`,
                headers: { authorization: `Bearer ${separate.access_token}` },
            })
        ).statusCode,
        200,
    );
});

test('public PKCE clients can refresh and revoke tokens while confidential grants still need their secret', async (t) => {
    const f = await fixture(t),
        provider = await f.create();
    const publicTokens = await f.tokens(provider, { client_secret: '' });
    const refreshed = await f.post(
        provider,
        'token',
        { grant_type: 'refresh_token', refresh_token: publicTokens.refresh_token },
        true,
    );
    assert.equal(refreshed.statusCode, 200, refreshed.body);
    assert.equal(
        (await f.post(provider, 'revoke', { token: refreshed.json().refresh_token }, true))
            .statusCode,
        200,
    );
    assert.equal(
        (
            await f.post(
                provider,
                'token',
                { grant_type: 'refresh_token', refresh_token: refreshed.json().refresh_token },
                true,
            )
        ).json().error,
        'invalid_grant',
    );
    assert.equal(
        (
            await f.app.inject({
                url: `/oauth/${provider.id}/userinfo`,
                headers: { authorization: `Bearer ${publicTokens.access_token}` },
            })
        ).statusCode,
        401,
    );
    assert.equal(
        (await f.post(provider, 'revoke', { token: 'unknown-token' }, true)).statusCode,
        200,
    );
    const confidential = await f.tokens(provider);
    assert.equal(
        (await f.post(provider, 'revoke', { token: confidential.refresh_token }, true)).statusCode,
        401,
    );
    assert.equal(
        (await f.post(provider, 'revoke', { token: confidential.refresh_token })).statusCode,
        200,
    );
});

test('OAuth protocol errors always use error and error_description, including parsing, rate, storage and missing-secret errors', async (t) => {
    const f = await fixture(t),
        provider = await f.create();
    const responses = [
        await f.app.inject(`/oauth/${provider.id}/missing`),
        await f.app.inject('/oauth/missing'),
        await f.app.inject({ method: 'PUT', url: `/oauth/${provider.id}/token` }),
        await f.app.inject({
            method: 'POST',
            url: `/oauth/${provider.id}/token`,
            headers: { 'content-type': 'application/json' },
            payload: '{',
        }),
        await f.app.inject({
            method: 'POST',
            url: `/oauth/${provider.id}/token`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: 'grant_type=x&grant_type=y',
        }),
        await f.app.inject({
            method: 'POST',
            url: `/oauth/${provider.id}/token`,
            headers: { 'content-type': 'text/plain' },
            payload: 'wrong type',
        }),
        await f.app.inject({
            method: 'POST',
            url: `/oauth/${provider.id}/token`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ large: 'x'.repeat(32768) }),
        }),
        await f.app.inject(`/oauth/${provider.id}/userinfo`),
        await f.post(provider, 'token', { grant_type: 'authorization_code', code: 'unknown' }),
    ];
    const state = (await f.resources.read(provider.id, 'mock', '', f.owner))!.payload
        .oauthState as { encryptedPrivateKey: string };
    await f.resources.mutateMock(
        provider.id,
        { ownerId: f.owner, managementToken: '' },
        (payload) => {
            (payload.oauthState as typeof state).encryptedPrivateKey = 'corrupt';
            return { payload, result: true };
        },
    );
    responses.push(await f.post(provider, 'token', { grant_type: 'client_credentials' }));
    let limited;
    for (let i = 0; i < 125; i++) {
        const r = await f.app.inject(`/oauth/${provider.id}/jwks`);
        if (r.statusCode === 429) {
            limited = r;
            break;
        }
    }
    assert.ok(limited);
    responses.push(limited);
    for (const response of responses) {
        assert.ok(response.statusCode >= 400, response.body);
        const body = response.json();
        assert.equal(typeof body.error, 'string');
        assert.equal(typeof body.error_description, 'string', response.body);
        assert.ok(body.error_description);
        assert.equal(body.requestId, undefined);
        assert.equal(body.message, undefined);
        assert.equal(body.statusCode, undefined);
    }
    const unconfigured = await fixture(t, { secret: null });
    assert.equal(
        (
            await unconfigured.app.inject({
                method: 'POST',
                url: '/api/oauth-providers',
                headers: unconfigured.headers,
                payload: configuration,
            })
        ).statusCode,
        503,
    );
});
