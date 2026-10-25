import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';
import { ResourceStore, RESOURCE_TTL_MS } from './resources.js';
import { validateMock, mockPayload } from './resource-routes.js';
import { validateCrud, executeCrud, initialCrud } from '@socket-help/tools/mock-crud';

const config = {
    name: 'Task API',
    routes: [],
    crud: {
        path: '/items',
        seed: [
            { id: 'a', name: 'Alpha', priority: 2 },
            { id: 'b', name: 'Beta', priority: 1 },
        ],
    },
};
test('CRUD mocks isolate callers, preserve seed data and support complete record lifecycles', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const created = await app.inject({ method: 'POST', url: '/api/mocks', payload: config });
    assert.equal(created.statusCode, 201, created.body);
    const resource = created.json(),
        url = `/mock/${resource.id}/items`,
        headers = { 'x-access-token': resource.accessToken };
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.equal(
        (
            await app.inject({
                url,
                headers: { authorization: `Bearer ${resource.managementToken}` },
            })
        ).statusCode,
        404,
    );
    const first = await app.inject({ url: `${url}?sort=priority&limit=1`, headers });
    assert.equal(first.json().data[0].id, 'b');
    assert.equal(first.json().total, 2);
    const added = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: { name: 'Created task', active: true },
    });
    assert.equal(added.statusCode, 201);
    assert.equal(added.headers['x-mock-revision'], '1');
    const id = added.json().id;
    const patch = await app.inject({
        method: 'PATCH',
        url: `${url}/${id}`,
        headers: { ...headers, 'x-mock-if-revision': '1' },
        payload: { name: 'Changed', nested: { ready: true } },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().active, true);
    const stale = await app.inject({
        method: 'DELETE',
        url: `${url}/${id}`,
        headers: { ...headers, 'x-mock-if-revision': '1' },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.headers['x-mock-revision'], '2');
    const replaced = await app.inject({
        method: 'PUT',
        url: `${url}/${id}`,
        headers,
        payload: { name: 'Replacement' },
    });
    assert.equal(replaced.statusCode, 200);
    assert.equal(replaced.json().active, undefined);
    assert.equal(
        (
            await app.inject({
                method: 'PATCH',
                url: `${url}/${id}`,
                headers,
                payload: { id: 'different' },
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url, headers, payload: { id: 'a' } })).statusCode,
        409,
    );
    const metadata = (
        await app.inject({
            url: `/api/mocks/${resource.id}`,
            headers: { authorization: `Bearer ${resource.managementToken}` },
        })
    ).json();
    assert.deepEqual(metadata.crud.seed, config.crud.seed);
    assert.equal(metadata.crudState.records.length, 3);
    assert.equal(
        (await app.inject({ method: 'POST', url: `/api/mocks/${resource.id}/reset`, headers }))
            .statusCode,
        404,
    );
    const reset = await app.inject({
        method: 'POST',
        url: `/api/mocks/${resource.id}/reset`,
        headers: { authorization: `Bearer ${resource.managementToken}` },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().revision, 4);
    assert.equal((await app.inject({ url: `${url}/${id}`, headers })).statusCode, 404);
    const head = await app.inject({ method: 'HEAD', url, headers });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    const preflight = await app.inject({
        method: 'OPTIONS',
        url,
        headers: { origin: 'https://app.example.com', 'access-control-request-method': 'PATCH' },
    });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], '*');
    assert.equal(
        (await app.inject({ url: `${url}?offset=1&limit=1&q=alpha`, headers })).json().total,
        1,
    );
});
test('CRUD mutations are atomic and invalid JSON, unsafe objects and unsupported queries do not alter records', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const resource = (
        await app.inject({ method: 'POST', url: '/api/mocks?visibility=public', payload: config })
    ).json();
    const url = `/mock/${resource.id}/items`;
    const results = await Promise.all(
        Array.from({ length: 10 }, (_, n) =>
            app.inject({ method: 'PATCH', url: `${url}/a`, payload: { [`field${n}`]: n } }),
        ),
    );
    assert.ok(results.every((result) => result.statusCode === 200));
    const row = (await app.inject(`${url}/a`)).json();
    for (let n = 0; n < 10; n++) assert.equal(row[`field${n}`], n);
    const simultaneous = await Promise.all(
        [1, 2].map(() =>
            app.inject({ method: 'POST', url, payload: { id: 'same', name: 'unique' } }),
        ),
    );
    assert.deepEqual(simultaneous.map((result) => result.statusCode).sort(), [201, 409]);
    const before = (await app.inject(url)).json();
    for (const body of ['{"id":9007199254740993}', '{"__proto__":{"bad":true}}', '[]', '{'])
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url,
                    headers: { 'content-type': 'application/json' },
                    payload: body,
                })
            ).statusCode,
            400,
        );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url,
                headers: { 'content-type': 'text/plain' },
                payload: '{}',
            })
        ).statusCode,
        415,
    );
    assert.equal((await app.inject(`${url}?limit=0`)).statusCode, 400);
    assert.equal((await app.inject(`${url}?unknown=value`)).statusCode, 400);
    assert.equal((await app.inject(url)).json().revision, before.revision);
});
test('CRUD validation bounds records, rejects ambiguous routes, and expiry reclaims the resource', async (t) => {
    assert.throws(
        () =>
            validateMock({
                ...config,
                routes: [{ method: 'GET', path: '/items/:id', status: 200, body: 'x' }],
            }),
        /reserved/,
    );
    assert.throws(
        () =>
            validateMock({
                ...config,
                crud: { ...config.crud, seed: [{ id: 'same' }, { id: 'same' }] },
            }),
        /unique/,
    );
    assert.throws(() => validateCrud({ path: '/../private', seed: [] }));
    assert.throws(() =>
        validateCrud({
            path: '/items',
            seed: [{ nested: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }],
        }),
    );
    const normalized = validateCrud({ path: '/items', seed: [{ name: 'without ID' }] });
    assert.equal(normalized.seed[0]!.id, 'seed_1');
    const full = initialCrud(
        validateCrud({
            path: '/items',
            seed: Array.from({ length: 200 }, (_, i) => ({ id: `i_${i}` })),
        }),
    );
    assert.equal(
        executeCrud(normalized, full, {
            method: 'POST',
            path: '/items',
            query: {},
            body: { name: 'overflow' },
        }).status,
        409,
    );
    let now = Date.now();
    const store = new ResourceStore(() => now);
    const app = buildApp({ resourceStore: store });
    t.after(() => app.close());
    const resource = (
        await app.inject({ method: 'POST', url: '/api/mocks?visibility=public', payload: config })
    ).json();
    now += RESOURCE_TTL_MS + 1;
    assert.equal((await app.inject(`/mock/${resource.id}/items`)).statusCode, 404);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/mocks/${resource.id}/reset`,
                headers: { authorization: `Bearer ${resource.managementToken}` },
            })
        ).statusCode,
        404,
    );
});
test('CRUD capacity failures roll back data and management tokens never bypass private caller access', () => {
    const store = new ResourceStore(Date.now, 2000);
    const resource = store.create('mock', mockPayload(validateMock(config)))!;
    const before = store.read(resource.id, 'mock', resource.managementToken)!;
    const result = store.mutateMock(resource.id, {}, (payload) => ({
        payload: { ...payload, huge: 'x'.repeat(4000) },
        result: true,
    }));
    assert.equal(result, 'full');
    assert.deepEqual(store.read(resource.id, 'mock', resource.managementToken), before);
});

test('owned CRUD mutations require workspace write access and MCP creates the same seeded resource', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const signup = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'crud_owner',
            email: 'crud-owner@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    assert.equal(signup.statusCode, 201, signup.body);
    const cookie = String(signup.headers['set-cookie']).split(';')[0]!;
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin, cookie },
            payload: { name: 'Read only', scopes: ['resources:read'] },
        })
    ).json();
    const created = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks',
            headers: { origin, cookie },
            payload: config,
        })
    ).json();
    assert.equal(
        (
            await app.inject({
                url: `/mock/${created.id}/items`,
                headers: { authorization: `Bearer ${key.key}` },
            })
        ).statusCode,
        200,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/mock/${created.id}/items`,
                headers: { authorization: `Bearer ${key.key}` },
                payload: { name: 'blocked' },
            })
        ).statusCode,
        404,
    );
    const rpc = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
        },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'create_mock_api', arguments: config },
        },
    });
    const result = JSON.parse(rpc.json().result.content[0].text);
    assert.ok(result.id, JSON.stringify(result));
    assert.equal(
        (
            await app.inject({
                url: `/mock/${result.id}/items`,
                headers: { 'x-access-token': result.accessToken },
            })
        ).json().total,
        2,
    );
});

