import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocketHelp } from '@socket-help/sdk';
import { command } from '@socket-help/cli';
import { catalog } from '@socket-help/tools/catalog';
import { buildApp } from './app.js';
import { catalogGuide } from './tool-discovery.js';
import { platformTools } from './mcp.js';

const origin = 'http://localhost:3000';
const id = '11111111-1111-4111-8111-111111111111';
async function call(app: ReturnType<typeof buildApp>, name: string, args = {}, auth = {}) {
    const response = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { accept: 'application/json, text/event-stream', ...auth },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    });
    const result = response.json().result;
    assert.ok(result, response.body);
    return { ...result, value: JSON.parse(result.content[0].text) };
}
function client(app: ReturnType<typeof buildApp>) {
    return new SocketHelp({
        baseUrl: origin,
        fetch: async (url, init) => {
            const parsed = new URL(String(url));
            const response = await app.inject({
                method: (init?.method ?? 'GET') as 'GET' | 'POST',
                url: parsed.pathname + parsed.search,
                headers: Object.fromEntries(new Headers(init?.headers).entries()),
                ...(init?.body ? { payload: String(init.body) } : {}),
            });
            return new Response(response.body, {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
            });
        },
    });
}

test('HTTP, MCP, SDK and CLI create receivers that accept senders while inspection stays private', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const sdk = client(app);
    const created = [
        (await app.inject({ method: 'POST', url: '/api/inboxes' })).json(),
        (await call(app, 'create_webhook_inbox')).value,
        await sdk.createInbox(),
        await command(sdk, ['inbox', 'create']),
    ] as { id: string; inspectionToken: string; visibility: string; accessToken?: string }[];
    for (const inbox of created) {
        assert.equal(inbox.visibility, 'public');
        assert.equal(inbox.accessToken, undefined);
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url: `/hooks/${inbox.id}`,
                    payload: 'sender event',
                })
            ).statusCode,
            200,
        );
        for (const suffix of ['', '/requests', '/wait?timeoutSeconds=1'])
            assert.equal((await app.inject(`/api/inboxes/${inbox.id}${suffix}`)).statusCode, 404);
        const read = await app.inject({
            url: `/api/inboxes/${inbox.id}/requests`,
            headers: { authorization: `Bearer ${inbox.inspectionToken}` },
        });
        assert.equal(read.statusCode, 200);
        assert.equal(read.json().requests[0].body, 'sender event');
    }
    const inbox = await sdk.createInbox({ visibility: 'private' });
    assert.equal((await app.inject({ method: 'POST', url: `/hooks/${inbox.id}` })).statusCode, 404);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id}`,
                headers: { 'x-access-token': inbox.accessToken! },
            })
        ).statusCode,
        200,
    );
});

test('anonymous and trial callers get one actionable workspace error across HTTP and MCP adapters', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const trialResponse = await app.inject({
        method: 'POST',
        url: '/api/agents/trial',
        payload: { name: 'Audit trial' },
    });
    assert.equal(trialResponse.statusCode, 201, trialResponse.body);
    const trial = trialResponse.json();
    const cases: [string, string, object | undefined, string, object][] = [
        [
            'PUT',
            '/api/memory/audit/item',
            { value: 1 },
            'memory_set',
            { namespace: 'audit', key: 'item', value: 1 },
        ],
        [
            'GET',
            '/api/memory/audit/item',
            undefined,
            'memory_get',
            { namespace: 'audit', key: 'item' },
        ],
        ['GET', '/api/memory/audit', undefined, 'memory_list', { namespace: 'audit' }],
        [
            'DELETE',
            '/api/memory/audit/item',
            undefined,
            'memory_delete',
            { namespace: 'audit', key: 'item' },
        ],
        ['POST', '/api/monitors', {}, 'create_monitor', { kind: 'heartbeat', name: 'Audit' }],
        ['GET', `/api/monitors/${id}`, undefined, 'inspect_monitor', { id }],
        ['POST', '/api/approvals', {}, 'ask_human', { question: 'Proceed?' }],
        [
            'GET',
            `/api/approvals/${id}/wait?timeoutSeconds=1`,
            undefined,
            'wait_for_approval',
            { id, timeoutSeconds: 1 },
        ],
        [
            'POST',
            '/api/scheduled-jobs',
            {},
            'resource_request',
            { kind: 'scheduled-jobs', action: 'create', config: {} },
        ],
        [
            'POST',
            '/api/status-pages',
            {},
            'resource_request',
            { kind: 'status-pages', action: 'create', config: {} },
        ],
        [
            'GET',
            '/api/account/resources',
            undefined,
            'resource_request',
            { kind: 'inboxes', action: 'list' },
        ],
        ['GET', '/api/phone-numbers', undefined, 'list_phone_numbers', {}],
        [
            'GET',
            `/api/phone-numbers/${id}/wait?timeoutSeconds=1`,
            undefined,
            'wait_for_sms',
            { id, timeoutSeconds: 1 },
        ],
        [
            'POST',
            '/api/tools/network-request-replay/run',
            { input: 'https://example.com', options: { method: 'POST' } },
            'run_tool',
            {
                toolId: 'network-request-replay',
                input: 'https://example.com',
                options: { method: 'POST' },
            },
        ],
        [
            'POST',
            '/api/tools/mock-apis-api-test-scenarios/run',
            { input: '{}' },
            'run_tool',
            { toolId: 'mock-apis-api-test-scenarios', input: '{}' },
        ],
        [
            'POST',
            '/api/authenticators',
            {},
            'add_authenticator',
            { name: 'Authorized account', secret: 'JBSWY3DPEHPK3PXP' },
        ],
        ['GET', `/api/authenticators/${id}/code`, undefined, 'get_totp_code', { id }],
        ['POST', '/api/email-inboxes', {}, 'create_email_inbox', {}],
    ];
    for (const auth of [{}, { authorization: `Bearer ${trial.trialKey}` }]) {
        for (const [method, url, payload, name, args] of cases) {
            const http = await app.inject({
                method: method as 'POST',
                url,
                headers: auth,
                ...(payload ? { payload } : {}),
            });
            assert.equal(http.statusCode, 401, `${url}: ${http.body}`);
            const mcp = await call(app, name, args, auth);
            assert.equal(mcp.isError, true, name);
            assert.equal(mcp.value.status, 401, name);
            assert.equal(mcp.value.error, http.json().error, name);
            assert.match(http.json().error, /This needs an approved workspace key\./);
            assert.match(http.json().error, /Do not retry until approved/);
            if ('authorization' in auth)
                assert.ok(http.json().error.includes(trial.claim.claimUrl), http.body);
            else assert.match(http.json().error, /start_login.*POST \/api\/agents\/login/);
        }
    }
});

test('catalog and MCP discovery expose resource entry points and server capability availability', async (t) => {
    for (const enabled of [false, true]) {
        const app = buildApp(
            enabled
                ? {
                      smtpCaptureConfig: {
                          port: 0,
                          host: '127.0.0.1',
                          publicHost: 'smtp.example.test',
                          publicPort: 2465,
                          local: true,
                      },
                  }
                : {},
        );
        t.after(() => app.close());
        assert.equal((await app.inject('/api/capabilities')).json().smtpCapture, enabled);
        const smtp = (await app.inject('/api/tools/email-mock-smtp')).json();
        assert.equal(smtp.status, enabled ? 'available' : 'coming-soon');
        const httpTools = (await app.inject('/api/tools')).json().tools;
        assert.equal(
            httpTools.find((tool: { id: string }) => tool.id === smtp.id).status,
            smtp.status,
        );
        const listed = (await call(app, 'list_tools')).value.tools;
        assert.equal(
            listed.find((tool: { id: string }) => tool.id === smtp.id).status,
            smtp.status,
        );
        const found = (await call(app, 'search_tools', { query: 'webhook' })).value.tools;
        for (const id of ['webhooks', 'create_webhook_inbox', 'mock-apis-webhook-event-simulator'])
            assert.ok(
                found.some((tool: { id: string }) => tool.id === id),
                id,
            );
        const guide = (await call(app, 'describe_tool', { toolId: 'webhooks' })).value;
        assert.equal(guide.mcpTool, 'create_webhook_inbox');
        assert.equal(guide.resourceRequest.kind, 'inboxes');
        assert.equal(guide.http, 'POST /api/inboxes');
        assert.ok(
            guide.inputSchema.properties.visibility.description.includes('public by default'),
        );
        assert.equal(
            (await call(app, 'describe_tool', { toolId: 'create_webhook_inbox' })).value.name,
            'create_webhook_inbox',
        );
        for (const tool of catalog.filter((tool) => tool.status === 'available')) {
            const guide = catalogGuide(tool.id, {
                emailReceiving: false,
                smtpCapture: enabled,
                phones: false,
            })!;
            assert.ok(
                guide.status === 'coming-soon' || 'mcpTool' in guide || 'next' in guide,
                tool.id,
            );
            if ('mcpTool' in guide)
                assert.ok(
                    platformTools.some((native) => native.name === guide.mcpTool),
                    `${tool.id}: ${guide.mcpTool}`,
                );
        }
    }
});

test('the webhook simulator reports target rejection and names its required secret', async (t) => {
    let status = 404;
    const app = buildApp({
        webhookEventSend: async () =>
            ({
                status,
                headers: {},
                body: Buffer.from('receiver response'),
                truncated: false,
                timings: { totalMs: 1 },
            }) as never,
    });
    t.after(() => app.close());
    const args = {
        toolId: 'mock-apis-webhook-event-simulator',
        input: 'https://example.com/hook',
        options: { mode: 'github', secret: 'test-secret' },
    };
    for (const code of [200, 204, 302, 404, 500]) {
        status = code;
        const response = await call(app, 'run_tool', args);
        assert.equal(response.isError, code < 200 || code >= 300);
        const event = JSON.parse(response.value.output);
        assert.equal(event.response.status, code);
        assert.equal(event.delivered, !response.isError);
        assert.match(event.note, new RegExp(`HTTP ${code}`));
    }
    const missing = await call(app, 'run_tool', { ...args, options: {} });
    assert.equal(missing.isError, true);
    assert.match(missing.value.error, /secret.*required.*1–256 bytes/);
});

test('SSE mocks preserve existing fields, multiline data and event boundaries', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const body of [
        'data: one\n\ndata: two\n\n',
        ': heartbeat\n\nevent: update\nid: 7\ndata: one\ndata: two\n\n',
    ]) {
        const created = (
            await app.inject({
                method: 'POST',
                url: '/api/mocks?visibility=public',
                payload: {
                    name: 'Framed SSE',
                    routes: [
                        {
                            method: 'GET',
                            path: '/events',
                            status: 200,
                            body,
                            stream: { mode: 'sse', intervalMs: 10 },
                        },
                    ],
                },
            })
        ).json();
        const response = await app.inject(`/mock/${created.id}/events`);
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.body, body);
        assert.doesNotMatch(response.body, /data: data:/);
    }
});

test('MCP mock calls record their client name and music returns small download links', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const mock = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=public',
            payload: {
                name: 'Caller log',
                routes: [{ method: 'GET', path: '/', status: 200, body: 'ok' }],
            },
        })
    ).json();
    assert.equal(
        (await call(app, 'call_mock_api', { id: mock.id, method: 'GET', path: '/' })).isError,
        false,
    );
    const calls = (
        await app.inject({
            url: `/api/mocks/${mock.id}/calls`,
            headers: { authorization: `Bearer ${mock.managementToken}` },
        })
    ).json();
    assert.equal(calls.calls[0].userAgent, 'socket.help call_mock_api');
    for (const format of ['wav', 'mp3']) {
        const response = await call(app, 'run_tool', {
            toolId: 'test-media-music-library',
            options: { format },
        });
        assert.equal(response.isError, false, JSON.stringify(response));
        assert.ok(JSON.stringify(response).length < 4096);
        const music = JSON.parse(response.value.output);
        assert.equal(music.base64, undefined);
        assert.equal(new URL(music.downloadUrl).origin, origin);
        const download = await app.inject(new URL(music.downloadUrl).pathname);
        assert.equal(download.statusCode, 200);
        assert.ok(download.rawPayload.length > 10000);
    }
});

test('catalog browsing has its own bounded budget and does not consume run or API budgets', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const tool of catalog)
        assert.equal((await app.inject(`/api/tools/${tool.id}`)).statusCode, 200, tool.id);
    assert.equal((await app.inject('/api/tools')).statusCode, 200);
    assert.equal((await app.inject('/api/usage')).json().runsToday, 0);
    const errors = [];
    for (let count = catalog.length + 1; count <= 600; count++)
        errors.push((await app.inject('/api/tools')).statusCode);
    assert.equal(errors.at(-1), 429);
    assert.equal((await app.inject('/api/usage')).statusCode, 200);
});

test('media validation identifies invalid numeric fields', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const [field, value, range] of [
        ['width', 'bad', '64 to 1280'],
        ['duration', '200', '0.1 to 10'],
        ['start', '-1', '0 to 120'],
    ]) {
        const response = await app.inject({
            method: 'POST',
            url: '/api/tools/test-media-sample-video/run',
            payload: { options: { [field!]: value } },
        });
        assert.equal(response.statusCode, 400, response.body);
        assert.equal(response.json().error, `${field} must be a number from ${range}.`);
    }
    const sample = await app.inject({
        method: 'POST',
        url: '/api/tools/test-media-placeholder-images/run',
        payload: { options: { width: '32', height: '32', format: 'png' } },
    });
    const file = JSON.parse(sample.json().output);
    const response = await app.inject({
        method: 'POST',
        url: '/api/tools/everyday-image-resizer/run',
        payload: { options: { width: 'bad' }, file: { name: 'test.png', base64: file.base64 } },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().error, /width must be an integer from 1 to 4096/);
});
