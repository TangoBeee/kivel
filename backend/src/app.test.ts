import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, MAX_BODY_BYTES } from './app.js';
import { InboxStore, INBOX_TTL_MS, MAX_INBOXES } from './inboxes.js';
import {
    CREATIONS_PER_MINUTE,
    RateLimiter,
    RATE_WINDOW_MS,
    REQUESTS_PER_MINUTE,
} from './rate-limit.js';

async function setup(t: TestContext, options: Parameters<typeof buildApp>[0] = {}) {
    const app = buildApp(options);
    t.after(() => app.close());
    const response = await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' });
    assert.equal(response.statusCode, 201);
    const inbox = response.json();
    return {
        app,
        inbox,
        hook: `/hooks/${inbox.id}`,
        history: `/api/inboxes/${inbox.id}/requests`,
        authorization: `Bearer ${inbox.inspectionToken}`,
    };
}

test('creates unique inbox credentials with a one-hour lifetime and a trusted webhook URL', async (t) => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const app = buildApp({
        publicBaseUrl: 'https://hooks.example.com',
        inboxStore: new InboxStore({ now: () => now }),
    });
    t.after(() => app.close());

    const response = await app.inject({
        method: 'POST',
        url: '/api/inboxes?visibility=public',
        headers: { host: 'untrusted.example.com' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['cache-control'], 'no-store');
    const inbox = response.json();
    assert.match(inbox.id, /^[0-9a-f-]{36}$/);
    assert.match(inbox.inspectionToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(inbox.webhookUrl, `https://hooks.example.com/hooks/${inbox.id}`);
    assert.equal(inbox.expiresAt, new Date(now + INBOX_TTL_MS).toISOString());
    assert.equal(inbox.inspectionTokenHash, undefined);

    const second = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    assert.notEqual(second.id, inbox.id);
    assert.notEqual(second.inspectionToken, inbox.inspectionToken);
});

test('bounds stored inboxes and reclaims capacity at expiration', async (t) => {
    let now = 0;
    const inboxStore = new InboxStore({ now: () => now });
    const app = buildApp({ inboxStore });
    t.after(() => app.close());

    for (let i = 0; i < MAX_INBOXES; i++) {
        assert.ok(inboxStore.create());
    }
    const full = await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' });
    assert.equal(full.statusCode, 503);

    now = INBOX_TTL_MS - 1;
    assert.equal(inboxStore.create(), null);
    now = INBOX_TTL_MS;
    const available = await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' });
    assert.equal(available.statusCode, 201);
});

test('captures exact JSON text, metadata, repeated query values, and redacted headers', async (t) => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const { app, hook, history, authorization, inbox } = await setup(t, {
        inboxStore: new InboxStore({ now: () => now }),
    });
    const body = '{\n  "event": "created"\n}';
    const captured = await app.inject({
        method: 'POST',
        url: `${hook}?tag=one&tag=two&empty=&message=hello+world`,
        headers: {
            'content-type': 'application/json',
            authorization: 'Bearer upstream-secret',
            cookie: 'session=private',
            'x-api-key': 'api-secret',
            'x-custom-token': 'custom-secret',
            'x-event-type': 'created',
        },
        payload: body,
    });
    assert.equal(captured.statusCode, 200);
    assert.equal(captured.json().received, true);

    const response = await app.inject({ url: history, headers: { authorization } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    const [request] = response.json().requests;
    assert.equal(request.id, captured.json().requestId);
    assert.equal(request.method, 'POST');
    assert.equal(request.path, hook);
    assert.equal(request.body, body);
    assert.equal(request.bodyEncoding, 'utf8');
    assert.equal(request.bodySize, Buffer.byteLength(body));
    assert.equal(request.timestamp, new Date(now).toISOString());
    assert.deepEqual(request.query, { tag: ['one', 'two'], empty: '', message: 'hello world' });
    for (const header of ['authorization', 'cookie', 'x-api-key', 'x-custom-token']) {
        assert.equal(request.headers[header], '[REDACTED]');
    }
    assert.equal(request.headers['x-event-type'], 'created');
    assert.equal(response.body.includes('upstream-secret'), false);
    assert.equal(response.body.includes(inbox.inspectionToken), false);
});

test('captures bodies and empty requests for all supported HTTP methods', async (t) => {
    const { app, hook, history, authorization } = await setup(t);
    const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
    for (const method of methods) {
        const response = await app.inject({
            method,
            url: hook,
            payload: `body for ${method}`,
            headers: { 'content-type': 'text/plain' },
        });
        assert.equal(response.statusCode, 200, `${method}: ${response.body}`);
        if (method === 'HEAD') assert.equal(response.body, '');
    }
    for (const method of methods) {
        const response = await app.inject({ method, url: hook });
        assert.equal(response.statusCode, 200, `${method}: ${response.body}`);
    }
    const requests = (await app.inject({ url: history, headers: { authorization } })).json()
        .requests;
    assert.equal(requests.length, methods.length * 2);
    for (const [index, method] of methods.entries()) {
        assert.equal(requests[index].method, method);
        assert.equal(requests[index].body, `body for ${method}`);
        assert.equal(requests[index + methods.length].bodySize, 0);
    }
});

test('preserves malformed JSON, XML, form data, and bodies without Content-Type', async (t) => {
    const { app, hook, history, authorization } = await setup(t);
    const fixtures = [
        { headers: { 'content-type': 'application/json' }, payload: '{broken json' },
        { headers: { 'content-type': 'application/xml' }, payload: '<event>sent</event>' },
        { headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'a=1&a=2' },
        { headers: {}, payload: 'plain body without a type' },
    ];
    for (const fixture of fixtures) {
        const response = await app.inject({ method: 'POST', url: hook, ...fixture });
        assert.equal(response.statusCode, 200, response.body);
    }
    const requests = (await app.inject({ url: history, headers: { authorization } })).json()
        .requests;
    assert.deepEqual(
        requests.map((request: { body: string }) => request.body),
        fixtures.map((item) => item.payload),
    );

    const invalidManagementBody = await app.inject({
        method: 'POST',
        url: '/api/inboxes?visibility=public',
        payload: '{broken json',
        headers: { 'content-type': 'application/json' },
    });
    assert.equal(invalidManagementBody.statusCode, 400);
});

test('binary bodies round-trip through base64 and UTF-8 bodies retain byte counts', async (t) => {
    const { app, hook, history, authorization } = await setup(t);
    const binary = Buffer.from([0, 255, 254, 128, 65]);
    const response = await app.inject({
        method: 'POST',
        url: hook,
        payload: binary,
        headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(response.statusCode, 200);
    await app.inject({
        method: 'POST',
        url: hook,
        payload: 'hello 👋',
        headers: { 'content-type': 'text/plain' },
    });
    const [first, second] = (await app.inject({ url: history, headers: { authorization } })).json()
        .requests;
    assert.equal(first.bodyEncoding, 'base64');
    assert.deepEqual(Buffer.from(first.body, 'base64'), binary);
    assert.equal(first.bodySize, binary.length);
    assert.equal(second.bodyEncoding, 'utf8');
    assert.equal(second.body, 'hello 👋');
    assert.equal(second.bodySize, Buffer.byteLength('hello 👋'));
});

test('inspection and deletion require the matching bearer token and reveal no inbox existence', async (t) => {
    const { app, inbox, history, authorization } = await setup(t);
    const other = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    for (const headers of [
        {},
        { authorization: 'Bearer wrong' },
        { authorization: `Bearer ${other.inspectionToken}` },
    ]) {
        const existing = await app.inject({ url: history, headers });
        const missing = await app.inject({ url: '/api/inboxes/unknown/requests', headers });
        assert.equal(existing.statusCode, 404);
        assert.equal(missing.statusCode, 404);
        // Same message either way; only the per-request ID differs.
        assert.equal(existing.json().error, missing.json().error);
        const deletion = await app.inject({
            method: 'DELETE',
            url: `/api/inboxes/${inbox.id}`,
            headers,
        });
        assert.equal(deletion.statusCode, 404);
    }
    const queryToken = await app.inject({ url: `${history}?token=${inbox.inspectionToken}` });
    assert.equal(queryToken.statusCode, 404);
    const valid = await app.inject({ url: history, headers: { authorization } });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.json(), { requests: [] });
});

test('deletion immediately removes history and prevents future captures', async (t) => {
    const { app, inbox, hook, history, authorization } = await setup(t);
    assert.equal(
        (await app.inject({ method: 'POST', url: hook, payload: 'saved' })).statusCode,
        200,
    );
    const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/inboxes/${inbox.id}`,
        headers: { authorization },
    });
    assert.equal(deleted.statusCode, 204);
    assert.equal(deleted.body, '');
    assert.equal((await app.inject({ url: history, headers: { authorization } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: hook })).statusCode, 404);
});

test('expiration is enforced on reads, writes, and deletion before periodic cleanup runs', async (t) => {
    let now = 0;
    const { app, inbox, hook, history, authorization } = await setup(t, {
        inboxStore: new InboxStore({ now: () => now }),
    });
    await app.inject({ method: 'POST', url: hook, payload: 'private' });
    now = INBOX_TTL_MS - 1;
    assert.equal((await app.inject({ url: history, headers: { authorization } })).statusCode, 200);
    now = INBOX_TTL_MS;
    assert.equal((await app.inject({ url: history, headers: { authorization } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: hook })).statusCode, 404);
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/inboxes/${inbox.id}`,
                headers: { authorization },
            })
        ).statusCode,
        404,
    );
});

