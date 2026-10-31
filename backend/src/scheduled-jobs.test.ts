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
        402,
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
