import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { ResourceStore, RESOURCE_TTL_MS } from './resources.js';
const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
};
const config = {
    name: 'Test MCP',
    tools: [
        {
            name: 'greet',
            description: 'A static greeting.',
            inputSchema: {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            },
            response: 'Hello!',
            isError: false,
        },
    ],
};
const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
    },
};
const rpc = (method: string, params: object = {}) => ({ jsonrpc: '2.0', id: 2, method, params });

test('MCP transport negotiates versions, rejects unsafe origins, and handles notifications and parse errors', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const initialized = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers,
        payload: initialize,
    });
    assert.equal(initialized.statusCode, 200);
    assert.equal(initialized.json().result.protocolVersion, '2025-11-25');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers,
                payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
            })
        ).statusCode,
        202,
    );
    assert.equal((await app.inject({ url: '/mcp' })).statusCode, 405);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers: { ...headers, origin: 'https://evil.example' },
                payload: '{bad',
            })
        ).statusCode,
        403,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers: { 'content-type': 'application/json' },
                payload: initialize,
            })
        ).statusCode,
        406,
    );
    const invalidJson = await app.inject({ method: 'POST', url: '/mcp', headers, payload: '{bad' });
    assert.equal(invalidJson.statusCode, 400);
    assert.equal(invalidJson.json().error.code, -32700);
    const missingMethod = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers,
        payload: rpc('not/a-method'),
    });
    assert.equal(missingMethod.json().error.code, -32601);
});

test('platform MCP creates, inspects, and deletes the same resources as HTTP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const call = async (name: string, args: object = {}) =>
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers,
                payload: rpc('tools/call', { name, arguments: args }),
            })
        ).json().result;
    const tools = (
        await app.inject({ method: 'POST', url: '/mcp', headers, payload: rpc('tools/list') })
    ).json().result.tools;
    assert.equal(tools.length, 30);
    assert.equal(
        tools.find((tool: { name: string }) => tool.name === 'delete_mock_api').annotations
            .destructiveHint,
        true,
    );
    const inbox = JSON.parse(
        (await call('create_webhook_inbox', { visibility: 'public' })).content[0].text,
    );
    await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'sample' });
    const inspected = JSON.parse(
        (await call('inspect_webhook_inbox', { id: inbox.id, token: inbox.inspectionToken }))
            .content[0].text,
    );
    assert.equal(inspected.requests[0].body, 'sample');
    assert.equal(
        (await call('delete_webhook_inbox', { id: inbox.id, token: inbox.inspectionToken }))
            .isError,
        false,
    );
    const mock = JSON.parse(
        (
            await call('create_mock_api', {
                visibility: 'public',
                name: 'MCP API',
                routes: [
                    {
                        method: 'GET',
                        path: '/hello',
                        status: 200,
                        body: 'hello',
                        headers: { 'content-type': 'text/plain' },
                    },
                ],
            })
        ).content[0].text,
    );
    assert.equal((await app.inject({ url: `/mock/${mock.id}/hello` })).body, 'hello');
    assert.equal(
        (await call('inspect_mock_api', { id: mock.id, token: 'x'.repeat(43) })).isError,
        true,
    );
    const file = JSON.parse(
        (
            await call('upload_temporary_file', {
                visibility: 'public',
                name: 'fixture.txt',
                base64: Buffer.from('MCP fixture').toString('base64'),
            })
        ).content[0].text,
    );
    assert.equal((await app.inject({ url: `/files/${file.id}` })).body, 'MCP fixture');
    assert.equal(
        (await call('delete_temporary_file', { id: file.id, token: file.managementToken })).isError,
        false,
    );
});

test('mock MCP servers validate arguments, return configured results, support updates and expire', async (t) => {
    let now = 1000;
    const app = buildApp({ resourceStore: new ResourceStore(() => now) });
    t.after(() => app.close());
    const created = await app.inject({
        method: 'POST',
        url: '/api/mcp-servers?visibility=public',
        payload: config,
    });
    assert.equal(created.statusCode, 201);
    const server = created.json();
    const url = `/mcp/mock/${server.id}`;
    const list = (
        await app.inject({ method: 'POST', url, headers, payload: rpc('tools/list') })
    ).json();
    assert.equal(list.result.tools[0].name, 'greet');
    assert.equal(list.result.tools[0].response, undefined);
    const call = (values: object) =>
        app.inject({
            method: 'POST',
            url,
            headers,
            payload: rpc('tools/call', { name: 'greet', arguments: values }),
        });
    assert.equal((await call({ name: 'Ada' })).json().result.content[0].text, 'Hello!');
    assert.equal((await call({ name: 42 })).json().error.code, -32602);
    assert.equal((await call({ name: 'Ada', extra: true })).json().error.code, -32602);
    assert.equal((await app.inject({ url: `/api/mcp-servers/${server.id}` })).statusCode, 404);
    const update = await app.inject({
        method: 'PUT',
        url: `/api/mcp-servers/${server.id}`,
        headers: { authorization: `Bearer ${server.managementToken}` },
        payload: {
            ...config,
            tools: [{ ...config.tools[0], response: 'Simulated failure', isError: true }],
        },
    });
    assert.equal(update.statusCode, 204);
    assert.equal((await call({ name: 'Ada' })).json().result.isError, true);
    now += RESOURCE_TTL_MS;
    assert.equal((await call({ name: 'Ada' })).statusCode, 404);
});

