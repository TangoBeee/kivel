import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapturedRequest } from '@socket-help/sdk';
import { forwardHeaders, forwardTarget } from './listen.js';

const request: CapturedRequest = {
    id: 'r1',
    method: 'POST',
    path: '/hooks/abc/events/stripe',
    headers: {
        host: 'socket.help',
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
