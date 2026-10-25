import assert from 'node:assert/strict';
import test from 'node:test';
import { Resolver } from 'node:dns/promises';
import { publicAddress, publicUrl, resolvePublic } from './public-network.js';
import { NetworkRunner, dnsResponseKey } from './network-tools.js';
import { networkOperations } from '@socket-help/tools/network-definitions';
import { buildApp } from './app.js';

test('network targets reject private, reserved, encoded and mapped addresses', () => {
    for (const address of [
        '127.0.0.1',
        '0.0.0.0',
        '10.1.2.3',
        '172.16.0.1',
        '192.168.1.1',
        '169.254.169.254',
        '100.64.0.1',
        '192.0.2.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '::1',
        '::',
        'fe80::1',
        'fc00::1',
        '2001:db8::1',
        '::ffff:127.0.0.1',
    ])
        assert.equal(publicAddress(address), false, address);
    for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])
        assert.equal(publicAddress(address), true, address);
    for (const url of [
        'http://2130706433',
        'http://0x7f000001',
        'http://0177.0.0.1',
        'http://[::ffff:127.0.0.1]',
        'http://localhost.',
        'https://api.internal',
        'http://service',
        'file:///etc/passwd',
        'ftp://example.com',
        'http://user:password@example.com',
        'https://example.com:22',
    ])
        assert.throws(() => publicUrl(url), Error, url);
    assert.equal(publicUrl('https://example.com/path#fragment').href, 'https://example.com/path');
});

test('DNS resolution rejects mixed public/private answers and respects cancellation', async (t) => {
    t.mock.method(Resolver.prototype, 'resolve4', async () => ['1.1.1.1']);
    t.mock.method(Resolver.prototype, 'resolve6', async () => ['::1']);
    await assert.rejects(
        resolvePublic('example.com', new AbortController().signal),
        /private or reserved/,
    );
    await assert.rejects(resolvePublic('1.1.1.1', AbortSignal.abort()), /cancelled/);
    assert.deepEqual(await resolvePublic('8.8.8.8', new AbortController().signal), [
        { address: '8.8.8.8', family: 4 },
    ]);
});

test('hosted tools reject unsafe targets and invalid fields before making requests', async () => {
    const runner = new NetworkRunner();
    try {
        for (const id of [
            'network-http-header-inspector',
            'network-link-preview-inspector',
            'network-redirect-tester',
            'network-network-diagnostics',
            'network-ssl-tls-inspector',
            'network-cors-tester',
            'network-sse-tester',
        ] as const)
            await assert.rejects(
                runner.run(id, 'http://127.0.0.1', {}, new AbortController().signal),
                /Private|private/,
            );
        await assert.rejects(
            runner.run(
                'network-dns-lookup',
                'example.com',
                { recordType: 'AXFR' },
                new AbortController().signal,
            ),
            /supported value/,
        );
        await assert.rejects(
            runner.run('network-dns-lookup', 'localhost', {}, new AbortController().signal),
            /public DNS/,
        );
        await assert.rejects(
            runner.run(
                'network-cors-tester',
                'https://example.com',
                { origin: 'https://user:pass@example.com' },
                new AbortController().signal,
            ),
            /without credentials/,
        );
        await assert.rejects(
            runner.run('network-dns-lookup', 'x'.repeat(4097), {}, new AbortController().signal),
            /4,096/,
        );
    } finally {
        runner.close();
    }
});

test('network tools are discoverable and rejected targets do not consume hosted quota', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const catalog = (await app.inject('/api/tools')).json().tools;
    for (const id of Object.keys(networkOperations)) {
        const tool = catalog.find((item: { id: string }) => item.id === id);
        assert.equal(tool.status, 'available');
        assert.equal(tool.execution, `/api/tools/${id}/run`);
        assert.deepEqual(tool.interfaces, ['web', 'api', 'sdk', 'cli', 'curl', 'mcp', 'ssh']);
    }
    const response = await app.inject({
        method: 'POST',
        url: '/api/tools/network-http-header-inspector/run',
        payload: { input: 'http://169.254.169.254' },
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Private|private/);
    assert.equal((await app.inject('/api/usage')).json().runsToday, 0);
});

test('DNS comparisons distinguish response status and records while ignoring answer order and TTL', () => {
    const first = {
        status: 0,
        answers: [
            { type: 1, data: '1.1.1.1', ttl: 60 },
            { type: 1, data: '8.8.8.8', ttl: 60 },
        ],
    };
    const reordered = {
        status: 0,
        answers: [
            { type: 1, data: '8.8.8.8', ttl: 120 },
            { type: 1, data: '1.1.1.1', ttl: 120 },
        ],
    };
    assert.equal(dnsResponseKey(first), dnsResponseKey(reordered));
    assert.notEqual(
        dnsResponseKey({ status: 0, answers: [] }),
        dnsResponseKey({ status: 3, answers: [] }),
    );
    assert.notEqual(
        dnsResponseKey(first),
        dnsResponseKey({ status: 0, answers: [{ type: 1, data: '9.9.9.9' }] }),
    );
});

