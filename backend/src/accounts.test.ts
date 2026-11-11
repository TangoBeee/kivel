import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { Kivel } from '@kivel.io/sdk';
import { command } from '@kivel.io/cli';
const origin = 'http://localhost:3000';
async function signup(app: ReturnType<typeof buildApp>, username: string) {
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
    return {
        cookie: String(response.headers['set-cookie']).split(';')[0]!,
        account: response.json().account,
    };
}
async function key(app: ReturnType<typeof buildApp>, cookie: string, scopes?: string[]) {
    const response = await app.inject({
        method: 'POST',
        url: '/api/account/keys',
        headers: { origin, cookie },
        payload: { name: 'Integration test', ...(scopes ? { scopes } : {}) },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
}
test('sessions enforce CSRF, scoped keys are revocable, and owned resources reject leaked tokens', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const alice = await signup(app, 'alice'),
        bob = await signup(app, 'bob');
    const denied = await app.inject({
        method: 'POST',
        url: '/api/inboxes',
        headers: { cookie: alice.cookie },
    });
    assert.equal(denied.statusCode, 403);
    const credential = await key(app, alice.cookie);
    const headers = { authorization: `Bearer ${credential.key}` };
    const created = await app.inject({ method: 'POST', url: '/api/inboxes', headers });
    assert.equal(created.statusCode, 201);
    const inbox = created.json();
    assert.equal((await app.inject({ url: `/api/inboxes/${inbox.id}`, headers })).statusCode, 200);
    assert.equal(
        (
            await app.inject({
                url: `/api/inboxes/${inbox.id}`,
                headers: { authorization: `Bearer ${inbox.inspectionToken}` },
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                url: `/api/inboxes/${inbox.id}`,
                headers: { cookie: bob.cookie, 'x-resource-token': inbox.inspectionToken },
            })
        ).statusCode,
        404,
    );
    const readonly = await key(app, alice.cookie, ['resources:read']);
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/inboxes/${inbox.id}`,
                headers: { authorization: `Bearer ${readonly.key}` },
            })
        ).statusCode,
        403,
    );
    assert.equal(
        (
            await app.inject({
                url: `/api/inboxes/${inbox.id}`,
                headers: { authorization: `Bearer ${readonly.key}` },
            })
        ).statusCode,
        200,
    );
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/account/keys/${credential.info.id}`,
                headers: { origin, cookie: alice.cookie },
            })
        ).statusCode,
        204,
    );
    assert.equal((await app.inject({ url: `/api/inboxes/${inbox.id}`, headers })).statusCode, 401);
    assert.equal(
        (await app.inject({ url: `/api/inboxes/${inbox.id}`, headers: { cookie: alice.cookie } }))
            .statusCode,
        200,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/auth/logout',
                headers: { origin, cookie: alice.cookie },
            })
        ).statusCode,
        204,
    );
    assert.equal(
        (await app.inject({ url: '/api/account', headers: { cookie: alice.cookie } })).statusCode,
        401,
    );
});
test('anonymous allocations share one limit across resource types and deletion restores capacity', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inboxes = [];
    for (let index = 0; index < 4; index++)
        inboxes.push((await app.inject({ method: 'POST', url: '/api/inboxes' })).json());
    const mock = {
        name: 'Quota test',
        routes: [{ method: 'GET', path: '/', status: 200, body: 'ok' }],
    };
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/mocks', payload: mock })).statusCode,
        201,
    );
    const full = await app.inject({
        method: 'POST',
        url: '/api/files',
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'test.txt' },
        payload: 'x',
    });
    assert.equal(full.statusCode, 402);
    assert.equal(full.json().error, 'limit_reached');
    assert.equal(full.json().limit, 'resources.active');
    assert.equal(full.json().used, full.json().max);
    const inbox = inboxes[0];
    await app.inject({
        method: 'DELETE',
        url: `/api/inboxes/${inbox.id}`,
        headers: { authorization: `Bearer ${inbox.inspectionToken}` },
    });
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/mocks', payload: mock })).statusCode,
        201,
    );
    assert.equal((await app.inject({ url: '/api/account/resources' })).statusCode, 401);
});
test('SDK, CLI, HTTP and MCP execute one precision-preserving engine with shared usage', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const alice = await signup(app, 'sdk-user'),
        credential = await key(app, alice.cookie);
    const fetcher: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        const response = await app.inject({
            method: init?.method as 'POST',
            url: target.pathname + target.search,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            ...(init?.body !== undefined ? { payload: String(init.body) } : {}),
        });
        return new Response(response.statusCode === 204 ? null : response.body, {
            status: response.statusCode,
            headers: Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [key, String(value)]),
            ),
        });
    };
    const client = new Kivel({ baseUrl: origin, apiKey: credential.key, fetch: fetcher });
    const input = '{"large":9007199254740993,"duplicate":1,"duplicate":2}';
    const api = await client.run('json', input, { action: 'minify' });
    assert.equal(api.output, input);
    const cli = (await command(
        client,
        ['run', 'json', '--options', '{"action":"minify"}'],
        Buffer.from(input),
    )) as typeof api;
    assert.equal(cli.output, input);
    assert.equal(cli.usage.used, 2);
    const mcp = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
            authorization: `Bearer ${credential.key}`,
            accept: 'application/json, text/event-stream',
        },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'run_tool',
                arguments: { toolId: 'json', input, options: { action: 'minify' } },
            },
        },
    });
    const result = JSON.parse(mcp.json().result.content[0].text);
    assert.equal(result.output, input);
    assert.equal(result.usage.used, 3);
    const credit = JSON.parse(
        (
            await client.run('developer-credit-card-generator', '', {
                brand: 'amex',
                count: '2',
                address: 'true',
            })
        ).output,
    );
    assert.equal(credit.cards.length, 2);
    assert.equal(credit.cards[0].cvc.length, 4);
    assert.ok(credit.cards[0].billingAddress.country);
    const sandbox = JSON.parse(
        (
            await client.run('developer-credit-card-generator', '', {
                mode: 'sandbox',
                provider: 'paypal',
                address: 'true',
            })
        ).output,
    );
    assert.equal(sandbox.provider, 'paypal');
    assert.ok(sandbox.cards[0].billingAddress.country);
    const debit = (await command(
        client,
        [
            'run',
            'developer-debit-card-generator',
            '--options',
            '{"brand":"visa","mode":"sandbox","provider":"braintree","address":"true"}',
        ],
        Buffer.alloc(0),
    )) as typeof api;
    assert.equal(JSON.parse(debit.output).provider, 'braintree');
    assert.ok(JSON.parse(debit.output).cards[0].billingAddress.country);
    const prepaidMcp = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
            authorization: `Bearer ${credential.key}`,
            accept: 'application/json, text/event-stream',
        },
        payload: {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'run_tool',
                arguments: {
                    toolId: 'developer-prepaid-card-generator',
                    options: { count: '1', mode: 'sandbox', provider: 'stripe', address: 'true' },
                },
            },
        },
    });
    assert.equal(prepaidMcp.json().result.isError, false);
    const prepaid = JSON.parse(JSON.parse(prepaidMcp.json().result.content[0].text).output);
    assert.equal(prepaid.cards[0].paymentMethod, 'pm_card_mastercard_prepaid');
    assert.ok(prepaid.cards[0].billingAddress.country);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/tools/developer-prepaid-card-generator/run',
                payload: { options: { brand: 'unknown' } },
            })
        ).statusCode,
        400,
    );
    assert.equal((await client.run('uuid', '', { count: '2' })).output.split('\n').length, 2);
    const invalid = await app.inject({
        method: 'POST',
        url: '/api/tools/json/run',
        payload: { input: 'bad JSON' },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/tools/agents-mock-agents-llms/run',
                payload: { input: '' },
            })
        ).statusCode,
        404,
    );
});
test('retention and persistent resources enforce the active plan; billing defaults disabled', async (t) => {
    const identities = new MemoryIdentityRepository(),
        app = buildApp({ identityStore: identities });
    t.after(() => app.close());
    const alice = await signup(app, 'retention'),
        credential = await key(app, alice.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/inboxes?persistent=true', headers }))
            .statusCode,
        402,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/inboxes?ttlSeconds=604801', headers }))
            .statusCode,
        400,
    );
    const created = (
        await app.inject({ method: 'POST', url: '/api/inboxes?ttlSeconds=60', headers })
    ).json();
    const renewed = await app.inject({
        method: 'POST',
        url: `/api/inboxes/${created.id}/renew`,
        headers,
        payload: {},
    });
    assert.equal(renewed.statusCode, 200);
    assert.ok(Date.parse(renewed.json().expiresAt) - Date.now() > 23 * 3600000);
    await identities.setEntitlement(
        alice.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/inboxes?persistent=true', headers }))
            .statusCode,
        201,
    );
    await identities.setEntitlement(
        alice.account.id,
        'pro',
        new Date(Date.now() - 1000).toISOString(),
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/inboxes?persistent=true', headers }))
            .statusCode,
        402,
    );
    assert.deepEqual((await app.inject({ url: '/api/billing' })).json(), {
        provider: 'dodo',
        enabled: false,
        prices: [],
    });
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/billing/checkout',
                headers: { origin, cookie: alice.cookie },
                payload: { plan: 'pro' },
            })
        ).statusCode,
        503,
    );
});

