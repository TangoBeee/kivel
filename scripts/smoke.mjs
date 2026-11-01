import assert from 'node:assert/strict';
import { SocketHelp } from '../packages/sdk/dist/index.js';
import { execFileSync } from 'node:child_process';

const origin = process.env.SOCKET_BASE_URL ?? 'http://localhost:8080';
const request = (path, options = {}) =>
    fetch(new URL(path, origin), { ...options, signal: AbortSignal.timeout(15000) });
let skippedHostedChecks = 0;
async function quotaExhausted(response) {
    if (response.status !== 429 || process.env.SMOKE_ALLOW_EXHAUSTED_QUOTA !== '1') return false;
    assert.match((await response.clone().json()).error, /Daily hosted tool allowance reached/);
    skippedHostedChecks++;
    return true;
}
const categories = [
    'network',
    'mock-apis',
    'agents',
    'files',
    'everyday',
    'email',
    'domains',
    'monitoring',
    'databases',
    'test-media',
    'developer',
    'automation',
];
for (const path of [
    '/',
    '/webhooks/',
    '/tools/',
    '/docs/',
    '/account/',
    '/plans/',
    '/integrations/',
    '/share/',
    '/privacy/',
    '/refunds/',
    '/contact/',
    '/beta/',
    '/catalog/',
    '/tools/mock-rest-api/',
    '/tools/stateful-crud-api/',
    '/tools/http-echo/',
    '/docs/http-echo/',
    '/blog/debug-http-clients-with-an-echo-endpoint/',
    '/docs/stateful-crud-mocks/',
    '/blog/stateful-crud-mocks-for-frontend-testing/',
    '/tools/temporary-file-transfer/',
    '/tools/one-time-download-links/',
    '/tools/private-file-sharing/',
    '/tools/mock-mcp-server/',
    '/tools/socket-help-mcp/',
    '/tools/json-formatter/',
    '/tools/csv-to-json/',
    '/tools/password-generator/',
    ...categories.map((id) => `/catalog/${id}/`),
]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'sha256-/);
    assert.ok(
        response.headers.get('content-security-policy').length < 4096,
        `${path}: bounded CSP header`,
    );
    if (path === '/') {
        const html = await response.text();
        const asset = html.match(/src="([^\"]*\/_next\/static\/[^\"]+\.js)"/)?.[1];
        assert.ok(asset, 'Next.js script asset');
        const script = await request(asset);
        assert.equal(script.status, 200);
        assert.match(script.headers.get('cache-control'), /immutable/);
    }
}
assert.equal((await request('/ready')).status, 200);
const missing = await request('/not-a-real-page', { headers: { Accept: 'text/html' } });
assert.equal(missing.status, 404);
assert.match(await missing.text(), /A loose connection/);
const spec = await (await request('/api/openapi.json')).json();
assert.equal(spec.openapi, '3.1.0');

const created = await request('/api/inboxes?visibility=public', { method: 'POST' });
assert.equal(created.status, 201);
const inbox = await created.json();
assert.equal(new URL(inbox.webhookUrl).origin, new URL(origin).origin);
const headers = { Authorization: `Bearer ${inbox.inspectionToken}` };
const history = `/api/inboxes/${inbox.id}/requests`;
try {
    const body = '{\n "event": "smoke-test", "html": "<script>alert(1)</script>"\n}';
    const capture = await request(`/hooks/${inbox.id}?tag=one&tag=two`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'test-secret' },
        body,
    });
    assert.equal(capture.status, 200);
    const response = await request(history, { headers });
    assert.equal(response.status, 200);
    const [record] = (await response.json()).requests;
    assert.equal(record.body, body);
    assert.deepEqual(record.query.tag, ['one', 'two']);
    assert.equal(record.headers['x-api-key'], '[REDACTED]');
    assert.equal(
        (
            await request(history, {
                headers: { ...headers, 'If-None-Match': response.headers.get('etag') },
            })
        ).status,
        304,
    );
    assert.equal((await request(history)).status, 404);
    assert.equal(
        (
            await request('/api/inboxes?visibility=public', {
                method: 'POST',
                headers: { Origin: 'https://untrusted.example' },
            })
        ).status,
        403,
    );
} finally {
    assert.equal(
        (await request(`/api/inboxes/${inbox.id}`, { method: 'DELETE', headers })).status,
        204,
    );
}
assert.equal((await request(history, { headers })).status, 404);
console.log(
    'Production HTTP smoke passed: pages, assets, CSP, readiness, OpenAPI, capture, auth, conditional polling, origin checks, and deletion.',
);