test('oversized fixed-length and streamed bodies return 413 without recording partial data', async (t) => {
    const { app, hook, history, authorization } = await setup(t);
    const tooLarge = Buffer.alloc(MAX_BODY_BYTES + 1, 'a');
    for (const payload of [
        tooLarge,
        Readable.from([tooLarge.subarray(0, 50_000), tooLarge.subarray(50_000)]),
    ]) {
        const response = await app.inject({
            method: 'POST',
            url: hook,
            payload,
            headers: { 'content-type': 'application/octet-stream' },
        });
        assert.equal(response.statusCode, 413, response.body);
    }
    const valid = await app.inject({
        method: 'POST',
        url: hook,
        payload: Buffer.alloc(MAX_BODY_BYTES, 'b'),
    });
    assert.equal(valid.statusCode, 200);
    const requests = (await app.inject({ url: history, headers: { authorization } })).json()
        .requests;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].bodySize, MAX_BODY_BYTES);
});

test('inbox count and byte limits reject new captures without evicting existing history', async (t) => {
    const countLimited = await setup(t, { inboxStore: new InboxStore({ maxRequestsPerInbox: 2 }) });
    for (const payload of ['first', 'second']) {
        assert.equal(
            (await countLimited.app.inject({ method: 'POST', url: countLimited.hook, payload }))
                .statusCode,
            200,
        );
    }
    assert.equal(
        (
            await countLimited.app.inject({
                method: 'POST',
                url: countLimited.hook,
                payload: 'third',
            })
        ).statusCode,
        429,
    );
    const history = (
        await countLimited.app.inject({
            url: countLimited.history,
            headers: { authorization: countLimited.authorization },
        })
    ).json().requests;
    assert.deepEqual(
        history.map((request: { body: string }) => request.body),
        ['first', 'second'],
    );

    const byteLimited = await setup(t, { inboxStore: new InboxStore({ maxInboxBytes: 900 }) });
    assert.equal(
        (
            await byteLimited.app.inject({
                method: 'POST',
                url: byteLimited.hook,
                payload: 'a'.repeat(1000),
            })
        ).statusCode,
        429,
    );
});