test('CRUD config replacement advances revisions and MCP shares caller authorization', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const resource = (
        await app.inject({ method: 'POST', url: '/api/mocks', payload: config })
    ).json();
    const headers = { 'x-access-token': resource.accessToken };
    const path = `/mock/${resource.id}/items`;
    const update = await app.inject({
        method: 'PUT',
        url: `/api/mocks/${resource.id}`,
        headers: { 'x-resource-token': resource.managementToken },
        payload: config,
    });
    assert.equal(update.statusCode, 204, update.body);
    const stale = await app.inject({
        method: 'POST',
        url: path,
        headers: { ...headers, 'x-mock-if-revision': '0' },
        payload: { name: 'Stale' },
    });
    assert.equal(stale.statusCode, 409);
    const rpc = async (name: string, args: Record<string, unknown>) => {
        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        return response.json().result;
    };
    const denied = await rpc('call_mock_api', {
        id: resource.id,
        method: 'POST',
        path: '/items',
        accessToken: resource.managementToken,
        body: { name: 'Denied' },
    });
    assert.equal(denied.isError, true);
    const added = await rpc('call_mock_api', {
        id: resource.id,
        method: 'POST',
        path: '/items',
        accessToken: resource.accessToken,
        revision: 1,
        body: { name: 'MCP record' },
    });
    const value = JSON.parse(added.content[0].text);
    assert.equal(value.status, 201, JSON.stringify(added));
    assert.equal(value.revision, 2);
    const reset = await rpc('resource_request', {
        kind: 'mocks',
        action: 'reset',
        id: resource.id,
        token: resource.managementToken,
    });
    assert.equal(JSON.parse(reset.content[0].text).revision, 3);
    assert.equal((await app.inject({ url: path, headers })).json().total, 2);
    for (const replacement of [
        { name: 'Static', routes: [{ method: 'GET', path: '/hello', status: 200, body: 'hello' }] },
        config,
    ]) {
        assert.equal(
            (
                await app.inject({
                    method: 'PUT',
                    url: `/api/mocks/${resource.id}`,
                    headers: { 'x-resource-token': resource.managementToken },
                    payload: replacement,
                })
            ).statusCode,
            204,
        );
    }
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: path,
                headers: { ...headers, 'x-mock-if-revision': '0' },
                payload: { name: 'Old draft' },
            })
        ).statusCode,
        409,
    );
});

test('CRUD scenario exports validate and never carry credentials', async () => {
    const { crudScenario } = await import('@socket-help/tools/mock-crud');
    const { validateScenario } = await import('@socket-help/tools/api-scenarios');
    const draft = validateScenario(
        crudScenario('f6145e69-817a-463d-a882-fce4655ae6e1', '/tasks', 'https://socket.help', true),
    );
    assert.equal(draft.requests.length, 5);
    assert.deepEqual(draft.secretNames, ['accessToken']);
    assert.equal(draft.requests[0]?.headers['x-access-token'], '{{accessToken}}');
    assert.equal(draft.requests[4]?.expect.status, 404);
});
