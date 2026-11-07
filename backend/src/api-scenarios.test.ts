import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleScenario, validateScenario, expandScenario } from '@kivel.io/tools/api-scenarios';
import type { ApiScenario } from '@kivel.io/tools/api-scenarios';
import { runScenario } from './api-scenarios.js';
import type { publicRequest } from './public-network.js';
import { buildApp } from './app.js';

const fixture = (): ApiScenario => ({
    ...structuredClone(sampleScenario),
    baseUrl: 'https://example.com',
});
const response = (url: string, body: unknown = { ready: true }, status = 200) => ({
    url,
    status,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
    truncated: false,
    address: '93.184.216.34',
    timings: { dnsMs: 1, responseMs: 2, totalMs: 3 },
});

test('scenario validation rejects unsafe templates, credential exports and unbounded jobs before sending', async () => {
    for (const change of [
        (s: ApiScenario) => {
            s.requests = [];
        },
        (s: ApiScenario) => {
            s.requests = Array(7).fill(s.requests[0]);
        },
        (s: ApiScenario) => {
            s.requests[0]!.path = '//attacker.com/path';
        },
        (s: ApiScenario) => {
            s.requests[0]!.path = '/{{missing}}';
        },
        (s: ApiScenario) => {
            s.requests[0]!.path = '/?api_key=literal';
        },
        (s: ApiScenario) => {
            s.requests[0]!.headers = { authorization: 'Bearer literal-token' };
        },
        (s: ApiScenario) => {
            s.requests[0]!.headers = { host: 'attacker.com' };
        },
        (s: ApiScenario) => {
            s.requests[0]!.headers = { 'x-forwarded-host': 'attacker.com' };
        },
        (s: ApiScenario) => {
            s.requests[0]!.body = 'body on GET';
        },
        (s: ApiScenario) => {
            s.variables = { apiKey: 'literal' };
        },
        (s: ApiScenario) => {
            s.requests[0]!.extract = { name: 'token', path: 'access_token' };
        },
        (s: ApiScenario) => {
            s.requests[0]!.expect.json = { path: 'constructor.name', equals: 'x' };
        },
    ]) {
        const scenario = fixture();
        change(scenario);
        assert.throws(() => validateScenario(scenario));
    }
    const secretUrl = fixture();
    secretUrl.secretNames = ['token'];
    secretUrl.requests[0]!.path = '/{{token}}';
    assert.throws(() => validateScenario(secretUrl), /only.*headers/);
    const privateTarget = fixture();
    privateTarget.baseUrl = 'http://127.0.0.1';
    await assert.rejects(
        runScenario(JSON.stringify(privateTarget), '{}', new AbortController().signal, async () => {
            assert.fail('Unsafe destination was contacted');
        }),
        /Private/,
    );
    await assert.rejects(runScenario('{}', '{}', new AbortController().signal), /version 1/);
    const malformedSecret = fixture();
    await assert.rejects(
        runScenario(
            JSON.stringify(malformedSecret),
            'exposed-test-value',
            new AbortController().signal,
        ),
        (error) => error instanceof Error && !error.message.includes('exposed-test-value'),
    );
});

test('scenarios run sequentially, capture JSON fields and escape substitutions in JSON strings', async () => {
    const scenario = fixture();
    scenario.variables = { label: 'Ada "quoted"' };
    scenario.requests[0] = {
        ...scenario.requests[0]!,
        path: '/items',
        expect: { status: 200 },
        extract: { name: 'itemId', path: 'items.0.id' },
    };
    scenario.requests[1] = {
        ...scenario.requests[1]!,
        path: '/items/{{itemId}}',
        method: 'PATCH',
        body: '{"name":"{{label}}"}',
        expect: { status: 200, json: { path: 'ready', equals: true } },
    };
    const calls: string[] = [];
    const report = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async (url, _signal, options) => {
            calls.push(url);
            if (calls.length === 1) return response(url, { items: [{ id: 'item_1' }] });
            assert.deepEqual(JSON.parse(options!.requestBody!), { name: 'Ada "quoted"' });
            return response(url);
        },
    );
    assert.deepEqual(calls, ['https://example.com/items', 'https://example.com/items/item_1']);
    assert.equal(report.passed, true);
    assert.equal(report.completed, 2);
    assert.equal(report.results[0]!.captured, 'itemId');
    assert.equal(expandScenario('value={{x}}', { x: '$&' }), 'value=$&');
});