test('global capture storage is reclaimed by authenticated deletion', async (t) => {
    const { app, hook, inbox, authorization } = await setup(t, {
        inboxStore: new InboxStore({ maxTotalBytes: 1400 }),
    });
    const other = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    const payload = 'a'.repeat(800);
    assert.equal((await app.inject({ method: 'POST', url: hook, payload })).statusCode, 200);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${other.id}`, payload })).statusCode,
        503,
    );
    await app.inject({
        method: 'DELETE',
        url: `/api/inboxes/${inbox.id}`,
        headers: { authorization },
    });
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${other.id}`, payload })).statusCode,
        200,
    );
});

test('global storage reclaims expired inboxes when a different live inbox receives a request', async (t) => {
    let now = 0;
    const { app, hook } = await setup(t, {
        inboxStore: new InboxStore({ now: () => now, maxTotalBytes: 1400 }),
    });
    const payload = 'a'.repeat(800);
    assert.equal((await app.inject({ method: 'POST', url: hook, payload })).statusCode, 200);
    now = 1000;
    const other = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })
    ).json();
    now = INBOX_TTL_MS;
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${other.id}`, payload })).statusCode,
        200,
    );
});

test('creation rate limits reset with Retry-After and forwarded headers cannot bypass them', async (t) => {
    let now = 0;
    const app = buildApp({ rateLimiter: new RateLimiter(() => now) });
    t.after(() => app.close());
    for (let i = 0; i < CREATIONS_PER_MINUTE; i++) {
        const created = await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' });
        assert.equal(created.statusCode, 201);
        const inbox = created.json();
        await app.inject({
            method: 'DELETE',
            url: `/api/inboxes/${inbox.id}`,
            headers: { authorization: `Bearer ${inbox.inspectionToken}` },
        });
    }
    const limited = await app.inject({
        method: 'POST',
        url: '/api/inboxes?visibility=public',
        headers: { 'x-forwarded-for': '192.0.2.123' },
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '60');
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/inboxes?visibility=public',
                remoteAddress: '192.0.2.124',
            })
        ).statusCode,
        201,
    );
    now = RATE_WINDOW_MS;
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/inboxes?visibility=public' })).statusCode,
        201,
    );
});

test('general IP rate limits apply to unknown routes while health checks remain available', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) {
        assert.equal((await app.inject({ url: '/missing' })).statusCode, 404);
    }
    const limited = await app.inject({
        url: '/missing',
        headers: { 'x-forwarded-for': '192.0.2.1' },
    });
    assert.equal(limited.statusCode, 429);
    assert.ok(Number(limited.headers['retry-after']) > 0);
    const health = await app.inject({ url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: 'ok' });
});

test('an inbox is rate limited across multiple sender IPs', async (t) => {
    const store = new InboxStore({ maxRequestsPerInbox: 200 });
    const inbox = store.create()!;
    const app = buildApp({ inboxStore: store });
    t.after(() => app.close());
    const hook = `/hooks/${inbox.id}`;
    for (let i = 0; i < REQUESTS_PER_MINUTE; i++) {
        assert.equal(
            (await app.inject({ method: 'POST', url: hook, remoteAddress: `192.0.2.${i + 1}` }))
                .statusCode,
            200,
        );
    }
    const limited = await app.inject({ method: 'POST', url: hook, remoteAddress: '192.0.2.200' });
    assert.equal(limited.statusCode, 429);
    assert.match(limited.json().error, /rate limit/);
    assert.ok(Number(limited.headers['retry-after']) > 0);
});

test('public URL configuration rejects ambiguous origins', () => {
    for (const publicBaseUrl of [
        'ftp://example.com',
        'https://user:secret@example.com',
        'https://example.com/path',
        'https://example.com?x=1',
        'https://example.com/#fragment',
    ]) {
        assert.throws(() => buildApp({ publicBaseUrl }), /PUBLIC_BASE_URL/);
    }
});

test('conditional inspection returns 304 until another request arrives', async (t) => {
    const { app, hook, history, authorization } = await setup(t);
    const first = await app.inject({ url: history, headers: { authorization } });
    const headers = { authorization, 'if-none-match': first.headers.etag! };
    assert.equal((await app.inject({ url: history, headers })).statusCode, 304);
    await app.inject({ method: 'POST', url: hook, payload: 'new event' });
    const updated = await app.inject({ url: history, headers });
    assert.equal(updated.statusCode, 200);
    assert.notEqual(updated.headers.etag, first.headers.etag);
    assert.equal(updated.json().requests.length, 1);
    const unauthenticated = await app.inject({
        url: history,
        headers: { 'if-none-match': updated.headers.etag! },
    });
    assert.equal(unauthenticated.statusCode, 404);
});

test('metadata is authenticated and reflects usage without exposing credentials', async (t) => {
    const { app, inbox, hook, authorization } = await setup(t);
    await app.inject({ method: 'POST', url: hook, payload: 'test' });
    const response = await app.inject({
        url: `/api/inboxes/${inbox.id}`,
        headers: { authorization },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().requestCount, 1);
    assert.equal(response.json().expiresAt, inbox.expiresAt);
    assert.ok(response.json().storedBytes > 0);
    assert.equal(response.body.includes(inbox.inspectionToken), false);
    assert.equal((await app.inject({ url: `/api/inboxes/${inbox.id}` })).statusCode, 404);
});

test('management rejects foreign origins while webhook senders remain unrestricted', async (t) => {
    const { app, hook } = await setup(t);
    const blocked = await app.inject({
        method: 'POST',
        url: '/api/inboxes?visibility=public',
        headers: { origin: 'https://attacker.example' },
    });
    assert.equal(blocked.statusCode, 403);
    const accepted = await app.inject({
        method: 'POST',
        url: hook,
        headers: { origin: 'https://sender.example' },
        payload: 'event',
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.headers['x-content-type-options'], 'nosniff');
    assert.equal(accepted.headers['referrer-policy'], 'no-referrer');
    assert.match(String(accepted.headers['content-security-policy']), /frame-ancestors 'none'/);
});

test('only configured proxy IPs can supply client addresses', async (t) => {
    const app = buildApp({ trustProxy: ['192.0.2.10'] });
    t.after(() => app.close());
    for (let i = 0; i < CREATIONS_PER_MINUTE; i++) {
        const headers = { 'x-forwarded-for': '198.51.100.1' };
        const created = await app.inject({
            method: 'POST',
            url: '/api/inboxes?visibility=public',
            remoteAddress: '192.0.2.10',
            headers,
        });
        assert.equal(created.statusCode, 201);
        const inbox = created.json();
        await app.inject({
            method: 'DELETE',
            url: `/api/inboxes/${inbox.id}`,
            remoteAddress: '192.0.2.10',
            headers: { ...headers, authorization: `Bearer ${inbox.inspectionToken}` },
        });
    }
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/inboxes?visibility=public',
                remoteAddress: '192.0.2.10',
                headers: { 'x-forwarded-for': '198.51.100.1' },
            })
        ).statusCode,
        429,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/inboxes?visibility=public',
                remoteAddress: '192.0.2.10',
                headers: { 'x-forwarded-for': '198.51.100.2' },
            })
        ).statusCode,
        201,
    );
});

test('readiness reports database failure independently of liveness', async (t) => {
    class UnavailableStore extends InboxStore {
        override ping(): void {
            throw new Error('private connection details');
        }
    }
    const app = buildApp({ inboxStore: new UnavailableStore() });
    t.after(() => app.close());
    assert.equal((await app.inject({ url: '/health' })).statusCode, 200);
    const readiness = await app.inject({ url: '/ready' });
    assert.equal(readiness.statusCode, 503);
    assert.equal(readiness.body.includes('private connection details'), false);
});

test('static hosting applies exact script hashes, immutable assets, and safe 404 handling', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'kivel-static-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const script = "console.log('trusted build script')";
    await writeFile(
        join(root, 'index.html'),
        `<html><body><script>${script}</script></body></html>`,
    );
    await writeFile(join(root, '404.html'), '<html><body>Page missing</body></html>');
    await writeFile(join(root, '.env'), 'PRIVATE_VALUE');
    await mkdir(join(root, '_next', 'static'), { recursive: true });
    await writeFile(join(root, '_next', 'static', 'test.js'), 'console.log(1)');
    const app = buildApp({ frontendDir: root });
    t.after(() => app.close());
    const response = await app.inject({ url: '/' });
    assert.equal(response.statusCode, 200);
    const expected = createHash('sha256').update(script).digest('base64');
    assert.ok(String(response.headers['content-security-policy']).includes(`'sha256-${expected}'`));
    assert.equal(
        String(response.headers['content-security-policy']).includes(
            "script-src 'self' 'unsafe-inline'",
        ),
        false,
    );
    assert.match(
        String((await app.inject({ url: '/_next/static/test.js' })).headers['cache-control']),
        /immutable/,
    );
    assert.equal((await app.inject({ url: '/.env' })).statusCode, 404);
    const missing = await app.inject({ url: '/missing', headers: { accept: 'text/html' } });
    assert.equal(missing.statusCode, 404);
    assert.match(missing.body, /Page missing/);
    const api = await app.inject({ url: '/api/missing', headers: { accept: 'text/html' } });
    assert.equal(api.statusCode, 404);
    assert.match(String(api.headers['content-type']), /application\/json/);
});

test('OpenAPI exposes the configured origin and all resource operations', async (t) => {
    const { app } = await setup(t, { publicBaseUrl: 'https://example.com' });
    const response = await app.inject({ url: '/api/openapi.json' });
    assert.equal(response.statusCode, 200);
    const spec = response.json();
    assert.equal(spec.openapi, '3.1.0');
    assert.equal(spec.servers[0].url, 'https://example.com');
    assert.ok(spec.paths['/api/inboxes'].post);
    assert.ok(spec.paths['/api/inboxes/{id}'].delete);
    assert.ok(spec.paths['/api/inboxes/{id}/requests'].get.security);
});

test('each static page permits only its own inline scripts and missing pages use the 404 policy', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'kivel-page-csp-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'tools', 'example'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<html><script>window.home=true</script></html>');
    await writeFile(
        join(root, 'tools', 'example', 'index.html'),
        '<html><script>window.tool=true</script></html>',
    );
    await writeFile(join(root, '404.html'), '<html><script>window.missing=true</script></html>');
    const app = buildApp({ frontendDir: root });
    t.after(() => app.close());
    const csp = (script: string) => createHash('sha256').update(script).digest('base64');
    const home = await app.inject({ url: '/' });
    const tool = await app.inject({ url: '/tools/example/' });
    assert.ok(String(home.headers['content-security-policy']).includes(csp('window.home=true')));
    assert.ok(!String(home.headers['content-security-policy']).includes(csp('window.tool=true')));
    assert.ok(String(tool.headers['content-security-policy']).includes(csp('window.tool=true')));
    assert.ok(String(tool.headers['content-security-policy']).length < 1024);
    const missing = await app.inject({ url: '/missing', headers: { accept: 'text/html' } });
    assert.ok(
        String(missing.headers['content-security-policy']).includes(csp('window.missing=true')),
    );
});

test('every JSON error carries the request ID, including route and resource lookups', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    for (const url of ['/api/does-not-exist', '/mcp/00000000-0000-4000-8000-000000000000']) {
        const response = await app.inject({ method: 'POST', url, payload: {} });
        assert.ok(response.statusCode >= 400, url);
        const body = response.json();
        assert.equal(typeof body.error, 'string', url);
        assert.equal(body.requestId, response.headers['x-request-id'], url);
    }
});

test('generic webhook capture keeps extended methods, nested paths, exact queries and raw content types', async (t) => {
    const { app, inbox, authorization, history, hook } = await setup(t);
    const cases = [
        ['GET', '', 'text/plain'],
        ['HEAD', '', 'text/plain'],
        ['POST', '{"hello":"world"}', 'application/json'],
        ['PUT', 'name=Alex&tag=a&tag=b', 'application/x-www-form-urlencoded'],
        ['PATCH', '<event><name>created</name></event>', 'application/xml'],
        ['DELETE', 'deleted', 'text/plain'],
        ['OPTIONS', '', 'text/plain'],
        ['TRACE', '', 'text/plain'],
        ['PROPFIND', '<propfind/>', 'application/xml'],
    ];
    for (const [method, body, type] of cases) {
        const response = await app.inject({
            method: method as 'POST',
            url: `${hook}/any/provider/here?b=two+words&a=%2F&tag=a&tag=b`,
            headers: { 'content-type': type! },
            ...(body ? { payload: body } : {}),
        });
        assert.equal(response.statusCode, 200, response.body);
    }
    const boundary = 'kivel-test-boundary';
    const multipart = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="label"\r\n\r\nfixture\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        Buffer.from([0, 255, 128]),
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: hook + '/uploads',
                headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
                payload: multipart,
            })
        ).statusCode,
        200,
    );
    const binary = Buffer.from([0, 255, 128, 32, 10]);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: hook + '/binary',
                headers: { 'content-type': 'application/octet-stream' },
                payload: binary,
            })
        ).statusCode,
        200,
    );
    const requests = (await app.inject({ url: history, headers: { authorization } })).json()
        .requests;
    assert.equal(requests.length, cases.length + 2);
    for (let i = 0; i < cases.length; i++) {
        assert.equal(requests[i].method, cases[i]![0]);
        assert.equal(requests[i].path, `${hook}/any/provider/here`);
        assert.equal(requests[i].rawQuery, 'b=two+words&a=%2F&tag=a&tag=b');
        assert.deepEqual(requests[i].query.tag, ['a', 'b']);
    }
    assert.deepEqual(Buffer.from(requests.at(-2).body, 'base64'), multipart);
    assert.deepEqual(Buffer.from(requests.at(-1).body, 'base64'), binary);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id.slice(0, -1)}x/path`,
                payload: 'x',
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: hook + '/too-big',
                payload: 'x'.repeat(MAX_BODY_BYTES + 1),
            })
        ).statusCode,
        413,
    );
});