const mockCreated = await request('/api/mocks?visibility=public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'Smoke API',
        routes: [{ method: 'GET', path: '/hello', status: 200, body: '{"ok":true}' }],
    }),
});
assert.equal(mockCreated.status, 201);
const mock = await mockCreated.json();
try {
    assert.deepEqual(await (await request(`/mock/${mock.id}/hello`)).json(), { ok: true });
    assert.equal((await request(`/api/mocks/${mock.id}`)).status, 404);
} finally {
    assert.equal(
        (
            await request(`/api/mocks/${mock.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${mock.managementToken}` },
            })
        ).status,
        204,
    );
}
const fileCreated = await request('/api/files?visibility=public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'smoke.txt' },
    body: Buffer.alloc(256 * 1024, 7),
});
assert.equal(fileCreated.status, 201);
const file = await fileCreated.json();
try {
    const download = await request(`/files/${file.id}`);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.alloc(256 * 1024, 7));
    assert.match(download.headers.get('content-disposition'), /^attachment/);
} finally {
    assert.equal(
        (
            await request(`/api/files/${file.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${file.managementToken}` },
            })
        ).status,
        204,
    );
}
const rpcHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
};
const mcp = await request('/mcp', {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
assert.equal(mcp.status, 200);
const platformTools = (await mcp.json()).result.tools;
assert.equal(platformTools.length, 50);
assert.ok(platformTools.some((tool) => tool.name === 'describe_tool'));
assert.equal(new Set(platformTools.map((tool) => tool.name)).size, platformTools.length);
const descriptor = await request('/api/tools/test-media-audio-composer');
assert.equal(descriptor.status, 200);
const audioGuide = (await descriptor.json()).guide;
assert.ok(Array.isArray(audioGuide.options));
assert.equal(JSON.parse(audioGuide.inputExample).version, 1);
const scenarioDescriptor = await request('/api/tools/mock-apis-api-test-scenarios');
assert.equal(scenarioDescriptor.status, 200);
assert.equal((await scenarioDescriptor.json()).status, 'available');
const invalidScenario = await request('/api/tools/mock-apis-api-test-scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: '{}' }),
});
// Scenarios send requests to third-party servers, so anonymous runs need an account first.
if (!(await quotaExhausted(invalidScenario))) assert.equal(invalidScenario.status, 401);
const music = await request('/api/music');
assert.equal(music.status, 200);
const library = await music.json();
assert.equal(library.license, 'CC0-1.0');
assert.equal(library.tracks.length, 6);
const musicRange = await request(library.tracks[0].audioUrl, { headers: { Range: 'bytes=0-31' } });
assert.equal(musicRange.status, 206);
assert.equal((await musicRange.arrayBuffer()).byteLength, 32);
console.log(
    'Mock APIs, exact file downloads, management tokens, and platform MCP smoke checks passed.',
);

const privateCreated = await request('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'private-smoke.txt' },
    body: 'private smoke fixture',
});
assert.equal(privateCreated.status, 201);
const privateFile = await privateCreated.json();
try {
    assert.equal((await request(`/files/${privateFile.id}`)).status, 404);
    assert.equal(
        (
            await request(`/files/${privateFile.id}`, {
                headers: { Authorization: `Bearer ${privateFile.managementToken}` },
            })
        ).status,
        404,
    );
    assert.equal((await request(`/files/${privateFile.id}/info`)).status, 404);
    const allowed = { 'X-Access-Token': privateFile.accessToken };
    assert.equal(
        (await request(`/files/${privateFile.id}/info`, { headers: allowed })).status,
        200,
    );
    assert.equal(
        await (await request(`/files/${privateFile.id}`, { headers: allowed })).text(),
        'private smoke fixture',
    );
    const rotatedResponse = await request(`/api/files/${privateFile.id}/sharing`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${privateFile.managementToken}`,
        },
        body: JSON.stringify({ visibility: 'private' }),
    });
    assert.equal(rotatedResponse.status, 200);
    assert.equal((await request(`/files/${privateFile.id}`, { headers: allowed })).status, 404);
    const rotated = await rotatedResponse.json();
    assert.equal(
        (
            await request(`/files/${privateFile.id}`, {
                headers: { 'X-Access-Token': rotated.accessToken },
            })
        ).status,
        200,
    );
} finally {
    assert.equal(
        (
            await request(`/api/files/${privateFile.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${privateFile.managementToken}` },
            })
        ).status,
        204,
    );
}
const run = await request('/api/tools/json/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: '{"integer":9007199254740993}', options: { action: 'minify' } }),
});
if (!(await quotaExhausted(run))) {
    assert.equal(run.status, 200);
    assert.equal((await run.json()).output, '{"integer":9007199254740993}');
}
assert.deepEqual(await (await request('/api/billing')).json(), {
    provider: 'dodo',
    enabled: false,
    prices: [],
});
console.log('Private sharing, token rotation, and disabled billing smoke checks passed.');
console.log(
    skippedHostedChecks
        ? `${skippedHostedChecks} hosted execution checks skipped: persisted daily allowance exhausted.`
        : 'Hosted execution and invalid scenario checks passed.',
);

const crudCreated = await request('/api/mocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'CRUD smoke fixture',
        routes: [],
        crud: { path: '/tasks', seed: [{ id: 'seed', name: 'Seed task' }] },
    }),
});
assert.equal(crudCreated.status, 201);
const crud = await crudCreated.json();
try {
    const socket = new SocketHelp({ baseUrl: origin });
    const path = `/mock/${crud.id}/tasks`;
    assert.equal((await request(path)).status, 404);
    const created = await socket.request(
        'POST',
        path,
        { id: 'sdk', name: 'SDK record' },
        crud.accessToken,
    );
    assert.equal(created.id, 'sdk');
    const cli = JSON.parse(
        execFileSync(
            process.execPath,
            ['packages/cli/dist/cli.js', 'api', 'GET', path, '--token', crud.accessToken],
            {
                env: { ...process.env, SOCKET_HELP_URL: origin, SOCKET_HELP_API_KEY: '' },
                encoding: 'utf8',
            },
        ),
    );
    assert.equal(cli.total, 2);
    const rpc = await request('/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 99,
            method: 'tools/call',
            params: {
                name: 'call_mock_api',
                arguments: {
                    id: crud.id,
                    method: 'PATCH',
                    path: '/tasks/sdk',
                    accessToken: crud.accessToken,
                    revision: 1,
                    body: { done: true },
                },
            },
        }),
    });
    const called = JSON.parse((await rpc.json()).result.content[0].text);
    assert.equal(called.status, 200);
    assert.equal(called.body.done, true);
    assert.equal(
        (
            await request('/api/mocks/' + crud.id + '/reset', {
                method: 'POST',
                headers: { 'X-Resource-Token': crud.managementToken },
            })
        ).status,
        200,
    );
    assert.equal((await socket.request('GET', path, undefined, crud.accessToken)).total, 1);
} finally {
    assert.equal(
        (
            await request('/api/mocks/' + crud.id, {
                method: 'DELETE',
                headers: { 'X-Resource-Token': crud.managementToken },
            })
        ).status,
        204,
    );
}
console.log('CRUD SDK, CLI, MCP, private access and seed reset smoke checks passed.');

const echoCreated = await request('/api/mocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Echo smoke fixture', routes: [], echo: true }),
});
assert.equal(echoCreated.status, 201);
const echo = await echoCreated.json();
try {
    const path = `/mock/${echo.id}/check?source=sdk`;
    assert.equal((await request(path)).status, 404);
    const socket = new SocketHelp({ baseUrl: origin });
    const observed = await socket.request(
        'POST',
        path,
        { event: 'smoke.created', secret: 'do-not-reflect' },
        echo.accessToken,
    );
    assert.equal(observed.body.value.event, 'smoke.created');
    assert.equal(observed.body.value.secret, '[REDACTED]');
    assert.equal(observed.headers['x-access-token'], '[REDACTED]');
    const cli = JSON.parse(
        execFileSync(
            process.execPath,
            ['packages/cli/dist/cli.js', 'api', 'GET', path, '--token', echo.accessToken],
            {
                env: { ...process.env, SOCKET_HELP_URL: origin, SOCKET_HELP_API_KEY: '' },
                encoding: 'utf8',
            },
        ),
    );
    assert.equal(cli.method, 'GET');
    assert.equal(cli.query.source, 'sdk');
    const rpc = await request('/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 100,
            method: 'tools/call',
            params: {
                name: 'call_mock_api',
                arguments: {
                    id: echo.id,
                    method: 'POST',
                    path: '/from-mcp',
                    accessToken: echo.accessToken,
                    body: { event: 'mcp.created' },
                },
            },
        }),
    });
    const result = JSON.parse((await rpc.json()).result.content[0].text);
    assert.equal(result.status, 200);
    assert.equal(result.body.body.value.event, 'mcp.created');
} finally {
    assert.equal(
        (
            await request(`/api/mocks/${echo.id}`, {
                method: 'DELETE',
                headers: { 'X-Resource-Token': echo.managementToken },
            })
        ).status,
        204,
    );
}
console.log('HTTP echo private access, redaction, SDK, CLI and MCP smoke checks passed.');