test('scenario secrets stay in headers and are removed from echoed JSON, headers and plain-text reports', async () => {
    const scenario = fixture(),
        secret = 'secret-"quoted"-value';
    scenario.secretNames = ['token'];
    scenario.requests = [
        {
            ...scenario.requests[0]!,
            name: secret,
            path: '/echo',
            headers: { authorization: 'Bearer {{token}}' },
            expect: { status: 200 },
        },
    ];
    const report = await runScenario(
        JSON.stringify(scenario),
        JSON.stringify({ token: secret }),
        new AbortController().signal,
        async (url, _signal, options) => {
            assert.equal(options!.headers!.authorization, `Bearer ${secret}`);
            return {
                ...response(url, {
                    echo: secret,
                    token: 'server-generated-token',
                    nested: { password: 'private' },
                }),
                headers: {
                    'set-cookie': 'session=hidden',
                    'x-echo': JSON.stringify(secret),
                    location: `https://example.com/${encodeURIComponent(secret)}`,
                },
            };
        },
    );
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes('server-generated-token'));
    assert.ok(!serialized.includes('session=hidden'));
    assert.ok(!serialized.includes('quoted'));
    assert.match(serialized, /REDACTED/);
    assert.equal(report.passed, true);
});

test('failed assertions, truncation, extraction and request errors produce a report with explicit skipped steps', async () => {
    const scenario = fixture();
    scenario.requests[0]!.expect = { status: 201 };
    let calls = 0;
    const send: typeof publicRequest = async (url) => {
        calls++;
        return response(url);
    };
    const stopped = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        send,
    );
    assert.equal(calls, 1);
    assert.equal(stopped.passed, false);
    assert.equal(stopped.results[1]!.outcome, 'skipped');
    scenario.stopOnFailure = false;
    scenario.requests[0]!.expect = { status: 200 };
    scenario.requests[1]!.expect = { status: 200 };
    const continued = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async (url) => ({ ...response(url), truncated: true }),
    );
    assert.equal(continued.completed, 2);
    assert.ok(continued.results.every((result) => result.outcome === 'failed'));
    const unavailable = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async () => {
            throw new Error('remote secret error');
        },
    );
    assert.equal(unavailable.results[0]!.error?.includes('remote secret'), false);
    assert.equal(unavailable.completed, 2);
    await assert.rejects(
        runScenario(JSON.stringify(scenario), '{}', AbortSignal.abort(), send),
        /cancelled/,
    );
});

test('captured values cannot change the destination origin or inject headers', async () => {
    const scenario = fixture();
    scenario.requests[0] = {
        ...scenario.requests[0]!,
        path: '/items',
        expect: { status: 200 },
        extract: { name: 'itemId', path: 'id' },
    };
    scenario.requests[1] = {
        ...scenario.requests[1]!,
        path: '/{{itemId}}',
        expect: { status: 200 },
    };
    let calls = 0;
    const report = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async (url) => {
            calls++;
            return response(url, { id: '/attacker.com/anything' });
        },
    );
    assert.equal(calls, 1);
    assert.equal(report.passed, false);
    assert.equal(report.results[1]!.outcome, 'failed');
});

test('scenario descriptors are discoverable and anonymous scenario runs require sign-in without consuming runs', async () => {
    const app = buildApp();
    try {
        const descriptor = (await app.inject('/api/tools/mock-apis-api-test-scenarios')).json();
        assert.equal(descriptor.status, 'available');
        assert.equal(JSON.parse(descriptor.guide.inputExample).version, 1);
        const result = await app.inject({
            method: 'POST',
            url: '/api/tools/mock-apis-api-test-scenarios/run',
            payload: { input: '{}' },
        });
        assert.equal(result.statusCode, 401);
        assert.equal((await app.inject('/api/usage')).json().runsToday, 0);
    } finally {
        await app.close();
    }
});

test('scenario checks preserve large numeric source values and keep non-secret token metrics visible', async () => {
    const scenario = fixture();
    scenario.variables = { tokenCount: '16' };
    scenario.requests = [
        {
            ...scenario.requests[0]!,
            path: '/metrics',
            expect: { status: 200, json: { path: 'usage.total_tokens', equals: 16 } },
        },
    ];
    const metrics = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async (url) => response(url, { usage: { total_tokens: 16, tokenCount: 16 } }),
    );
    assert.equal(metrics.passed, true);
    assert.match(metrics.results[0]!.body!, /"total_tokens": 16/);
    const precise = await runScenario(
        JSON.stringify(scenario),
        '{}',
        new AbortController().signal,
        async (url) => ({
            ...response(url),
            body: Buffer.from('{"id":9007199254740993,"usage":{"total_tokens":16}}'),
        }),
    );
    assert.equal(precise.passed, false);
    assert.match(precise.results[0]!.body!, /9007199254740993/);
    assert.ok(
        precise.results[0]!.checks.some((check) => /precision/.test(check.label) && !check.passed),
    );
});
