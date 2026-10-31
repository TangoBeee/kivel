import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
async function account(app: ReturnType<typeof buildApp>, username: string) {
    const origin = 'http://localhost:3000';
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
            payload: { name: 'Status' },
        })
    ).json();
    return { authorization: `Bearer ${key.key}` };
}
test('status pages publish only selected owned monitors, escape content and enforce private caller access', async (t) => {
    const app = buildApp({
        monitorChecks: {
            http: async () => ({ status: 200, body: 'ok' }),
            tls: async () => ({ authorized: true, daysUntilExpiry: 30 }),
            webhook: async () => {},
        },
    });
    t.after(() => app.close());
    const headers = await account(app, 'status-owner'),
        other = await account(app, 'status-other');
    const monitor = (
        await app.inject({
            method: 'POST',
            url: '/api/monitors',
            headers,
            payload: {
                kind: 'http',
                name: 'API <script>alert(1)</script>',
                target: 'https://example.com/private-target',
                intervalSeconds: 300,
            },
        })
    ).json();
    const create = (auth: Record<string, string>, visibility: string) =>
        app.inject({
            method: 'POST',
            url: `/api/status-pages?visibility=${visibility}`,
            headers: auth,
            payload: {
                name: 'Status <img src=x>',
                description: 'Team & services',
                monitorIds: [monitor.id],
            },
        });
    assert.equal((await create(other, 'public')).statusCode, 404);
    const response = await create(headers, 'private');
    assert.equal(response.statusCode, 201, response.body);
    const page = response.json();
    assert.equal((await app.inject({ url: `/status/${page.id}` })).statusCode, 404);
    await app.runMonitors();
    const published = await app.inject({
        url: `/status/${page.id}`,
        headers: { 'x-access-token': page.accessToken },
    });
    assert.equal(published.statusCode, 200, published.body);
    assert.match(published.body, /Operational/);
    assert.match(published.body, /&lt;script&gt;/);
    assert.doesNotMatch(published.body, /<script>|private-target|alertWebhook/);
    assert.equal(published.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(
        (await app.inject({ url: `/api/status-pages/${page.id}`, headers: other })).statusCode,
        404,
    );
    const publicPage = (await create(headers, 'public')).json();
    assert.equal((await app.inject({ url: `/status/${publicPage.id}` })).statusCode, 200);
    await app.inject({ method: 'DELETE', url: `/api/status-pages/${page.id}`, headers });
    assert.equal(
        (
            await app.inject({
                url: `/status/${page.id}`,
                headers: { 'x-access-token': page.accessToken },
            })
        ).statusCode,
        404,
    );
});
