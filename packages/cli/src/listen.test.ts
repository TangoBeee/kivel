import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kivel, type CapturedRequest } from '@kivel.io/sdk';
import { forwardHeaders, forwardTarget, listen } from './listen.js';

const request: CapturedRequest = {
    id: 'r1',
    method: 'POST',
    path: '/hooks/abc/events/stripe',
    headers: {
        host: 'kivel.io',
        'content-type': 'application/json',
        'x-signature': 'sig',
        'x-forwarded-for': '1.2.3.4',
        'cf-ray': 'x',
        authorization: 'Bearer secret',
        'x-multi': ['a', 'b'],
    },
    query: { page: '2', tag: ['x', 'y'] },
    body: '{}',
    bodyEncoding: 'utf8',
    bodySize: 2,
    timestamp: '2026-10-29T00:00:00.000Z',
};

test('forwarded requests keep their path suffix and query on the local target', () => {
    assert.equal(
        forwardTarget('http://localhost:3000/webhooks/', 'abc', request).href,
        'http://localhost:3000/webhooks/events/stripe?page=2&tag=x&tag=y',
    );
    assert.equal(
        forwardTarget('http://localhost:3000', 'abc', { ...request, path: '/hooks/abc', query: {} })
            .href,
        'http://localhost:3000/',
    );
});

test('forwarded headers drop proxy, hop-by-hop and credential headers', () => {
    const headers = forwardHeaders(request);
    assert.equal(headers.get('x-signature'), 'sig');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('x-multi'), 'a, b');
    for (const name of ['host', 'x-forwarded-for', 'cf-ray', 'authorization'])
        assert.equal(headers.get(name), null);
});

test('the client parses split event frames and resumes with credentials in headers', async () => {
    const encoder = new TextEncoder();
    const chunks = [
        'id: first\r\nevent: re',
        'ady\r\ndata: {}\r\n\r\n: keepalive\n\n',
        'id: second\nevent: change\ndata: {"topic":"webhook","scopeId":"abc","id":"1","event":"webhook.request.created"}\n\n',
    ];
    const client = new Kivel({
        apiKey: 'local-key',
        fetch: async (url, options) => {
            assert.equal(new URL(String(url)).searchParams.get('topics'), 'webhook:abc');
            assert.ok(!String(url).includes('inspection-token'));
            const headers = new Headers(options?.headers);
            assert.equal(headers.get('authorization'), 'Bearer local-key');
            assert.equal(headers.get('x-resource-token'), 'inspection-token');
            assert.equal(headers.get('last-event-id'), 'previous-cursor');
            return new Response(
                new ReadableStream({
                    start(controller) {
                        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                        controller.close();
                    },
                }),
                { headers: { 'content-type': 'text/event-stream' } },
            );
        },
    });
    const events = [];
    for await (const event of client.stream(['webhook:abc'], {
        token: 'inspection-token',
        lastEventId: 'previous-cursor',
    }))
        events.push(event);
    assert.deepEqual(events, [
        { type: 'ready', cursor: 'first' },
        {
            type: 'change',
            cursor: 'second',
            topic: 'webhook',
            scopeId: 'abc',
            id: '1',
            event: 'webhook.request.created',
        },
    ]);
});

test('the webhook listener reads captures on a notice and falls back on older servers', async () => {
    for (const legacy of [false, true]) {
        const controller = new AbortController();
        const paths: string[] = [];
        const lines: object[] = [];
        const client = new Kivel({
            fetch: async (target) => {
                const url = new URL(String(target));
                paths.push(url.pathname);
                if (url.pathname === '/api/stream') {
                    if (legacy)
                        return Response.json({ error: 'Route not found.' }, { status: 404 });
                    return new Response('id: ready\nevent: ready\ndata: {}\n\n', {
                        headers: { 'content-type': 'text/event-stream' },
                    });
                }
                assert.equal(url.pathname, '/api/inboxes/abc/wait');
                if (!legacy) assert.equal(url.searchParams.get('timeoutSeconds'), '1');
                return Response.json({ timedOut: false, requests: [request] });
            },
        });
        await listen(
            client,
            'abc',
            { all: true },
            (line) => {
                lines.push(line);
                if (lines.length === 2) controller.abort();
            },
            controller.signal,
        );
        assert.deepEqual(paths, ['/api/stream', '/api/inboxes/abc/wait']);
        assert.deepEqual(lines[1], { event: 'request', request });
    }
});
