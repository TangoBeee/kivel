import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryJobs } from './scheduled-jobs.js';
async function account(app: ReturnType<typeof buildApp>, name: string) {
    const result = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin: 'http://localhost:3000' },
        payload: {
            username: name,
            email: `${name}@example.test`,
            password: 'correct-horse-battery-staple',
        },
    });
    const cookie = String(result.headers['set-cookie']).split(';')[0]!;
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin: 'http://localhost:3000', cookie },
            payload: { name: 'Jobs' },
        })
    ).json();
    return { authorization: `Bearer ${key.key}` };
}
test('scheduled callbacks retry with stable IDs, expose events and isolate workspaces', async (t) => {
    const store = new MemoryJobs(),
        calls: string[] = [];
    let status = 503;
    const app = buildApp({
        jobStore: store,
        jobSend: async (_url, _body, id) => {
            calls.push(id);
            return status;
        },
    });
    t.after(() => app.close());
    const headers = await account(app, 'scheduler'),
        other = await account(app, 'other-jobs');
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/scheduled-jobs', payload: {} })).statusCode,
        401,
    );
    for (const url of [
        'http://localhost:3000/callback',
        'http://169.254.169.254/',
        'https://example.com/cb?token=secret',
    ]) {
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/scheduled-jobs',
                    headers,
                    payload: { name: 'bad', url, delaySeconds: 10 },
                })
            ).statusCode,
            400,
        );
    }
    const created = await app.inject({
        method: 'POST',
        url: '/api/scheduled-jobs?ttlSeconds=3600',
        headers,
        payload: {
            name: 'Callback',
            url: 'https://example.com/hook',
            body: { event: 'ready' },
            delaySeconds: 10,
            intervalSeconds: 300,
            maxRuns: 2,
        },
    });
    assert.equal(created.statusCode, 201, created.body);
    const job = created.json(),
        now = Date.parse(job.nextRunAt);
    assert.equal(
        (await app.inject({ url: `/api/scheduled-jobs/${job.id}`, headers: other })).statusCode,
        404,
    );
    await app.runScheduledJobs(now + 1);
    assert.equal((await store.get(job.id))?.events[0]?.status, 503);
    const retry = Date.parse((await store.get(job.id))!.nextRunAt!);
    await Promise.all([app.runScheduledJobs(retry + 1), app.runScheduledJobs(retry + 1)]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0], calls[1]);
    status = 204;
    await app.runScheduledJobs(Date.parse((await store.get(job.id))!.nextRunAt!) + 1);
    assert.equal((await store.get(job.id))?.remaining, 1);
    const events = await app.inject({
        method: 'POST',
        url: '/api/events/wait',
        headers,
        payload: { sources: [{ kind: 'job', id: job.id }], timeoutSeconds: 1 },
    });
    assert.equal(events.statusCode, 200, events.body);
    assert.equal(events.json().events[0].deliveries.length, 3);
    await app.runScheduledJobs(Date.parse((await store.get(job.id))!.nextRunAt!) + 1);
    assert.equal((await store.get(job.id))?.status, 'completed');
    assert.notEqual(calls.at(-1), calls[0]);
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/scheduled-jobs/${job.id}`, headers }))
            .statusCode,
        204,
    );
    assert.equal(
        (await app.inject({ url: `/api/scheduled-jobs/${job.id}`, headers })).statusCode,
        404,
    );
});

test('cron jobs pause and retain their scheduled tick across retries', async (t) => {
    const seen: string[] = [];
    const app = buildApp({
        jobSend: async (_url, _body, id) => {
            seen.push(id);
            return seen.length === 1 ? 503 : seen.length === 2 ? 422 : 204;
        },
    });
    t.after(() => app.close());
    const headers = await account(app, 'cron-owner');
    const other = await account(app, 'cron-other');
    const base = {
        name: 'Cron callback',
        url: 'https://example.com/callback',
        cron: '*/15 * * * *',
        timezone: 'Asia/Kolkata',
        maxRuns: 2,
    };
    const create = (payload: object) =>
        app.inject({
            method: 'POST',
            url: '/api/scheduled-jobs?ttlSeconds=86400',
            headers,
            payload,
        });
    assert.equal((await create({ ...base, cron: '* * * * *' })).statusCode, 400);
    assert.equal((await create({ ...base, timezone: 'Mars/Valley' })).statusCode, 400);
    assert.equal((await create({ ...base, delaySeconds: 10 })).statusCode, 400);
    const created = await create(base);
    assert.equal(created.statusCode, 201, created.body);
    const job = created.json();
    const path = '/api/scheduled-jobs/' + job.id;
    const tick = Date.parse(job.nextRunAt);
    assert.equal(tick % 900000, 0);
    const pause = (paused: boolean) =>
        app.inject({ method: 'PATCH', url: path, headers, payload: { paused } });
    assert.equal((await pause(true)).json().paused, true);
    await app.runScheduledJobs(tick + 10);
    assert.equal(seen.length, 0);
    assert.equal((await pause(false)).json().paused, false);
    await app.runScheduledJobs(tick + 10);
    await app.runScheduledJobs(tick + 60011);
    const runs = (await app.inject({ url: path + '/runs', headers })).json().runs;
    assert.equal(runs.length, 2);
    assert.deepEqual(
        runs.map((run: { scheduledFor: string }) => run.scheduledFor),
        [job.nextRunAt, job.nextRunAt],
    );
    assert.equal(runs[0].deliveryId, runs[1].deliveryId);
    const saved = (await app.inject({ url: path, headers })).json();
    assert.equal(Date.parse(saved.nextRunAt), tick + 900000);
    await app.runScheduledJobs(tick + 900010);
    assert.notEqual(seen[2], seen[1]);
    assert.equal((await app.inject({ url: path, headers })).json().status, 'completed');

    assert.equal((await app.inject({ url: path + '/runs', headers: other })).statusCode, 404);
});

test('cron uses the configured timezone across daylight saving changes', async () => {
    const { parseCron } = await import('@kivel.io/tools/cron');
    const schedule = parseCron('0 9 * * *', 'America/New_York', '2026-03-07T00:00:00Z');
    assert.deepEqual(
        schedule.take(3).map((date) => date.toISOString()),
        ['2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z'],
    );
});
