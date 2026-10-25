import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { ResourceStore, RESOURCE_TTL_MS, MAX_FILE_BYTES } from './resources.js';
import { validateMock } from './resource-routes.js';

const config = {
    name: 'Users API',
    routes: [
        {
            method: 'GET',
            path: '/users/:id',
            status: 201,
            body: '{"id":42}',
            headers: { 'Content-Type': 'application/json', 'X-Mock-Test': 'yes' },
            delayMs: 0,
        },
    ],
};
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

test('mock lifecycle supports paths, methods, updates, private metadata and immediate deletion', async (t) => {
    const app = buildApp({ publicBaseUrl: 'https://example.com' });
    t.after(() => app.close());
    const create = await app.inject({
        method: 'POST',
        url: '/api/mocks?visibility=public',
        payload: config,
    });
    assert.equal(create.statusCode, 201);
    const resource = create.json();
    assert.equal(resource.endpointUrl, `https://example.com/mock/${resource.id}`);
    const called = await app.inject({ url: `/mock/${resource.id}/users/42?active=true` });
    assert.equal(called.statusCode, 201);
    assert.deepEqual(called.json(), { id: 42 });
    assert.equal(called.headers['x-mock-test'], 'yes');
    assert.match(String(called.headers['content-security-policy']), /sandbox/);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/mock/${resource.id}/users/42` })).statusCode,
        404,
    );
    assert.equal((await app.inject({ url: `/api/mocks/${resource.id}` })).statusCode, 404);
    const metadata = await app.inject({
        url: `/api/mocks/${resource.id}`,
        headers: auth(resource.managementToken),
    });
    assert.equal(metadata.statusCode, 200);
    assert.equal(metadata.json().uses, 2);
    assert.equal(metadata.json().managementToken, undefined);
    const update = await app.inject({
        method: 'PUT',
        url: `/api/mocks/${resource.id}`,
        headers: auth(resource.managementToken),
        payload: { ...config, routes: [{ ...config.routes[0], status: 204 }] },
    });
    assert.equal(update.statusCode, 204);
    const empty = await app.inject({ url: `/mock/${resource.id}/users/8` });
    assert.equal(empty.statusCode, 204);
    assert.equal(empty.body, '');
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/mocks/${resource.id}`,
                headers: auth(resource.managementToken),
            })
        ).statusCode,
        204,
    );
    assert.equal((await app.inject({ url: `/mock/${resource.id}/users/8` })).statusCode, 404);
});

test('mock configuration rejects active content, unsafe headers, ambiguous paths and excessive delay', () => {
    for (const patch of [
        { headers: { 'Set-Cookie': 'session=bad' } },
        { headers: { 'Content-Type': 'text/html' } },
        { headers: { 'X-Mock-Test': 'bad\r\nCookie: x' } },
        { path: '/../../secret' },
        { delayMs: 2001 },
        { status: 101 },
    ]) {
        assert.throws(() =>
            validateMock({ ...config, routes: [{ ...config.routes[0], ...patch }] }),
        );
    }
    assert.throws(() => validateMock({ ...config, routes: [config.routes[0], config.routes[0]] }));
});

test('files round-trip exact bytes with forced attachment, private metadata and deletion', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const bytes = Buffer.from([0, 255, 1, 0, 128]);
    const created = await app.inject({
        method: 'POST',
        url: '/api/files?visibility=public',
        headers: {
            'content-type': 'application/octet-stream',
            'x-file-name': encodeURIComponent('résumé.html'),
        },
        payload: bytes,
    });
    assert.equal(created.statusCode, 201);
    const file = created.json();
    assert.equal(file.size, bytes.length);
    assert.equal(file.remainingDownloads, 100);
    const download = await app.inject({ url: `/files/${file.id}` });
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, bytes);
    assert.match(String(download.headers['content-disposition']), /^attachment;/);
    assert.match(
        String(download.headers['content-disposition']),
        /filename\*=UTF-8''r%C3%A9sum%C3%A9.html/,
    );
    assert.equal(download.headers['content-type'], 'application/octet-stream');
    assert.equal((await app.inject({ url: `/api/files/${file.id}` })).statusCode, 404);
    const metadata = await app.inject({
        url: `/api/files/${file.id}`,
        headers: auth(file.managementToken),
    });
    assert.equal(metadata.json().remainingDownloads, 99);
    assert.equal(metadata.json().data, undefined);
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/files/${file.id}`,
                headers: auth(file.managementToken),
            })
        ).statusCode,
        204,
    );
    assert.equal((await app.inject({ url: `/files/${file.id}` })).statusCode, 404);
});

test('file upload validates names, media type and the 10 MiB limit', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/files?visibility=public',
                headers: { 'content-type': 'application/octet-stream' },
                payload: 'x',
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/files?visibility=public',
                headers: { 'content-type': 'text/html', 'x-file-name': 'x' },
                payload: 'x',
            })
        ).statusCode,
        415,
    );
    const large = await app.inject({
        method: 'POST',
        url: '/api/files?visibility=public',
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'large.bin' },
        payload: Buffer.alloc(MAX_FILE_BYTES + 1),
    });
    assert.equal(large.statusCode, 413);
    assert.match(large.json().error, /10240 KiB/);
});

test('temporary resource quotas, download counts, credentials and expiration are enforced', () => {
    let now = 100000;
    const store = new ResourceStore(() => now, 2048, 1);
    const first = store.create('file', { name: 'x', size: 1 }, Buffer.from('x'))!;
    assert.equal(store.create('mock', { routes: [] }), null);
    assert.equal(store.read(first.id, 'file', 'wrong'), undefined);
    assert.equal(store.read(first.id, 'mock', first.managementToken), undefined);
    assert.ok(store.use(first.id, 'file', 1));
    assert.equal(store.use(first.id, 'file', 1), undefined);
    now += RESOURCE_TTL_MS;
    assert.equal(store.read(first.id, 'file', first.managementToken), undefined);
    assert.equal(store.use(first.id, 'file'), undefined);
    assert.ok(store.create('mock', { name: 'replacement' }));
});