test('SDK and CLI keep uploads private by default and preserve exact downloads', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const owner = await signup(app, 'file-sdk-user'),
        credential = await key(app, owner.cookie);
    const fetcher: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        const response = await app.inject({
            method: (init?.method ?? 'GET') as 'GET' | 'POST',
            url: target.pathname + target.search,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            ...(init?.body !== undefined
                ? {
                      payload:
                          init.body instanceof Uint8Array
                              ? Buffer.from(init.body)
                              : String(init.body),
                  }
                : {}),
        });
        return new Response(
            response.statusCode === 204 ? null : new Uint8Array(response.rawPayload),
            {
                status: response.statusCode,
                headers: Object.fromEntries(
                    Object.entries(response.headers).map(([name, value]) => [name, String(value)]),
                ),
            },
        );
    };
    const client = new Kivel({ baseUrl: origin, apiKey: credential.key, fetch: fetcher }),
        anonymous = new Kivel({ baseUrl: origin, fetch: fetcher });
    const bytes = new Uint8Array([0, 255, 128, 65]);
    const file = await client.upload('fixture.bin', bytes, {
        visibility: undefined,
        ttlSeconds: undefined,
    });
    assert.equal(file.visibility, 'private');
    assert.ok(file.accessToken);
    await assert.rejects(anonymous.downloadFile(file.id), /access denied/);
    assert.deepEqual(await anonymous.downloadFile(file.id, file.accessToken), bytes);
    assert.equal(
        (
            await app.inject({
                url: `/files/${file.id}`,
                headers: {
                    cookie: owner.cookie,
                    origin: 'https://other.example',
                    'sec-fetch-site': 'cross-site',
                },
            })
        ).statusCode,
        404,
    );
    assert.deepEqual(await command(client, ['download', file.id]), bytes);
    const publicFile = (await command(
        client,
        ['upload', 'public.bin', '--visibility', 'public'],
        bytes,
    )) as { id: string; visibility: string };
    assert.equal(publicFile.visibility, 'public');
    assert.deepEqual(await anonymous.downloadFile(publicFile.id), bytes);
    const oneTime = (await command(
        client,
        ['upload', 'once.bin', '--max-downloads', '1'],
        bytes,
    )) as { id: string; accessToken: string };
    assert.deepEqual(await anonymous.downloadFile(oneTime.id, oneTime.accessToken), bytes);
    await assert.rejects(anonymous.downloadFile(oneTime.id, oneTime.accessToken), /access denied/);
    const changed = await client.sharing('files', file.id, 'private');
    await assert.rejects(anonymous.downloadFile(file.id, file.accessToken), /access denied/);
    assert.deepEqual(await anonymous.downloadFile(file.id, changed.accessToken), bytes);
});