test('MCP creation shares HTTP creation quotas and configuration rejects executable or excessive schemas', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (let index = 0; index < 10; index++)
        await app.inject({
            method: 'POST',
            url: '/mcp',
            headers,
            payload: rpc('tools/call', { name: 'create_webhook_inbox' }),
        });
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/mcp-servers?visibility=public',
                payload: config,
            })
        ).statusCode,
        429,
    );
    const other = buildApp();
    t.after(() => other.close());
    assert.equal(
        (
            await other.inject({
                method: 'POST',
                url: '/api/mcp-servers?visibility=public',
                payload: {
                    ...config,
                    tools: [
                        {
                            ...config.tools[0],
                            inputSchema: {
                                type: 'object',
                                properties: { nested: { type: 'object' } },
                            },
                        },
                    ],
                },
            })
        ).statusCode,
        400,
    );
});

test('the official MCP client can initialize, discover tools and call both server types', async (t) => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } =
        await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const app = buildApp();
    t.after(() => app.close());
    const transportFor = (url: string) =>
        new StreamableHTTPClientTransport(new URL(url, 'http://localhost:3000'), {
            fetch: async (input, options) => {
                const request = new Request(input, options);
                const body =
                    request.method === 'GET' || request.method === 'HEAD'
                        ? ''
                        : await request.text();
                const response = await app.inject({
                    method: request.method as import('fastify').HTTPMethods,
                    url: new URL(request.url).pathname,
                    headers: Object.fromEntries(request.headers.entries()),
                    ...(body ? { payload: body } : {}),
                });
                const headers = Object.fromEntries(
                    Object.entries(response.headers)
                        .filter((entry) => entry[1] !== undefined)
                        .map(([key, value]) => [
                            key,
                            Array.isArray(value) ? value.join(', ') : String(value),
                        ]),
                );
                return new Response(response.body || null, {
                    status: response.statusCode,
                    headers,
                });
            },
        });
    const platform = new Client({ name: 'compatibility-test', version: '1.0' });
    t.after(() => platform.close());
    await platform.connect(transportFor('/mcp'));
    assert.equal((await platform.listTools()).tools.length, 30);
    const call = await platform.callTool({ name: 'create_webhook_inbox', arguments: {} });
    assert.equal(call.isError, false);
    const created = (
        await app.inject({
            method: 'POST',
            url: '/api/mcp-servers?visibility=public',
            payload: config,
        })
    ).json();
    const mock = new Client({ name: 'mock-test', version: '1.0' });
    t.after(() => mock.close());
    await mock.connect(transportFor(`/mcp/mock/${created.id}`));
    assert.equal((await mock.listTools()).tools[0]?.name, 'greet');
    const greeting = await mock.callTool({ name: 'greet', arguments: { name: 'Ada' } });
    assert.deepEqual(greeting.content, [{ type: 'text', text: 'Hello!' }]);
});

test('MCP rejects undeclared arguments and query-string parse errors stay JSON-RPC', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const unexpected = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers,
        payload: rpc('tools/call', {
            name: 'create_webhook_inbox',
            arguments: { unexpected: true },
        }),
    });
    assert.equal(unexpected.json().error.code, -32602);
    const malformed = await app.inject({
        method: 'POST',
        url: '/mcp?client=test',
        headers,
        payload: '{bad',
    });
    assert.equal(malformed.json().error.code, -32700);
    assert.equal(malformed.headers['x-robots-tag'], 'noindex, nofollow, nosnippet');
});

