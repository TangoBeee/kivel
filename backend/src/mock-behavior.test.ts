import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';
import { RateLimiter } from './rate-limit.js';
import { validateMock } from './resource-routes.js';
import { validateMcp } from './mcp.js';
import { parseSse } from '@kivel/tools/sse';
const route = {
    method: 'GET',
    path: '/events',
    status: 200,
    body: 'one\ntwo',
    headers: {},
    delayMs: 0,
};

test('configured mock quotas start only after private access and reset as a shared fixed window', async (t) => {
    let now = Date.now();
    const app = buildApp({ rateLimiter: new RateLimiter(() => now) });
    t.after(() => app.close());
    const created = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks',
            payload: { name: 'Quota', routes: [{ ...route, requestsPerMinute: 1 }] },
        })
    ).json();
    const url = `/mock/${created.id}/events`,
        headers = { 'x-access-token': created.accessToken };
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.equal((await app.inject({ url, headers })).statusCode, 200);
    const limited = await app.inject({ url, headers });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '60');
    now += 60000;
    assert.equal((await app.inject({ url, headers })).statusCode, 200);
});
test('SSE and text mocks deliver real bounded streams behind the same private access controls', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const mode of ['sse', 'text']) {
        const created = (
            await app.inject({
                method: 'POST',
                url: '/api/mocks',
                payload: {
                    name: 'Stream',
                    routes: [{ ...route, stream: { mode, intervalMs: 20 } }],
                },
            })
        ).json();
        assert.equal((await app.inject(`/mock/${created.id}/events`)).statusCode, 404);
        const started = performance.now();
        const response = await app.inject({
            url: `/mock/${created.id}/events`,
            headers: { 'x-access-token': created.accessToken },
        });
        assert.equal(response.statusCode, 200);
        assert.ok(performance.now() - started >= 15);
        if (mode === 'sse') {
            assert.match(String(response.headers['content-type']), /^text\/event-stream/);
            assert.deepEqual(
                parseSse(response.body).events.map((event) => event.data),
                ['one', 'two'],
            );
        } else assert.equal(response.body, 'one\ntwo');
        assert.equal(
            (
                await app.inject({
                    method: 'HEAD',
                    url: `/mock/${created.id}/events`,
                    headers: { 'x-access-token': created.accessToken },
                })
            ).body,
            '',
        );
    }
});
test('stream shutdown cancels pending delivery without waiting for its next timer', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const created = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: {
                name: 'Cancel stream',
                routes: [{ ...route, stream: { mode: 'sse', intervalMs: 1000 } }],
            },
        })
    ).json();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${address}/mock/${created.id}/events`);
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    const started = performance.now();
    await app.close();
    assert.ok(performance.now() - started < 900);
    await reader.cancel().catch(() => {});
});
test('stream and quota validation rejects excessive duration, chunks, non-GET behavior and invalid settings', () => {
    for (const patch of [
        { stream: { mode: 'sse', intervalMs: 0 } },
        { stream: { mode: 'sse', intervalMs: 1000 }, body: Array(20).fill('x').join('\n') },
        { stream: { mode: 'sse', intervalMs: 10 }, method: 'POST' },
        { stream: { mode: 'text', intervalMs: 10 }, body: 'a'.repeat(4097) },
        { requestsPerMinute: 0 },
        { requestsPerMinute: 121 },
    ])
        assert.throws(() => validateMock({ name: 'Invalid', routes: [{ ...route, ...patch }] }));
    assert.throws(() =>
        validateMcp({
            name: 'MCP',
            tools: [
                {
                    name: 'fail',
                    description: 'Failure',
                    inputSchema: { type: 'object', properties: {} },
                    response: 'Failure',
                    isError: true,
                    delayMs: 2001,
                },
            ],
        }),
    );
});
test('SSE parsing handles BOM, CRLF, multiple data lines, IDs, retry hints, comments and partial tails', () => {
    const result = parseSse(
        '\uFEFF: heartbeat\r\nretry: 2500\r\nid: first\r\nevent: update\r\ndata: one\r\ndata: two\r\n\r\nid: invalid\0id\ndata: next\n\ndata: unfinished',
    );
    assert.deepEqual(result.events, [
        { event: 'update', data: 'one\ntwo', id: 'first' },
        { event: 'message', data: 'next', id: 'first' },
    ]);
    assert.equal(result.retryMs, 2500);
    assert.equal(result.comments, 1);
    assert.equal(parseSse('data: 1\n\ndata: 2\n\n', 1).eventLimitReached, true);
});

test('mock conditions select before fallbacks and templates escape JSON request values', async (t) => {
    const { mockPreset } = await import('@kivel/tools/mock-presets');
    const app = buildApp();
    t.after(() => app.close());
    for (const id of [
        'mock-apis-authentication-mock',
        'mock-apis-graphql-mock',
        'mock-apis-mock-response-templates',
        'mock-apis-third-party-api-simulator',
        'mock-apis-payment-api-sandbox',
    ]) {
        const result = await app.inject({
            method: 'POST',
            url: '/api/mocks',
            payload: { name: id, routes: mockPreset(id) },
        });
        assert.equal(result.statusCode, 201, result.body);
        const created = result.json(),
            base = `/mock/${created.id}`,
            headers = { 'x-access-token': created.accessToken };
        if (id.includes('authentication')) {
            assert.equal((await app.inject({ url: base + '/protected', headers })).statusCode, 401);
            assert.equal(
                (
                    await app.inject({
                        url: base + '/protected',
                        headers: { ...headers, authorization: 'Bearer wrong' },
                    })
                ).statusCode,
                401,
            );
            assert.equal(
                (
                    await app.inject({
                        url: base + '/protected',
                        headers: { ...headers, authorization: 'Bearer test-token' },
                    })
                ).statusCode,
                200,
            );
        } else if (id.includes('graphql')) {
            const response = await app.inject({
                method: 'POST',
                url: base + '/graphql',
                headers,
                payload: { operationName: 'GetViewer', query: 'query GetViewer { viewer { id } }' },
            });
            assert.equal(response.json().data.viewer.id, 'user_test_1');
        } else if (id.includes('templates')) {
            const name = 'Ada"\n, "injected":true';
            const response = await app.inject({
                url: base + '/users/42?name=' + encodeURIComponent(name),
                headers,
            });
            assert.deepEqual(response.json(), { id: '42', name });
            const emptyBody = await app.inject({
                url: base + '/users/42?name=Ada',
                headers: { ...headers, 'content-type': 'application/json' },
            });
            assert.equal(emptyBody.statusCode, 200, emptyBody.body);
            const post = await app.inject({
                method: 'POST',
                url: base + '/greet',
                headers,
                payload: { name: 'Grace' },
            });
            assert.deepEqual(post.json(), { message: 'Hello Grace' });
        } else if (id.includes('payment')) {
            assert.equal(
                (
                    await app.inject({
                        method: 'POST',
                        url: base + '/payments/decline',
                        headers,
                        payload: {},
                    })
                ).statusCode,
                402,
            );
        }
    }
    assert.throws(() =>
        validateMock({
            name: 'bad',
            routes: [{ ...route, condition: { source: 'body', key: 'constructor', value: 'x' } }],
        }),
    );
    assert.throws(() =>
        validateMock({
            name: 'bad',
            routes: [{ ...route, stream: { mode: 'text', intervalMs: 10 }, template: true }],
        }),
    );
});

test('fake data placeholders render fresh JSON-safe sample values', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const mock = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: {
                name: 'Fake',
                routes: [
                    {
                        method: 'GET',
                        path: '/users/:id',
                        status: 200,
                        template: true,
                        body: JSON.stringify({
                            id: '{{path.id}}',
                            name: '{{fake.name}}',
                            email: '{{fake.email}}',
                            uuid: '{{fake.uuid}}',
                            price: '{{fake.price}}',
                            missing: '{{fake.nothing}}',
                        }),
                    },
                ],
            },
        })
    ).json();
    const first = (await app.inject({ url: `/mock/${mock.id}/users/7` })).json();
    assert.equal(first.id, '7');
    assert.match(first.name, /^\S+ \S+$/);
    assert.match(first.email, /^[a-z]+\.[a-z]+@example\.com$/);
    assert.match(
        first.uuid,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.match(first.price, /^\d+\.\d{2}$/);
    assert.equal(first.missing, '');
    const uuids = new Set();
    for (let index = 0; index < 5; index++)
        uuids.add((await app.inject({ url: `/mock/${mock.id}/users/7` })).json().uuid);
    assert.equal(uuids.size, 5);
});

test('routes can fail a share of calls on purpose and reject impossible rates', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const create = (extra: object) =>
        app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: {
                name: 'Chaos',
                routes: [{ method: 'GET', path: '/pay', status: 200, body: '{}', ...extra }],
            },
        });
    assert.equal((await create({ failureRate: 150 })).statusCode, 400);
    assert.equal((await create({ failureRate: 10, failureStatus: 302 })).statusCode, 400);
    const always = (await create({ failureRate: 100, failureStatus: 502 })).json();
    const failed = await app.inject({ url: `/mock/${always.id}/pay` });
    assert.equal(failed.statusCode, 502);
    assert.equal(failed.headers['x-mock-simulated-failure'], 'true');
    const never = (await create({ failureRate: 0 })).json();
    assert.equal((await app.inject({ url: `/mock/${never.id}/pay` })).statusCode, 200);
});
