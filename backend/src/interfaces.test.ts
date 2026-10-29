import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocketHelp, SocketError } from '@socket-help/sdk';
import { command, needsInput } from '@socket-help/cli';
import { buildApp } from './app.js';

const origin = 'http://localhost:3000';
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
async function fixture(t: { after: (fn: () => Promise<unknown>) => void }) {
    const app = buildApp({
        mailDomain: 'inbox.example.test',
        emailIngestSecret: 'test-ingest-secret',
    });
    t.after(() => app.close());
    const fetcher: typeof fetch = async (url, init) => {
        const parsed = new URL(String(url));
        const response = await app.inject({
            method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
            url: parsed.pathname + parsed.search,
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
            [204, 304].includes(response.statusCode) ? null : new Uint8Array(response.rawPayload),
            { status: response.statusCode, headers: response.headers as Record<string, string> },
        );
    };
    const guest = new SocketHelp({ baseUrl: origin, fetch: fetcher });
    const session = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'interface-owner',
            email: 'interface-owner@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(session.statusCode, 201, session.body);
    const human = { origin, cookie: String(session.headers['set-cookie']).split(';')[0]! };
    const login = await guest.startLogin('Test agent', 'SDK');
    assert.equal((await guest.finishLogin(login.deviceCode)).status, 'pending');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/agents/login/${login.userCode}/approve`,
                headers: human,
                payload: {},
            })
        ).statusCode,
        200,
    );
    const token = await guest.finishLogin(login.deviceCode);
    assert.equal(token.status, 'approved');
    if (token.status !== 'approved') throw new Error('Expected agent key');
    const client = new SocketHelp({ baseUrl: origin, apiKey: token.apiKey, fetch: fetcher });
    const mcp = async (name: string, args: object) => {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: {
                authorization: `Bearer ${token.apiKey}`,
                accept: 'application/json, text/event-stream',
            },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        const result = response.json().result;
        assert.ok(result, response.body);
        assert.equal(result.isError, false, response.body);
        return JSON.parse(result.content[0].text);
    };
    return { app, guest, client, human, mcp, fetcher, apiKey: token.apiKey };
}

test('SDK and CLI cover the agent lifecycle, email, memory, monitors, questions and resource management', async (t) => {
    const { app, guest, client, human, mcp } = await fixture(t);
    await assert.rejects(
        guest.finishLogin('x'.repeat(43)),
        (error: unknown) => error instanceof SocketError && error.status === 404,
    );
    await assert.rejects(
        command(client, ['agent', 'list', '--human-email', 'ignored@example.test']),
        /Unknown option/,
    );
    await command(
        client,
        ['memory', 'set', 'build', 'steps/last', '--ttl-seconds', '60'],
        bytes({ ok: true }),
    );
    assert.deepEqual((await client.memoryGet('build', 'steps/last')).value, { ok: true });
    assert.equal((await client.memoryList('build', 'steps/')).keys.length, 1);
    await command(client, ['memory', 'delete', 'build', 'steps/last']);
    await assert.rejects(
        client.memoryGet('build', 'steps/last'),
        (error: unknown) => error instanceof SocketError && error.status === 404,
    );
    const email = await client.createEmailInbox({ ttlSeconds: 120 });
    assert.match(email.address, /@inbox.example.test$/);
    assert.deepEqual(await command(client, ['email', 'messages', email.id]), { messages: [] });
    assert.equal((await client.emailInbox(email.id)).id, email.id);
    assert.equal((await client.waitForEmail(email.id, { timeoutSeconds: 1 })).timedOut, true);
    assert.equal((await client.renew('email-inboxes', email.id)).id, email.id);
    await client.remove('email-inboxes', email.id);
    const monitor = await client.createMonitor({
        kind: 'heartbeat',
        name: 'Build heartbeat',
        intervalSeconds: 300,
    });
    assert.equal(
        ((await command(client, ['monitor', 'pause', monitor.id])) as { paused: boolean }).paused,
        true,
    );
    const pingToken = new URL(monitor.pingUrl!).pathname.split('/').pop()!;
    assert.equal(
        ((await command(client, ['monitor', 'ping', pingToken])) as { status: string }).status,
        'up',
    );
    assert.equal((await mcp('ping_monitor', { token: pingToken, failed: true })).status, 'down');
    assert.equal((await client.pingMonitor(pingToken)).status, 'up');
    assert.equal((await client.monitor(monitor.id)).paused, true);
    assert.equal((await mcp('inspect_monitor', { id: monitor.id })).paused, true);
    assert.equal((await mcp('pause_monitor', { id: monitor.id, paused: false })).paused, false);
    await command(client, ['monitor', 'delete', monitor.id]);
    const approval = (await command(
        client,
        ['approval', 'ask'],
        bytes({ question: 'Deploy staging?', options: ['Deploy', 'Wait'] }),
    )) as { id: string };
    assert.equal((await client.approval(approval.id)).status, 'pending');
    assert.equal((await client.waitForApproval(approval.id, 1)).timedOut, true);
    await assert.rejects(
        client.request('POST', `/api/approvals/${approval.id}/answer`, { answer: 'Deploy' }),
        (error: unknown) => error instanceof SocketError && error.status === 403,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/approvals/${approval.id}/answer`,
                headers: human,
                payload: { answer: 'Deploy' },
            })
        ).statusCode,
        200,
    );
    assert.equal((await client.waitForApproval(approval.id, 1)).answer, 'Deploy');
    assert.equal((await mcp('workspace_status', { section: 'approvals' })).approvals.length, 1);
    assert.equal((await mcp('workspace_status', { section: 'agents' })).agents.length, 1);
    const inbox = await client.createInbox();
    assert.equal((await mcp('inspect_webhook_inbox', { id: inbox.id })).id, inbox.id);
    await mcp('resource_request', {
        kind: 'inboxes',
        action: 'response',
        id: inbox.id,
        config: { status: 202, body: 'accepted' },
    });
    await mcp('resource_request', {
        kind: 'inboxes',
        action: 'response',
        id: inbox.id,
        config: { reset: true },
    });
    await mcp('resource_request', { kind: 'inboxes', action: 'deliveries', id: inbox.id });
    const mail = await mcp('resource_request', {
        kind: 'email-inboxes',
        action: 'create',
        ttlSeconds: 120,
    });
    await mcp('list_emails', { id: mail.id });
    await mcp('resource_request', { kind: 'email-inboxes', action: 'renew', id: mail.id });
    await mcp('resource_request', { kind: 'email-inboxes', action: 'delete', id: mail.id });
    const mock = await client.createMock(
        {
            name: 'Example',
            routes: [
                {
                    method: 'GET',
                    path: '/greeting',
                    status: 200,
                    body: 'hello',
                    contentType: 'text/plain',
                },
            ],
        },
        { visibility: 'public' },
    );
    assert.equal(
        await client.request('GET', `/mock/${mock.id}/greeting?message=hello+world&symbol=%23`),
        'hello',
    );
    await mcp('resource_request', { kind: 'mocks', action: 'calls', id: mock.id });
    await client.remove('mocks', mock.id);
    await client.remove('inboxes', inbox.id);
});