test('read-only account credentials cannot append to a private webhook inbox', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const owner = await signup(app, 'private-hook-owner'),
        full = await key(app, owner.cookie),
        read = await key(app, owner.cookie, ['resources:read']);
    const inbox = (
        await app.inject({
            method: 'POST',
            url: '/api/inboxes?visibility=private',
            headers: { authorization: `Bearer ${full.key}` },
        })
    ).json();
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id}`,
                headers: { authorization: `Bearer ${read.key}` },
                payload: 'blocked',
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id}`,
                headers: { authorization: `Bearer ${full.key}` },
                payload: 'allowed',
            })
        ).statusCode,
        200,
    );
});

test('signup requires and saves email even while SMTP delivery is unconfigured', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const create = (email?: string) =>
        app.inject({
            method: 'POST',
            url: '/api/auth/register',
            headers: { origin },
            payload: {
                username: 'email-required',
                password: 'a-long-registration-password',
                ...(email === undefined ? {} : { email }),
            },
        });
    assert.equal((await create()).statusCode, 400);
    assert.equal((await create('invalid')).statusCode, 400);
    const response = await create('Owner@Example.test');
    assert.equal(response.statusCode, 201);
    const cookie = String(response.headers['set-cookie']).split(';')[0]!;
    const recovery = (
        await app.inject({ url: '/api/account/recovery', headers: { cookie } })
    ).json();
    assert.equal(recovery.email, 'owner@example.test');
    assert.equal(recovery.verifiedAt, null);
    assert.equal(recovery.enabled, false);
});

