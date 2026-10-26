import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterRequests } from './request-filter';
import type { CapturedRequest } from './api';

const first: CapturedRequest = {
    id: 'first',
    method: 'POST',
    path: '/hooks/example/orders',
    headers: { 'content-type': 'application/json', 'x-label': ['alpha', 'beta'] },
    query: { stage: ['draft', 'paid'] },
    body: '{"event":"order.created","id":"test-42"}',
    bodyEncoding: 'utf8',
    bodySize: 40,
    timestamp: '2026-10-27T00:00:00Z',
};
const second: CapturedRequest = {
    ...first,
    id: 'second',
    method: 'GET',
    path: '/hooks/example/health',
    body: 'dGVzdC00Mg==',
    bodyEncoding: 'base64',
    headers: {},
    query: {},
};

test('request search combines method and selected field without decoding binary bodies', () => {
    assert.deepEqual(
        filterRequests([first, second], '').map((item) => item.id),
        ['second', 'first'],
    );
    assert.deepEqual(filterRequests([first, second], '  ORDER.CREATED  '), [first]);
    assert.deepEqual(filterRequests([first, second], 'beta', 'POST', 'headers'), [first]);
    assert.deepEqual(filterRequests([first, second], 'PAID', 'all', 'query'), [first]);
    assert.deepEqual(filterRequests([first, second], 'orders', 'GET'), []);
    assert.deepEqual(filterRequests([first, second], 'test-42', 'all', 'path'), []);
    assert.deepEqual(filterRequests([first, second], 'dGVzdC00Mg==', 'all', 'body'), []);
    assert.deepEqual(filterRequests([first, second], '[', 'all', 'body'), []);
    assert.equal(first.id, 'first');
});