test('SDK rejects credential-leaking paths and CLI and SSH agree on commands requiring stdin', async () => {
    let called = false;
    const client = new SocketHelp({
        apiKey: 'secret',
        fetch: async () => {
            called = true;
            throw new Error('Must not fetch');
        },
    });
    for (const path of [
        'https://evil.test/api/x',
        '//evil.test/api/x',
        '/api/../private',
        '/api/%2e%2e/private',
        '/api/a%2fb',
        '/api/x#fragment',
        '/api/x\\evil',
    ])
        await assert.rejects(client.request('GET', path), /relative/);
    assert.equal(called, false);
    assert.equal(needsInput(['memory', 'set', 'build', 'last']), true);
    assert.equal(needsInput(['approval', 'ask']), true);
    assert.equal(needsInput(['monitor', 'create']), true);
    assert.equal(needsInput(['agent', 'token']), true);
    assert.equal(needsInput(['monitor', 'pause', 'id']), false);
    assert.equal(needsInput(['email', 'wait', 'id']), false);
});

test('HTTP reference includes the new agent operations and keeps human actions session-only', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const { paths } = (await app.inject('/api/openapi.json')).json();
    for (const path of [
        '/api/approvals',
        '/api/approvals/{id}/wait',
        '/api/email-inboxes',
        '/api/email-inboxes/{id}/messages',
        '/api/email-inboxes/{id}/renew',
        '/api/account/activity',
    ])
        assert.ok(paths[path], path);
    assert.deepEqual(paths['/api/approvals/{id}/answer'].post.security, [{ sessionCookie: [] }]);
    assert.ok(
        !paths['/api/monitors'].post.parameters?.some(
            (p: { name: string }) => p.name === 'ttlSeconds',
        ),
    );
    assert.ok(
        !paths['/api/email-inboxes'].post.parameters.some(
            (p: { name: string }) => p.name === 'visibility',
        ),
    );
});

