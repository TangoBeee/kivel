import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter, RATE_WINDOW_MS } from './rate-limit.js';
import { clientKey } from './security.js';

test('bounds tracked keys by evicting the oldest window, never refusing a new client', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now, 2);
    assert.equal(limiter.consume('one', 1), 0);
    assert.equal(limiter.consume('two', 1), 0);
    // Full: the oldest window ("one") is forgotten so "three" is still served.
    assert.equal(limiter.consume('three', 1), 0);
    assert.equal(limiter.consume('two', 1), 60);
    assert.equal(limiter.consume('three', 1), 60);
    now = RATE_WINDOW_MS;
    assert.equal(limiter.consume('two', 1), 0);
});

test('client keys collapse IPv6 addresses to their /64 so one host cannot rotate past limits', () => {
    assert.equal(clientKey('203.0.113.7'), '203.0.113.7');
    assert.equal(clientKey('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(clientKey('2001:db8:1:2:aaaa::1'), clientKey('2001:db8:1:2:ffff::9'));
    assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
});