test('request replay blocks routing headers, cookie forwarding and anonymous write requests before sending', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const options of [
        { headers: 'Host: 127.0.0.1' },
        { headers: 'Cookie: session=example' },
        { headers: 'X-Forwarded-Host: localhost' },
        { method: 'GET', body: 'unexpected' },
    ]) {
        const response = await app.inject({
            method: 'POST',
            url: '/api/tools/network-request-replay/run',
            payload: { input: 'https://example.com', options },
        });
        assert.equal(response.statusCode, 400, response.body);
    }
    const blocked = await app.inject({
        method: 'POST',
        url: '/api/tools/network-request-replay/run',
        payload: { input: 'http://127.0.0.1', options: { method: 'POST', body: '{}' } },
    });
    assert.equal(blocked.statusCode, 401);
    assert.equal((await app.inject('/api/usage')).json().runsToday, 0);
});

test('MCP discovery negotiates versions, reads paginated descriptors and cleans up without invoking tools', async () => {
    const { inspectMcp } = await import('./mcp-inspector.js');
    const requests: { method?: string | undefined; rpc?: any; headers?: Record<string, string> }[] =
        [];
    const send: typeof import('./public-network.js').publicRequest = async (
        url,
        signal,
        options = {},
    ) => {
        const rpc = options.requestBody ? JSON.parse(options.requestBody) : undefined;
        requests.push({ method: options.method, rpc, headers: { ...options.headers } });
        let status = 200,
            body: unknown = {},
            headers: Record<string, string> = { 'content-type': 'application/json' };
        if (rpc?.method === 'initialize') {
            body = {
                jsonrpc: '2.0',
                id: rpc.id,
                result: {
                    protocolVersion: '2025-06-18',
                    serverInfo: { name: 'test', version: '1', title: { untrusted: true } },
                    capabilities: { tools: {} },
                },
            };
            headers['mcp-session-id'] = 'session_test';
        } else if (rpc?.method === 'notifications/initialized') status = 202;
        else if (rpc?.method === 'tools/list')
            body = {
                jsonrpc: '2.0',
                id: rpc.id,
                result: {
                    tools: [
                        {
                            name: rpc.params?.cursor ? 'second' : 'first',
                            description: 'A descriptor with secret-token',
                            inputSchema: { type: 'object', properties: {} },
                        },
                    ],
                    ...(rpc.params?.cursor ? {} : { nextCursor: 'page2' }),
                },
            };
        else if (options.method === 'DELETE') status = 204;
        else assert.fail('Unexpected method');
        return {
            url,
            status,
            headers,
            body: Buffer.from(status === 202 || status === 204 ? '' : JSON.stringify(body)),
            truncated: false,
            address: '93.184.216.34',
            timings: { dnsMs: 1, responseMs: 2, totalMs: 3 },
        };
    };
    const result = (await inspectMcp(
        'https://example.com/mcp',
        { secret: 'secret-token' },
        new AbortController().signal,
        send,
    )) as any;
    assert.equal(result.items.length, 2);
    assert.match(result.items[0].description, /\[REDACTED\]/);
    assert.equal(result.protocolVersion, '2025-06-18');
    assert.equal(requests.at(-1)?.method, 'DELETE');
    assert.ok(requests.every((request) => request.rpc?.method !== 'tools/call'));
    assert.equal(requests[1]?.headers?.['mcp-protocol-version'], '2025-06-18');
    assert.equal(requests[1]?.headers?.['mcp-session-id'], 'session_test');
    const partial = (await inspectMcp(
        'https://example.com/mcp',
        { count: '1' },
        new AbortController().signal,
        async (url, signal, options = {}) => {
            const response = await send(url, signal, options);
            if (options.requestBody && JSON.parse(options.requestBody).method === 'tools/list') {
                response.body = Buffer.from(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: 2,
                        result: {
                            tools: [{ name: 'one' }, { name: 'two' }],
                            nextCursor: 'after-two',
                        },
                    }),
                );
            }
            return response;
        },
    )) as any;
    assert.equal(partial.hasMore, true);
    assert.equal(partial.nextCursor, null);
    assert.match(partial.note, /skip items/);
    await assert.rejects(
        inspectMcp('http://127.0.0.1/mcp', {}, new AbortController().signal, send),
        /Private/,
    );
    await assert.rejects(
        inspectMcp(
            'https://example.com/mcp?access_token=secret',
            {},
            new AbortController().signal,
            send,
        ),
        /credentials/,
    );
});