test(
    'large MCP bodies are bounded before parsing and aborted uploads release capacity',
    { timeout: 8000 },
    async (t) => {
        const { request } = await import('node:http');
        const app = buildApp();
        const clients: ReturnType<typeof request>[] = [];
        t.after(async () => {
            for (const client of clients) client.destroy();
            await app.close();
        });
        let started = 0,
            aborted = 0;
        let uploaded!: () => void, released!: () => void;
        const waiting = new Promise<void>((resolve) => {
                uploaded = resolve;
            }),
            finished = new Promise<void>((resolve) => {
                released = resolve;
            });
        app.addHook('preParsing', async (req) => {
            if (req.url === '/mcp' && ++started === 4) uploaded();
        });
        app.addHook('onRequestAbort', async (_request) => {
            if (++aborted === 4) released();
        });
        const origin = await app.listen({ host: '127.0.0.1', port: 0 });
        for (let index = 0; index < 4; index++) {
            const client = request(`${origin}/mcp`, {
                method: 'POST',
                headers: { ...headers, 'content-length': '1000' },
            });
            client.on('error', () => {});
            clients.push(client);
            client.write('{"');
        }
        await waiting;
        const rejected = await fetch(`${origin}/mcp`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        assert.equal(rejected.status, 503);
        assert.equal(rejected.headers.get('retry-after'), '2');
        await rejected.text();
        for (const client of clients) client.destroy();
        await finished;
        const recovered = await fetch(`${origin}/mcp`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        });
        assert.equal(recovered.status, 200);
        assert.ok(
            ((await recovered.json()) as { result: { tools: unknown[] } }).result.tools.length > 0,
        );
    },
);

test('agents can block on a webhook over HTTP and MCP, and search utility tools', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inbox = (await app.inject({ method: 'POST', url: '/api/inboxes' })).json();
    const auth = { authorization: `Bearer ${inbox.inspectionToken}` };
    const waiting = app.inject({
        url: `/api/inboxes/${inbox.id}/wait?timeoutSeconds=5`,
        headers: auth,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const hook = await app.inject({
        method: 'POST',
        url: `/hooks/${inbox.id}`,
        headers: { 'x-access-token': inbox.accessToken, 'content-type': 'application/json' },
        payload: { event: 'paid' },
    });
    assert.equal(hook.statusCode, 200);
    const arrived = (await waiting).json();
    assert.equal(arrived.timedOut, false);
    assert.equal(arrived.requests.length, 1);
    assert.equal(JSON.parse(arrived.requests[0].body).event, 'paid');
    const after = arrived.requests[0].id;
    const idle = await app.inject({
        url: `/api/inboxes/${inbox.id}/wait?timeoutSeconds=1&after=${after}`,
        headers: auth,
    });
    assert.deepEqual(idle.json(), { timedOut: true, requests: [] });
    assert.equal(
        (
            await app.inject({
                url: `/api/inboxes/${inbox.id}/wait?timeoutSeconds=31`,
                headers: auth,
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (await app.inject({ url: `/api/inboxes/${inbox.id}/wait`, headers: {} })).statusCode,
        404,
    );

    const call = (name: string, args: object) =>
        app.inject({
            method: 'POST',
            url: '/mcp',
            headers,
            payload: rpc('tools/call', { name, arguments: args }),
        });
    const listed = (
        await app.inject({ method: 'POST', url: '/mcp', headers, payload: rpc('tools/list') })
    )
        .json()
        .result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(listed.includes('wait_for_webhook') && listed.includes('search_tools'));
    const mcpWait = call('wait_for_webhook', {
        id: inbox.id,
        token: inbox.inspectionToken,
        after,
        timeoutSeconds: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await app.inject({
        method: 'POST',
        url: `/hooks/${inbox.id}`,
        headers: { 'x-access-token': inbox.accessToken },
        payload: 'second',
    });
    const second = JSON.parse((await mcpWait).json().result.content[0].text);
    assert.equal(second.requests.length, 1);
    assert.equal(second.requests[0].body, 'second');
    const found = JSON.parse(
        (await call('search_tools', { query: 'base64' })).json().result.content[0].text,
    );
    assert.ok(found.tools.some((tool: { id: string }) => tool.id === 'base64'));
    assert.equal(
        JSON.parse(
            (await call('search_tools', { query: 'zzzz-nothing' })).json().result.content[0].text,
        ).tools.length,
        0,
    );
});

test('webhook inboxes answer with a custom response that cannot become HTML or set cookies', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inbox = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    const auth = { authorization: `Bearer ${inbox.inspectionToken}` };
    const put = (payload: object) =>
        app.inject({
            method: 'PUT',
            url: `/api/inboxes/${inbox.id}/response`,
            headers: auth,
            payload,
        });
    assert.equal((await put({ contentType: 'text/html', body: '<b>x</b>' })).statusCode, 400);
    assert.equal((await put({ headers: { 'set-cookie': 'a=b' } })).statusCode, 400);
    assert.equal((await put({ status: 302 })).statusCode, 200);
    assert.equal((await put({ status: 99 })).statusCode, 400);
    assert.equal((await put({ delayMs: 6000 })).statusCode, 400);
    const saved = await put({
        status: 202,
        contentType: 'text/plain',
        body: 'accepted',
        headers: { 'X-Test': 'yes' },
    });
    assert.equal(saved.statusCode, 200);
    const hook = await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'hi' });
    assert.equal(hook.statusCode, 202);
    assert.equal(hook.body, 'accepted');
    assert.equal(hook.headers['x-test'], 'yes');
    assert.match(String(hook.headers['content-type']), /^text\/plain/);
    assert.ok(hook.headers['x-webhook-request-id']);
    const head = await app.inject({ method: 'HEAD', url: `/hooks/${inbox.id}` });
    assert.equal(head.statusCode, 202);
    assert.equal(
        (await app.inject({ url: `/api/inboxes/${inbox.id}/requests`, headers: auth })).json()
            .requests.length,
        2,
    );
    assert.equal(
        (
            await app.inject({
                method: 'PUT',
                url: `/api/inboxes/${inbox.id}/response`,
                payload: { status: 200 },
            })
        ).statusCode,
        404,
    );
    const reset = await app.inject({
        method: 'DELETE',
        url: `/api/inboxes/${inbox.id}/response`,
        headers: auth,
    });
    assert.equal(reset.statusCode, 204);
    const plain = await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'x' });
    assert.equal(plain.statusCode, 200);
    assert.equal(plain.json().received, true);

    const call = (args: object) =>
        app.inject({
            method: 'POST',
            url: '/mcp',
            headers,
            payload: rpc('tools/call', { name: 'set_webhook_response', arguments: args }),
        });
    const viaMcp = (
        await call({ id: inbox.id, token: inbox.inspectionToken, status: 500, body: '{}' })
    ).json().result;
    assert.notEqual(viaMcp.isError, true);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'y' })).statusCode,
        500,
    );
    const rejected = (
        await call({ id: inbox.id, token: inbox.inspectionToken, contentType: 'text/html' })
    ).json();
    assert.ok(rejected.error || rejected.result.isError);
});