test('failed hosted tools do not consume daily runs through HTTP or MCP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const alice = await signup(app, 'failed-runs'),
        credential = await key(app, alice.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    const usage = async () => (await app.inject({ url: '/api/usage', headers })).json().runsToday;
    const run = (id: string, payload: object) =>
        app.inject({
            method: 'POST',
            url: `/api/tools/${id}/run`,
            headers,
            payload,
        });
    assert.equal((await run('json', { input: '{}' })).statusCode, 200);
    assert.equal(await usage(), 1);
    for (const [id, payload] of [
        ['json', {}],
        ['json', { input: '{broken' }],
        ['network-dns-lookup', { input: '' }],
        ['everyday-image-resizer', {}],
        ['json', { input: '{}', options: { unsupported: 'value' } }],
    ] as const) {
        const response = await run(id, payload);
        assert.equal(response.statusCode, 400, response.body);
        assert.equal(await usage(), 1, id);
    }
    const mcp = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...headers, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'run_tool', arguments: { toolId: 'json', input: '' } },
        },
    });
    assert.equal(mcp.json().result.isError, true);
    assert.equal(await usage(), 1);
    const success = await run('uuid', {});
    assert.equal(success.statusCode, 200, success.body);
    assert.equal(success.json().usage.used, 2);
    assert.equal(await usage(), 2);
});

test('failed run reservations are released only from their original UTC day', (t) => {
    const repository = new MemoryIdentityRepository();
    let now = Date.UTC(2026, 9, 26, 23, 59, 59);
    t.mock.method(Date, 'now', () => now);
    const reservation = repository.consumeRun('test', null, 1);
    assert.equal(repository.consumeRun('test', null, 1).allowed, false);
    repository.releaseRun('test', reservation.day);
    assert.equal(repository.runUsage('test'), 0);
    const previous = repository.consumeRun('test', null, 1);
    now += 2000;
    assert.equal(repository.consumeRun('test', null, 1).allowed, true);
    repository.releaseRun('test', previous.day);
    assert.equal(repository.runUsage('test'), 1);
});