test('the executable CLI uses stdin, exit codes and HTTP correctly', async (t) => {
    const { app, apiKey } = await fixture(t);
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    const run = (args: string[], input = '') =>
        new Promise<{ stdout: string; stderr: string; code: number }>((done) => {
            const child = execFile(
                process.execPath,
                [resolve('../packages/cli/dist/cli.js'), ...args],
                {
                    env: { ...process.env, SOCKET_HELP_URL: baseUrl, SOCKET_HELP_API_KEY: apiKey },
                    timeout: 10000,
                },
                (error, stdout, stderr) =>
                    done({ stdout, stderr, code: error ? Number(error.code) || 1 : 0 }),
            );
            child.stdin!.end(input);
        });
    assert.equal((await run(['memory', 'set', 'cli', 'last'], '{"passed":true}')).code, 0);
    const value = await run(['memory', 'get', 'cli', 'last']);
    assert.equal(value.code, 0, value.stderr);
    assert.deepEqual(JSON.parse(value.stdout).value, { passed: true });
    const invalid = await run(['memory', 'set', 'cli', 'last'], 'broken JSON');
    assert.equal(invalid.code, 1);
    assert.equal(invalid.stdout, '');
    assert.equal(typeof JSON.parse(invalid.stderr).error, 'string');
    const email = await run(['email', 'create']);
    assert.equal(email.code, 0, email.stderr);
    assert.match(JSON.parse(email.stdout).address, /@inbox.example.test$/);
});

test('invalid settings cannot reset a response and malformed MCP sections return validation errors', async (t) => {
    const { app, client, apiKey } = await fixture(t);
    const inbox = await client.createInbox({ visibility: 'public' });
    await client.setInboxResponse(inbox.id, { status: 202, body: 'kept' });
    for (const value of [false, 0, '', []]) {
        await assert.rejects(
            command(client, ['inbox', 'response', inbox.id], bytes(value)),
            /settings/,
        );
        assert.equal(
            (await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'check' }))
                .statusCode,
            202,
        );
    }
    await client.setInboxResponse(inbox.id, null);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'check' }))
            .statusCode,
        200,
    );
    for (const section of ['__proto__', 'constructor', 'missing']) {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: {
                authorization: `Bearer ${apiKey}`,
                accept: 'application/json, text/event-stream',
            },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'workspace_status', arguments: { section } },
            },
        });
        assert.equal(response.json().error.code, -32602, response.body);
    }
    await assert.rejects(command(client, ['toString', 'inspect', 'id']), /Unknown command/);
    const mock = await client.createMock(
        {
            name: 'HEAD example',
            routes: [
                {
                    method: 'GET',
                    path: '/item',
                    status: 200,
                    body: 'hello',
                    contentType: 'text/plain',
                },
            ],
        },
        { visibility: 'public' },
    );
    assert.equal(await client.request('HEAD', `/mock/${mock.id}/item`), undefined);
    assert.equal(await command(client, ['api', 'HEAD', `/mock/${mock.id}/item`]), undefined);
    assert.equal(needsInput(['api', 'HEAD', `/mock/${mock.id}/item`]), false);
});

test('SDK, CLI and MCP cannot access resources belonging to a different workspace', async (t) => {
    const { app, client, guest, fetcher } = await fixture(t);
    const email = await client.createEmailInbox();
    const monitor = await client.createMonitor({
        kind: 'heartbeat',
        name: 'Private monitor',
        intervalSeconds: 300,
    });
    const question = await client.askHuman({ question: 'Private question?' });
    await client.memorySet('private', 'key', { secret: true });
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'other-owner',
            email: 'other-owner@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const login = await guest.startLogin('Other agent');
    await app.inject({
        method: 'POST',
        url: `/api/agents/login/${login.userCode}/approve`,
        headers: { origin, cookie: String(registered.headers['set-cookie']).split(';')[0]! },
        payload: {},
    });
    const token = await guest.finishLogin(login.deviceCode);
    assert.equal(token.status, 'approved');
    if (token.status !== 'approved') throw new Error('Expected key');
    const other = new SocketHelp({ baseUrl: origin, apiKey: token.apiKey, fetch: fetcher });
    const denied = (error: unknown) => error instanceof SocketError && error.status === 404;
    await assert.rejects(other.emails(email.id), denied);
    await assert.rejects(other.memoryGet('private', 'key'), denied);
    await assert.rejects(other.monitor(monitor.id), denied);
    await assert.rejects(other.approval(question.id), denied);
    for (const args of [
        ['email', 'messages', email.id],
        ['monitor', 'delete', monitor.id],
        ['approval', 'inspect', question.id],
        ['memory', 'delete', 'private', 'key'],
    ])
        await assert.rejects(command(other, args), denied);
    for (const [name, args] of [
        ['list_emails', { id: email.id }],
        ['inspect_monitor', { id: monitor.id }],
        ['memory_get', { namespace: 'private', key: 'key' }],
    ] as const) {
        const response: { body: string; json(): { result: { isError: boolean } } } = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: {
                authorization: `Bearer ${token.apiKey}`,
                accept: 'application/json, text/event-stream',
            },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        assert.equal(response.json().result.isError, true, response.body);
    }
    assert.deepEqual((await client.memoryGet('private', 'key')).value, { secret: true });
    assert.equal((await client.monitor(monitor.id)).id, monitor.id);
});
