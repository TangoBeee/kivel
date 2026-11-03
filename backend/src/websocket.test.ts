import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import { buildApp } from './app.js';
import { ResourceStore } from './resources.js';
import { captureWebSocket, testWebSocket } from './websocket-tester.js';

const payload = {
    name: 'Live updates',
    routes: [],
    websocket: { welcome: ['ready'], replies: [{ match: 'ping', reply: 'pong' }] },
};

test('WebSocket mocks script, echo, close and capture traffic through the existing mock routes', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const config = {
        ...payload,
        websocket: { ...payload.websocket, closeAfter: { code: 4001, reason: 'Reconnect' } },
    };
    const response = await app.inject({
        method: 'POST',
        url: '/api/mocks?visibility=public',
        payload: config,
    });
    assert.equal(response.statusCode, 201, response.body);
    const mock = response.json();
    assert.equal(new URL(mock.endpointUrl).pathname, `/ws/${mock.id}`);
    const url = new URL(origin.replace('http', 'ws') + `/ws/${mock.id}`);
    // A host with no DNS entry works only because the connection uses the pinned address.
    url.hostname = 'pinned.invalid';
    const result = await captureWebSocket(
        url,
        { address: '127.0.0.1', family: 4 },
        AbortSignal.timeout(5000),
        {
            payload: Buffer.from('ping'),
            protocol: 'fixture.v1',
        },
    );
    assert.equal(result.status, 101);
    assert.equal(result.protocol, 'fixture.v1');
    assert.deepEqual(
        result.messages.map((message) => message.data),
        ['ready', 'pong'],
    );
    assert.deepEqual(result.close, { code: 4001, reason: 'Reconnect' });

    const headers = { authorization: `Bearer ${mock.managementToken}` };
    assert.equal((await app.inject(`/api/mocks/${mock.id}/calls`)).statusCode, 404);
    const path = `/api/mocks/${mock.id}`;
    const { calls } = (await app.inject({ url: path + '/calls', headers })).json();
    assert.deepEqual(
        calls.slice(0, 4).map((call: { method: string }) => call.method),
        ['WS connect', 'WS send', 'WS receive', 'WS send'],
    );
    assert.equal(calls[3].bodyPreview, 'pong');
    assert.equal(
        (
            await app.inject({
                method: 'PUT',
                url: path,
                headers,
                payload: {
                    ...payload,
                    websocket: { closeAfter: { code: 1000 } },
                },
            })
        ).statusCode,
        204,
    );
    const binary = await captureWebSocket(
        url,
        { address: '127.0.0.1', family: 4 },
        AbortSignal.timeout(5000),
        {
            payload: Buffer.from([0, 0xff]),
            binary: true,
        },
    );
    assert.deepEqual(
        binary.messages.map(({ encoding, data }) => ({ encoding, data })),
        [{ encoding: 'base64', data: 'AP8=' }],
    );
    assert.equal((await app.inject(`/mock/${mock.id}`)).statusCode, 404);
    assert.equal((await app.inject(`/ws/${mock.id}`)).statusCode, 426);
});

test('private WebSocket mocks isolate callers and invalidate existing connections on rotation and expiry', async (t) => {
    let now = Date.now();
    const app = buildApp({ resourceStore: new ResourceStore(() => now) });
    t.after(() => app.close());
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const create = async () =>
        (await app.inject({ method: 'POST', url: '/api/mocks', payload })).json();
    const mock = await create(),
        other = await create();
    const url = new URL(origin.replace('http', 'ws') + `/ws/${mock.id}`);
    for (const [headers, query, status] of [
        [{}, '', 404],
        [{ 'X-Access-Token': other.accessToken }, '', 404],
        [{ Authorization: `Bearer ${mock.managementToken}` }, '', 404],
        [{}, `?accessToken=${mock.accessToken}`, 400],
    ] as const) {
        const client = new WebSocket(url.toString() + query, { headers });
        await assert.rejects(
            once(client, 'open'),
            new RegExp(`Unexpected server response: ${status}`),
        );
    }
    async function connect(token: string) {
        const client = new WebSocket(url, { headers: { 'X-Access-Token': token } });
        await once(client, 'open');
        return client;
    }
    const first = await connect(mock.accessToken);
    const closed = once(first, 'close');
    const rotated = (
        await app.inject({
            method: 'POST',
            url: `/api/mocks/${mock.id}/sharing`,
            headers: { authorization: `Bearer ${mock.managementToken}` },
            payload: { visibility: 'private' },
        })
    ).json();
    first.send('must not echo');
    assert.equal((await closed)[0], 1008);
    const second = await connect(rotated.accessToken);
    const expired = once(second, 'close');
    now += 3_600_001;
    second.send('must not echo either');
    assert.equal((await expired)[0], 1008);
    assert.equal(
        (
            await app.inject({
                url: `/api/mocks/${mock.id}/calls`,
                headers: { authorization: `Bearer ${mock.managementToken}` },
            })
        ).statusCode,
        404,
    );
});

test('WebSocket configuration and message sizes are bounded and the tester cannot connect to private URLs or follow redirects', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    app.get('/redirect', (_request, reply) => reply.redirect('/health'));
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    for (const websocket of [
        { welcome: ['😀'.repeat(1025)] },
        { delayMs: 2001 },
        { closeAfter: { code: 1006 } },
        {
            replies: [
                { match: 'same', reply: 'a' },
                { match: 'same', reply: 'b' },
            ],
        },
    ]) {
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/mocks',
                    payload: { ...payload, websocket },
                })
            ).statusCode,
            400,
        );
    }
    const mock = (
        await app.inject({ method: 'POST', url: '/api/mocks?visibility=public', payload })
    ).json();
    const client = new WebSocket(origin.replace('http', 'ws') + `/ws/${mock.id}`);
    await once(client, 'open');
    const closed = once(client, 'close');
    client.send('x'.repeat(16 * 1024 + 1));
    assert.equal((await closed)[0], 1009);

    const signal = AbortSignal.timeout(5000);
    for (const input of [
        'ws://127.0.0.1/',
        'ws://[::ffff:127.0.0.1]/',
        'ws://localhost/',
        'ws://169.254.169.254/',
    ])
        await assert.rejects(testWebSocket(input, {}, signal), /Private|reserved/);
    await assert.rejects(
        testWebSocket('ws://public.example.com', { secret: 'x'.repeat(43) }, signal),
        /WSS/,
    );
    const redirect = await captureWebSocket(
        new URL(origin.replace('http', 'ws') + '/redirect'),
        {
            address: '127.0.0.1',
            family: 4,
        },
        signal,
    );
    assert.equal(redirect.connected, false);
    assert.equal(redirect.status, 302);
});