test('Pro inboxes forward captured webhooks with retries and keep a delivery log', async (t) => {
    const identities = new MemoryIdentityRepository();
    const sent: { url: string; method: string; headers: Record<string, string>; body?: string }[] =
        [];
    const answers = [503, 200];
    const app = buildApp({
        identityStore: identities,
        forwardDelays: [0, 10],
        forwardSend: async (url, _signal, options) => {
            sent.push({
                url,
                method: options.method,
                headers: options.headers,
                ...(options.requestBody !== undefined ? { body: options.requestBody } : {}),
            });
            return { status: answers.shift() ?? 200 };
        },
    });
    t.after(() => app.close());
    const owner = await signup(app, 'forwarder'),
        credential = await key(app, owner.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    const inbox = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public', headers })
    ).json();
    const forward = (url: string) =>
        app.inject({
            method: 'PUT',
            url: `/api/inboxes/${inbox.id}/forward`,
            headers,
            payload: { url },
        });
    assert.equal((await forward('https://example.com/hook')).statusCode, 402);
    await identities.setEntitlement(
        owner.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    assert.equal((await forward('http://127.0.0.1:3000/x')).statusCode, 400);
    assert.equal((await forward('https://localhost/x')).statusCode, 400);
    assert.equal((await forward('http://localhost:3000/hooks/x')).statusCode, 400);
    const saved = await forward('https://example.com/hook');
    assert.equal(saved.statusCode, 200);
    await app.inject({
        method: 'POST',
        url: `/hooks/${inbox.id}?event=paid`,
        headers: {
            'content-type': 'application/json',
            'stripe-signature': 't=1,v1=abc',
            cookie: 'secret=1',
        },
        payload: '{"paid":true}',
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sent.length, 2);
    assert.equal(sent[0]!.url, 'https://example.com/hook?event=paid');
    assert.equal(sent[0]!.method, 'POST');
    assert.equal(sent[0]!.body, '{"paid":true}');
    assert.equal(sent[0]!.headers['stripe-signature'], 't=1,v1=abc');
    assert.equal(sent[0]!.headers.cookie, undefined);
    assert.ok(sent[0]!.headers['x-kivel-request-id']);
    const log = (await app.inject({ url: `/api/inboxes/${inbox.id}/deliveries`, headers })).json()
        .deliveries;
    assert.equal(log.length, 1);
    assert.equal(log[0].status, 200);
    assert.equal(log[0].attempts, 2);
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/inboxes/${inbox.id}/forward`,
                headers,
            })
        ).statusCode,
        204,
    );
    await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sent.length, 2);
});

test('Pro proxy mocks pass unmatched calls through, never serve HTML, and record answers as routes', async (t) => {
    const identities = new MemoryIdentityRepository();
    const calls: string[] = [];
    const app = buildApp({
        identityStore: identities,
        mockProxySend: async (url, _signal, options = {}) => {
            calls.push(`${options.method} ${url} ${options.requestBody ?? ''}`);
            const html = url.includes('/page');
            return {
                url,
                status: html ? 200 : 201,
                headers: { 'content-type': html ? 'text/html' : 'application/json' },
                body: Buffer.from(html ? '<script>x</script>' : '{"real":true}'),
                truncated: false,
                address: '93.184.216.34',
                timings: { dnsMs: 1, responseMs: 1, totalMs: 2 },
            } as Awaited<ReturnType<typeof import('./public-network.js').publicRequest>>;
        },
    });
    t.after(() => app.close());
    const owner = await signup(app, 'proxier'),
        credential = await key(app, owner.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    const create = (proxy: object) =>
        app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            headers,
            payload: { name: 'Proxy', routes: [], proxy },
        });
    assert.equal((await create({ target: 'https://api.example.com' })).statusCode, 402);
    await identities.setEntitlement(
        owner.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    assert.equal((await create({ target: 'http://10.0.0.1/' })).statusCode, 400);
    const mock = (await create({ target: 'https://api.example.com/v1', record: true })).json();
    const first = await app.inject({
        method: 'POST',
        url: `/mock/${mock.id}/orders?x=1`,
        headers: { 'content-type': 'application/json' },
        payload: '{"a":1}',
    });
    assert.equal(first.statusCode, 201);
    assert.equal(first.headers['x-mock-proxied'], 'true');
    assert.equal(calls[0], 'POST https://api.example.com/v1/orders?x=1 {"a":1}');
    const page = await app.inject({ url: `/mock/${mock.id}/page` });
    assert.match(String(page.headers['content-type']), /octet-stream/);
    const stored = (await app.inject({ url: `/api/mocks/${mock.id}`, headers })).json();
    assert.deepEqual(
        stored.routes.map(
            (route: { method: string; path: string }) => `${route.method} ${route.path}`,
        ),
        ['POST /orders'],
    );
    const replay = await app.inject({ method: 'POST', url: `/mock/${mock.id}/orders` });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.headers['x-mock-proxied'], undefined);
    assert.equal(calls.length, 2);
});

test('forwarding and proxy mocks stop as soon as the owner’s paid plan ends', async (t) => {
    const identities = new MemoryIdentityRepository();
    let forwarded = 0,
        proxied = 0;
    const app = buildApp({
        identityStore: identities,
        forwardDelays: [0],
        forwardSend: async () => {
            forwarded++;
            return { status: 200 };
        },
        mockProxySend: async (url) => {
            proxied++;
            return {
                url,
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: Buffer.from('{}'),
                truncated: false,
                address: '93.184.216.34',
                timings: { dnsMs: 1, responseMs: 1, totalMs: 2 },
            } as Awaited<ReturnType<typeof import('./public-network.js').publicRequest>>;
        },
    });
    t.after(() => app.close());
    const owner = await signup(app, 'lapsing'),
        credential = await key(app, owner.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    await identities.setEntitlement(
        owner.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    const anonymous = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    assert.equal(
        (
            await app.inject({
                method: 'PUT',
                url: `/api/inboxes/${anonymous.id}/forward`,
                headers: { ...headers, 'x-resource-token': anonymous.inspectionToken },
                payload: { url: 'https://example.com/hook' },
            })
        ).statusCode,
        403,
    );
    const inbox = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public', headers })
    ).json();
    await app.inject({
        method: 'PUT',
        url: `/api/inboxes/${inbox.id}/forward`,
        headers,
        payload: { url: 'https://example.com/hook' },
    });
    const mock = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            headers,
            payload: { name: 'P', routes: [], proxy: { target: 'https://api.example.com' } },
        })
    ).json();
    await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'a' });
    assert.equal((await app.inject({ url: `/mock/${mock.id}/x` })).statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual([forwarded, proxied], [1, 1]);
    await identities.setEntitlement(
        owner.account.id,
        'pro',
        new Date(Date.now() - 1000).toISOString(),
    );
    await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'b' });
    assert.equal((await app.inject({ url: `/mock/${mock.id}/x` })).statusCode, 402);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual([forwarded, proxied], [1, 1]);
});

test('MCP calls made with a workspace key appear in its activity feed without their data', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const owner = await signup(app, 'watcher'),
        credential = await key(app, owner.cookie);
    const mcp = (name: string, args: object, auth = true) =>
        app.inject({
            method: 'POST',
            url: '/mcp',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...(auth ? { authorization: `Bearer ${credential.key}` } : {}),
            },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
    await mcp('run_tool', { toolId: 'json', input: '{"secret":"value"}' });
    await mcp('inspect_webhook_inbox', {
        id: '00000000-0000-4000-8000-000000000000',
        token: 'a'.repeat(43),
    });
    await mcp('run_tool', { toolId: 'json', input: '{}' }, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const feed = await app.inject({
        url: '/api/account/activity',
        headers: { origin, cookie: owner.cookie },
    });
    assert.equal(feed.statusCode, 200);
    const entries = feed.json().activity;
    assert.equal(entries.length, 2);
    assert.equal(entries[0].tool, 'inspect_webhook_inbox');
    assert.equal(entries[0].ok, false);
    assert.equal(entries[1].tool, 'run_tool');
    assert.equal(entries[1].ok, true);
    assert.equal(entries[1].keyId, credential.info.id);
    assert.ok(!JSON.stringify(entries).includes('secret'));
});

test('agent memory stores JSON per workspace within the plan allowance, over HTTP and MCP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const owner = await signup(app, 'rememberer'),
        credential = await key(app, owner.cookie),
        headers = { authorization: `Bearer ${credential.key}` };
    assert.equal(
        (await app.inject({ method: 'PUT', url: '/api/memory/p/k', payload: { value: 1 } }))
            .statusCode,
        401,
    );
    const put = (path: string, payload: object) =>
        app.inject({ method: 'PUT', url: `/api/memory/${path}`, headers, payload });
    assert.equal(
        (await put('project/deploys/last', { value: { sha: 'abc', ok: true } })).statusCode,
        200,
    );
    assert.equal((await put('bad space/k', { value: 1 })).statusCode, 400);
    assert.equal((await put('project/k', {})).statusCode, 400);
    assert.equal((await put('project/huge', { value: 'x'.repeat(300 * 1024) })).statusCode, 413);
    const read = await app.inject({ url: '/api/memory/project/deploys/last', headers });
    assert.deepEqual(read.json().value, { sha: 'abc', ok: true });
    const list = (await app.inject({ url: '/api/memory/project?prefix=deploys/', headers })).json();
    assert.equal(list.keys.length, 1);
    assert.equal(list.keys[0].value, undefined);
    assert.equal(list.limitBytes, 5 * 1024 * 1024);
    const value = 'y'.repeat(90 * 1024);
    for (let index = 0; index < 56; index++) {
        const fill = await put(`fill/k${index}`, { value });
        assert.equal(fill.statusCode, 200, fill.body);
    }
    const over = await put('fill/over', { value });
    assert.equal(over.statusCode, 402, over.body);
    assert.equal(over.json().limit, 'memory.bytes');
    assert.equal(over.json().max, list.limitBytes);
    const other = await signup(app, 'stranger'),
        otherKey = await key(app, other.cookie);
    assert.equal(
        (
            await app.inject({
                url: '/api/memory/project/deploys/last',
                headers: { authorization: `Bearer ${otherKey.key}` },
            })
        ).statusCode,
        404,
    );
    const mcp = async (name: string, args: object) =>
        JSON.parse(
            (
                await app.inject({
                    method: 'POST',
                    url: '/mcp',
                    headers: {
                        ...headers,
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                    },
                    payload: {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name, arguments: args },
                    },
                })
            ).json().result.content[0].text,
        );
    await mcp('memory_set', { namespace: 'agent', key: 'notes/todo', value: ['ship email'] });
    assert.deepEqual((await mcp('memory_get', { namespace: 'agent', key: 'notes/todo' })).value, [
        'ship email',
    ]);
    assert.equal(
        (await mcp('memory_delete', { namespace: 'agent', key: 'notes/todo' })).deleted,
        true,
    );
    assert.ok((await mcp('memory_get', { namespace: 'agent', key: 'notes/todo' })).error);
});

test('temporary inbox domains cannot sign up, and short but valid passwords can', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const register = (username: string, email: string, password = 'eightchr') =>
        app.inject({
            method: 'POST',
            url: '/api/auth/register',
            headers: { origin: 'http://localhost:3000' },
            payload: { username, email, password },
        });
    for (const email of [
        'someone@mailinator.com',
        'agent@socketspace.xyz',
        'x@sub.socketspace.xyz',
    ]) {
        const response = await register(`temp-${email.length}`, email);
        assert.equal(response.statusCode, 400, email);
        assert.match(response.json().error, /Temporary inbox/);
    }
    assert.equal((await register('short-pass', 'short@example.test', 'seven77')).statusCode, 400);
    assert.equal((await register('eight-pass', 'eight@example.test')).statusCode, 201);
});

test('developer tools share SDK, CLI and MCP options without retaining scanner input', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const owner = await signup(app, 'developer-tools-user'),
        credential = await key(app, owner.cookie);
    const fetcher: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        const response = await app.inject({
            method: init?.method as 'POST',
            url: target.pathname + target.search,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            ...(init?.body !== undefined ? { payload: String(init.body) } : {}),
        });
        return new Response(response.body, {
            status: response.statusCode,
            headers: Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [key, String(value)]),
            ),
        });
    };
    const client = new Kivel({ baseUrl: origin, apiKey: credential.key, fetch: fetcher });
    const identity = JSON.parse(
        (await client.run('developer-fake-identity-generator', '', { locale: 'fr-FR', count: '2' }))
            .output,
    );
    assert.equal(identity.count, 2);
    assert.equal(identity.identities[0].address.country, 'FR');
    const phone = (await command(
        client,
        ['run', 'developer-phone-number-validator', '--options', '{"country":"GB"}'],
        Buffer.from('020 7946 0958'),
    )) as { output: string };
    assert.equal(JSON.parse(phone.output).e164, '+442079460958');
    const headers = {
        authorization: `Bearer ${credential.key}`,
        accept: 'application/json, text/event-stream',
    };
    const rpc = async (name: string, args: object) => {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers,
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().result.isError, false, response.body);
        return JSON.parse(response.json().result.content[0].text);
    };
    const schema = await rpc('run_tool', {
        toolId: 'developer-json-schema-validator',
        input: '4',
        options: { schema: '{"type":"integer"}' },
    });
    assert.equal(JSON.parse(schema.output).valid, true);
    const description = await rpc('describe_tool', { toolId: 'developer-json-schema-validator' });
    assert.ok(JSON.stringify(description).includes('schema'));
    const search = await rpc('search_tools', { query: 'timezone' });
    assert.ok(JSON.stringify(search).includes('developer-timezone-converter'));
    const secret = 'ghp_' + 'b'.repeat(36);
    const scan = await rpc('run_tool', { toolId: 'developer-secret-scanner', input: secret });
    assert.ok(!JSON.stringify(scan).includes(secret));
    const activity = await app.inject({
        url: '/api/account/activity',
        headers: { origin, cookie: owner.cookie },
    });
    assert.equal(activity.statusCode, 200);
    assert.ok(!activity.body.includes(secret));
    assert.ok(activity.json().activity.some((entry: any) => entry.tool === 'run_tool'));
});