test('mock APIs keep a log of recent calls for their owner, over HTTP and MCP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const mock = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: {
                name: 'Log',
                routes: [{ method: 'POST', path: '/orders', status: 201, body: '{"ok":true}' }],
            },
        })
    ).json();
    await app.inject({
        method: 'POST',
        url: `/mock/${mock.id}/orders?debug=1`,
        headers: { 'content-type': 'application/json', 'user-agent': 'test-agent' },
        payload: '{"item":"book"}',
    });
    await app.inject({ url: `/mock/${mock.id}/missing` });
    const calls = await app.inject({
        url: `/api/mocks/${mock.id}/calls`,
        headers: { 'x-resource-token': mock.managementToken },
    });
    assert.equal(calls.statusCode, 200);
    const [first, second] = calls.json().calls;
    assert.equal(first.method, 'POST');
    assert.equal(first.path, '/orders');
    assert.equal(first.status, 201);
    assert.equal(first.query.debug, '1');
    assert.equal(first.bodyPreview, '{"item":"book"}');
    assert.equal(first.userAgent, 'test-agent');
    assert.equal(second.status, 404);
    assert.equal((await app.inject({ url: `/api/mocks/${mock.id}/calls` })).statusCode, 404);
    const inspected = JSON.parse(
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers,
                payload: rpc('tools/call', {
                    name: 'inspect_mock_api',
                    arguments: { id: mock.id, token: mock.managementToken },
                }),
            })
        ).json().result.content[0].text,
    );
    assert.equal(inspected.recentCalls.length, 2);
});

test('resource_request reads, lists and deletes resources over MCP', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const inbox = (await app.inject({ method: 'POST', url: '/api/inboxes' })).json();
    const call = async (args: object) =>
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers,
                payload: rpc('tools/call', { name: 'resource_request', arguments: args }),
            })
        ).json().result;
    const inspected = await call({
        kind: 'inboxes',
        action: 'inspect',
        id: inbox.id,
        token: inbox.inspectionToken,
    });
    assert.notEqual(inspected.isError, true, inspected.content[0].text);
    assert.deepEqual(JSON.parse(inspected.content[0].text).requests, []);
    const deleted = await call({
        kind: 'inboxes',
        action: 'delete',
        id: inbox.id,
        token: inbox.inspectionToken,
    });
    assert.notEqual(deleted.isError, true, deleted.content[0].text);
});
