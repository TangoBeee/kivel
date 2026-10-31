import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryMonitors } from './monitors.js';
import type { Monitor, MonitorChecks } from './monitors.js';

const origin = 'http://localhost:3000';
async function account(app: ReturnType<typeof buildApp>, username: string) {
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username,
            email: `${username}@example.test`,
            password: 'correct-horse-battery-staple',
        },
    });
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin, cookie },
            payload: { name: 'monitors' },
        })
    ).json();
    return { authorization: `Bearer ${key.key}` };
}

test('uptime monitors confirm failures before alerting and announce recovery', async (t) => {
    const store = new MemoryMonitors();
    let status = 200;
    const alerts: { status: string; message: string }[] = [];
    const checks: MonitorChecks = {
        http: async () => ({ status, body: 'ok healthy' }),
        tls: async () => ({ authorized: true, daysUntilExpiry: 40 }),
        webhook: async (_url, body) => {
            alerts.push(JSON.parse(body));
        },
    };
    const app = buildApp({ monitorStore: store, monitorChecks: checks });
    t.after(() => app.close());
    const headers = await account(app, 'uptime');
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/monitors', payload: { kind: 'http' } }))
            .statusCode,
        401,
    );
    const create = (payload: object) =>
        app.inject({ method: 'POST', url: '/api/monitors', headers, payload });
    assert.equal(
        (await create({ kind: 'http', name: 'x', target: 'http://10.0.0.1/' })).statusCode,
        400,
    );
    assert.equal(
        (await create({ kind: 'http', name: 'x', target: 'http://localhost:3000/' })).statusCode,
        400,
    );
    assert.equal(
        (
            await create({
                kind: 'http',
                name: 'x',
                target: 'https://example.com',
                intervalSeconds: 60,
            })
        ).statusCode,
        400,
    );
    const created = await create({
        kind: 'http',
        name: 'Homepage',
        target: 'https://example.com/health',
        expectText: 'healthy',
        alertWebhook: 'https://hooks.example.com/alerts',
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    // Make the only monitor due now, as if its interval had passed.
    const due = () => {
        const [monitor] = (
            store as unknown as { monitors: Map<string, Monitor> }
        ).monitors.values();
        store.save({ ...monitor!, nextRunAt: new Date(Date.now() - 1000).toISOString() });
    };
    await app.runMonitors();
    const read = async () => (await app.inject({ url: `/api/monitors/${id}`, headers })).json();
    assert.equal((await read()).status, 'up');
    assert.equal(alerts.length, 0);
    status = 503;
    due();
    await app.runMonitors();
    assert.equal((await read()).status, 'up');
    due();
    await app.runMonitors();
    const down = await read();
    assert.equal(down.status, 'down');
    assert.equal(down.events[0].status, 'down');
    assert.deepEqual(
        alerts.map((alert) => alert.status),
        ['down'],
    );
    status = 200;
    due();
    await app.runMonitors();
    assert.equal((await read()).status, 'up');
    assert.deepEqual(
        alerts.map((alert) => alert.status),
        ['down', 'up'],
    );
    const listed = (await app.inject({ url: '/api/monitors', headers })).json();
    assert.equal(listed.limit, 20);
    assert.equal(listed.monitors[0].accountId, undefined);
});

test('heartbeat monitors go down without pings, accept /fail and recover on the next ping', async (t) => {
    const store = new MemoryMonitors();
    const app = buildApp({
        monitorStore: store,
        monitorChecks: {
            http: async () => ({ status: 200, body: '' }),
            tls: async () => ({ authorized: true, daysUntilExpiry: 40 }),
            webhook: async () => {},
        },
    });
    t.after(() => app.close());
    const headers = await account(app, 'heartbeat');
    const created = (
        await app.inject({
            method: 'POST',
            url: '/api/monitors',
            headers,
            payload: { kind: 'heartbeat', name: 'Nightly backup', intervalSeconds: 3600 },
        })
    ).json();
    const ping = new URL(created.pingUrl).pathname;
    assert.equal((await app.inject({ url: ping })).json().status, 'up');
    assert.equal(
        (await app.inject({ url: '/ping/unknown-token-unknown-token-1234' })).statusCode,
        404,
    );
    const [monitor] = (store as unknown as { monitors: Map<string, Monitor> }).monitors.values();
    store.save({
        ...monitor!,
        lastPingAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
    });
    await app.runMonitors();
    const read = async () =>
        (await app.inject({ url: `/api/monitors/${created.id}`, headers })).json();
    assert.equal((await read()).status, 'down');
    assert.equal((await app.inject({ method: 'POST', url: ping })).json().status, 'up');
    assert.equal((await app.inject({ url: `${ping}/fail` })).json().status, 'down');
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/monitors/${created.id}`, headers }))
            .statusCode,
        204,
    );
    assert.equal((await app.inject({ url: ping })).statusCode, 404);
});

test('agents create, list and delete monitors over MCP', async (t) => {
    const app = buildApp({
        monitorChecks: {
            http: async () => ({ status: 200, body: '' }),
            tls: async () => ({ authorized: true, daysUntilExpiry: 40 }),
            webhook: async () => {},
        },
    });
    t.after(() => app.close());
    const headers = await account(app, 'mcp-monitors');
    const call = async (name: string, args: object) =>
        JSON.parse(
            (
                await app.inject({
                    method: 'POST',
                    url: '/mcp',
                    headers: {
                        ...headers,
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                    },
                    payload: {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name, arguments: args },
                    },
                })
            ).json().result.content[0].text,
        );
    const created = await call('create_monitor', {
        kind: 'ssl',
        name: 'Cert',
        target: 'example.com',
    });
    assert.equal(created.target, 'https://example.com/');
    assert.equal(created.sslDays, 14);
    assert.equal((await call('list_monitors', {})).monitors.length, 1);
    assert.equal((await call('delete_monitor', { id: created.id })).deleted, true);
    assert.equal((await call('list_monitors', {})).monitors.length, 0);
});

test('DNS monitors retain baselines, confirm changes, expose probe timings and let the owner accept expected records', async (t) => {
    const store = new MemoryMonitors();
    let records = ['1 1.1.1.1'];
    const checks: MonitorChecks = {
        http: async () => ({ status: 200, body: 'ok' }),
        tls: async () => ({ authorized: true, daysUntilExpiry: 50 }),
        dns: async () => [...records],
        webhook: async () => {},
    };
    const app = buildApp({ monitorStore: store, monitorChecks: checks });
    t.after(() => app.close());
    const headers = await account(app, 'dns-monitor');
    const response = await app.inject({
        method: 'POST',
        url: '/api/monitors',
        headers,
        payload: {
            kind: 'dns',
            name: 'Application DNS',
            target: 'example.com',
            dnsRecordType: 'A',
        },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().id;
    const accountId = (await app.inject({ url: '/api/account', headers })).json().account.id;
    const due = async () => {
        const current = store.get(accountId, id)!;
        store.save({ ...current, nextRunAt: new Date(Date.now() - 1000).toISOString() });
    };
    await due();
    await app.runMonitors();
    let current = (await app.inject({ url: `/api/monitors/${id}`, headers })).json();
    assert.equal(current.status, 'up');
    assert.deepEqual(current.dnsBaseline, records);
    assert.equal(typeof current.lastDurationMs, 'number');
    assert.equal(current.recentChecks.length, 1);
    records = ['1 8.8.8.8'];
    await due();
    await app.runMonitors();
    await due();
    await app.runMonitors();
    current = (await app.inject({ url: `/api/monitors/${id}`, headers })).json();
    assert.equal(current.status, 'down');
    assert.deepEqual(current.lastDnsAnswers, records);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/api/monitors/${id}/accept-dns` })).statusCode,
        401,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: `/api/monitors/${id}/accept-dns`, headers }))
            .statusCode,
        200,
    );
    current = (await app.inject({ url: `/api/monitors/${id}`, headers })).json();
    assert.deepEqual(current.dnsBaseline, records);
    assert.equal(current.status, 'up');
});
