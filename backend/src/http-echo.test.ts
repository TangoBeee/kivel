import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';
import { validateMock } from '@kivel/tools/mock-config';
import { ResourceStore, RESOURCE_TTL_MS } from './resources.js';
test('HTTP echo reflects observed data, redacts credentials, and does not retain content', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const resource = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks',
            payload: { name: 'Echo', routes: [], echo: true },
        })
    ).json();
    const url = `/mock/${resource.id}/check?source=tests&access_token=sensitive-query&tag=one&tag=two`;
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.equal(
        (
            await app.inject({
                url,
                headers: { authorization: `Bearer ${resource.managementToken}` },
            })
        ).statusCode,
        404,
    );
    const sent = await app.inject({
        method: 'POST',
        url,
        headers: {
            'x-access-token': resource.accessToken,
            'x-api-key': 'sensitive-key',
            'x-demo': 'visible',
            cookie: 'session=hidden',
        },
        payload: {
            event: 'test.created',
            password: 'hidden',
            nested: { secret: 'hidden' },
            message: `literal ${resource.accessToken}`,
            array: [{ apiKey: 'hidden' }],
        },
    });
    assert.equal(sent.statusCode, 200, sent.body);
    const value = sent.json();
    assert.equal(value.method, 'POST');
    assert.equal(value.path, '/check');
    assert.equal(value.query.source, 'tests');
    assert.deepEqual(value.query.tag, ['one', 'two']);
    assert.equal(value.query.access_token, '[REDACTED]');
    assert.equal(value.headers['x-demo'], 'visible');
    assert.equal(value.headers['x-api-key'], '[REDACTED]');
    assert.equal(value.body.kind, 'json');
    assert.equal(value.body.value.event, 'test.created');
    assert.equal(value.body.value.password, '[REDACTED]');
    assert.equal(value.body.value.nested.secret, '[REDACTED]');
    assert.equal(value.body.value.array[0].apiKey, '[REDACTED]');
    assert.ok(!sent.body.includes(resource.accessToken));
    assert.ok(!sent.body.includes('sensitive-key'));
    assert.ok(!sent.body.includes('sensitive-query'));
    const metadata = (
        await app.inject({
            url: `/api/mocks/${resource.id}`,
            headers: { 'x-resource-token': resource.managementToken },
        })
    ).json();
    assert.equal(metadata.echo, true);
    assert.equal(metadata.uses, 1);
    assert.ok(!JSON.stringify(metadata).includes('test.created'));
    assert.ok(!('requests' in metadata));
    const text = await app.inject({
        method: 'PUT',
        url: `/mock/${resource.id}/text`,
        headers: { 'x-access-token': resource.accessToken, 'content-type': 'text/plain' },
        payload: 'hello world',
    });
    assert.equal(text.json().body.kind, 'text');
    assert.equal(text.json().body.value, 'hello world');
    const binary = await app.inject({
        method: 'POST',
        url: `/mock/${resource.id}/binary`,
        headers: {
            'x-access-token': resource.accessToken,
            'content-type': 'application/octet-stream',
        },
        payload: Buffer.from([255, 254, 253]),
    });
    assert.deepEqual(binary.json().body, {
        kind: 'binary',
        bytes: 3,
        notice: 'Binary contents are not reflected. Inspect the byte count and content type.',
    });
    const head = await app.inject({
        method: 'HEAD',
        url: `/mock/${resource.id}`,
        headers: { 'x-access-token': resource.accessToken },
    });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    const badJson = await app.inject({
        method: 'POST',
        url: `/mock/${resource.id}/bad`,
        headers: { 'x-access-token': resource.accessToken, 'content-type': 'application/json' },
        payload: '{broken',
    });
    assert.equal(badJson.statusCode, 200);
    assert.equal(badJson.json().body.kind, 'text');
});
test('echo config is exclusive, public access is explicit, and expiry and deletion apply', async (t) => {
    let now = Date.now();
    const app = buildApp({ resourceStore: new ResourceStore(() => now) });
    t.after(() => app.close());
    for (const config of [
        { name: 'bad', routes: [], echo: false },
        { name: 'bad', routes: [], echo: true, crud: { path: '/items', seed: [] } },
        {
            name: 'bad',
            echo: true,
            routes: [{ method: 'GET', path: '/hello', status: 200, body: 'hello' }],
        },
    ])
        assert.throws(() => validateMock(config));
    const resource = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: { name: 'Public echo', routes: [], echo: true },
        })
    ).json();
    assert.equal((await app.inject(`/mock/${resource.id}/anything`)).statusCode, 200);
    now += RESOURCE_TTL_MS + 1;
    assert.equal((await app.inject(`/mock/${resource.id}/anything`)).statusCode, 404);
});

test('echo browser preflights allow safe custom headers and MCP uses the same endpoint', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const rpc = async (name: string, args: Record<string, unknown>) => {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        return JSON.parse(response.json().result.content[0].text);
    };
    const resource = await rpc('create_mock_api', {
        name: 'Echo over MCP',
        routes: [],
        echo: true,
    });
    assert.ok(resource.id, JSON.stringify(resource));
    const url = `/mock/${resource.id}/check`;
    const preflight = await app.inject({
        method: 'OPTIONS',
        url,
        headers: {
            origin: 'https://client.example',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type,x-access-token,x-demo-source',
        },
    });
    assert.equal(preflight.statusCode, 204);
    assert.match(String(preflight.headers['access-control-allow-headers']), /x-demo-source/);
    assert.equal(preflight.headers['access-control-allow-credentials'], undefined);
    assert.equal(
        (
            await app.inject({
                method: 'OPTIONS',
                url,
                headers: {
                    'access-control-request-method': 'POST',
                    'access-control-request-headers': 'x-forwarded-for',
                },
            })
        ).statusCode,
        400,
    );
    const echoed = await rpc('call_mock_api', {
        id: resource.id,
        method: 'POST',
        path: '/check',
        accessToken: resource.accessToken,
        body: { event: 'mcp.created' },
    });
    assert.equal(echoed.status, 200);
    assert.equal(echoed.body.body.value.event, 'mcp.created');
    const redacted = await app.inject({
        method: 'POST',
        url,
        headers: {
            authorization: `bearer ${resource.accessToken}`,
            'x-forwarded-for': '203.0.113.1',
            'content-type': 'text/plain',
        },
        payload: `test ${resource.accessToken}`,
    });
    assert.equal(redacted.statusCode, 200);
    assert.ok(!redacted.body.includes(resource.accessToken));
    assert.equal(redacted.json().headers['x-forwarded-for'], '[REDACTED]');
});