test('the app host uses its own export, CSP and browser sessions while public APIs keep their URLs', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'kivel-hosts-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const publicOrigin = 'https://kivel.example';
    const appOrigin = 'https://app.kivel.example';
    const publicHeaders = { host: 'kivel.example' };
    const appHeaders = { host: 'app.kivel.example' };
    for (const site of ['public', 'app']) {
        const dir = join(root, site);
        await mkdir(join(dir, 'webhooks'), { recursive: true });
        await mkdir(join(dir, '_next', 'static'), { recursive: true });
        await writeFile(
            join(dir, 'webhooks', 'index.html'),
            `<script>window.site = '${site}'</script>`,
        );
        await writeFile(join(dir, '_next', 'static', 'site.js'), `window.site = '${site}'`);
        await writeFile(join(dir, '404.html'), `${site} not found`);
    }
    await mkdir(join(root, 'public', 'account'));
    await writeFile(join(root, 'public', 'account', 'index.html'), 'Legacy account bridge');
    const app = buildApp({
        publicBaseUrl: publicOrigin,
        appBaseUrl: appOrigin,
        frontendDir: join(root, 'public'),
        dashboardDir: join(root, 'app'),
        production: true,
        authSecret: 'dual-host-test-payments-auth-secret',
        trustProxy: ['127.0.0.1'],
    });
    t.after(() => app.close());
    for (const [site, headers] of [
        ['public', publicHeaders],
        ['app', appHeaders],
    ] as const) {
        const response = await app.inject({ url: '/webhooks/', headers });
        const script = `window.site = '${site}'`;
        const hash = createHash('sha256').update(script).digest('base64');
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, `<script>${script}</script>`);
        assert.ok(String(response.headers['content-security-policy']).includes(`'sha256-${hash}'`));
        const asset = await app.inject({ url: '/_next/static/site.js', headers });
        assert.equal(asset.body, script);
        assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
    }
    const missing = await app.inject({
        url: '/account/',
        headers: { ...appHeaders, accept: 'text/html' },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body, 'app not found');
    assert.equal(missing.headers['x-robots-tag'], 'noindex, nofollow, nosnippet');
    assert.equal(
        (await app.inject({ url: '/account/?resource=example', headers: publicHeaders })).body,
        'Legacy account bridge',
    );
    assert.equal(
        (await app.inject({ url: '/webhooks/', headers: { host: 'unknown.example' } })).statusCode,
        421,
    );
    for (const [path, expected] of [
        ['/plans/?ref=guide', '/pricing/?ref=guide'],
        ['/approve/?id=example', `${appOrigin}/approve/?id=example`],
        ['/link/?code=example', `${appOrigin}/link/?code=example`],
        ['/app/webhooks/?id=example', `${appOrigin}/webhooks/?id=example`],
        ['/app//unknown.example/', `${appOrigin}//unknown.example/`],
    ] as const) {
        const moved = await app.inject({ url: path, headers: publicHeaders });
        assert.equal(moved.statusCode, 308);
        assert.equal(moved.headers.location, expected);
    }
    const payload = {
        username: 'host-test',
        password: 'local fixture password',
        email: 'host@example.com',
    };
    const auth = { method: 'POST', url: '/api/auth/register', payload } as const;
    assert.equal(
        (await app.inject({ ...auth, headers: { ...publicHeaders, origin: publicOrigin } }))
            .statusCode,
        403,
    );
    assert.equal((await app.inject({ ...auth, headers: appHeaders })).statusCode, 403);
    const agent = await app.inject({
        method: 'POST',
        url: '/api/agents/login',
        headers: publicHeaders,
        payload: { name: 'Host test agent' },
    });
    assert.equal(agent.statusCode, 201, agent.body);
    assert.match(agent.json().verificationUrl, /^https:\/\/app\.kivel\.example\/link\/\?code=/);
    const registered = await app.inject({ ...auth, headers: { ...appHeaders, origin: appOrigin } });
    assert.equal(registered.statusCode, 201, registered.body);
    const session = String(registered.headers['set-cookie']);
    assert.match(
        session,
        /^__Host-kivel_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/,
    );
    const cookie = session.split(';', 1)[0]!;
    assert.equal(
        (await app.inject({ url: '/api/account', headers: { ...appHeaders, cookie } })).statusCode,
        200,
    );
    assert.equal(
        (
            await app.inject({
                url: '/api/account',
                headers: { ...publicHeaders, cookie, 'x-forwarded-host': appHeaders.host },
            })
        ).statusCode,
        401,
    );
    for (const origin of [undefined, publicOrigin]) {
        const result = await app.inject({
            method: 'POST',
            url: '/api/inboxes',
            headers: { ...appHeaders, cookie, ...(origin ? { origin } : {}) },
        });
        assert.equal(result.statusCode, 403);
    }
    const key = await app.inject({
        method: 'POST',
        url: '/api/account/keys',
        headers: { ...appHeaders, cookie, origin: appOrigin },
        payload: { name: 'host test', scopes: ['resources:write'] },
    });
    assert.equal(key.statusCode, 201, key.body);
    const created = await app.inject({
        method: 'POST',
        url: '/api/inboxes?visibility=public',
        headers: { ...publicHeaders, authorization: `Bearer ${key.json().key}` },
    });
    assert.equal(created.statusCode, 201, created.body);
    const rpc = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...publicHeaders, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'start_login', arguments: { name: 'MCP host test' } },
        },
    });
    assert.equal(rpc.statusCode, 200, rpc.body);
    const login = JSON.parse(rpc.json().result.content[0].text);
    assert.match(login.verificationUrl, /^https:\/\/app\.kivel\.example\/link\//);
    const human = { ...appHeaders, cookie, origin: appOrigin };
    const approved = await app.inject({
        method: 'POST',
        url: `/api/agents/login/${login.userCode}/approve`,
        headers: human,
        payload: {},
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const exchanged = await app.inject({
        method: 'POST',
        url: '/api/agents/token',
        headers: publicHeaders,
        payload: { deviceCode: login.deviceCode },
    });
    assert.equal(exchanged.statusCode, 200, exchanged.body);
    assert.equal(exchanged.json().mcp.url, `${publicOrigin}/mcp`);
    const wallet = await app.inject({
        method: 'POST',
        url: '/api/test-wallets',
        headers: human,
        payload: {
            name: 'Test wallet',
            balance: 10,
            perPaymentLimit: 5,
            dailyLimit: 10,
            approvalThreshold: 5,
        },
    });
    assert.equal(wallet.statusCode, 201, wallet.body);
    const paywall = await app.inject({
        method: 'POST',
        url: '/api/test-paywalls',
        headers: human,
        payload: {
            name: 'Test paywall',
            amount: 1,
            response: { status: 200, body: { unlocked: true } },
        },
    });
    assert.equal(paywall.statusCode, 201, paywall.body);
    const paid = await app.inject({
        method: 'POST',
        url: `/api/test-wallets/${wallet.json().id}/pay`,
        headers: human,
        payload: { payee: paywall.json().endpointUrl, idempotencyKey: 'dual-host-payment' },
    });
    assert.equal(paid.statusCode, 200, paid.body);
    assert.deepEqual(paid.json().content, { unlocked: true });
    const path = new URL(created.json().webhookUrl).pathname;
    assert.equal(created.json().webhookUrl, publicOrigin + path);
    assert.equal(
        (await app.inject({ method: 'POST', url: path, headers: publicHeaders })).statusCode,
        200,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: path, headers: appHeaders })).statusCode,
        404,
    );
});
