import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
const privateHeaders = (token: string) => ({ 'x-access-token': token });
const management = (token: string) => ({ authorization: `Bearer ${token}` });
test('private files isolate download access from management, other resources, and metadata', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const upload = async (visibility: string) => {
        const response = await app.inject({
            method: 'POST',
            url: visibility === 'default' ? '/api/files' : `/api/files?visibility=${visibility}`,
            headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'private.txt' },
            payload: 'private contents',
        });
        assert.equal(response.statusCode, 201, response.body);
        return response.json();
    };
    const a = await upload('default'),
        b = await upload('private');
    assert.notEqual(a.accessToken, a.managementToken);
    assert.notEqual(a.accessToken, b.accessToken);
    for (const headers of [
        {},
        management(a.managementToken),
        privateHeaders(b.accessToken),
        { 'x-access-token': 'wrong' },
    ]) {
        assert.equal((await app.inject({ url: `/files/${a.id}`, headers })).statusCode, 404);
        assert.equal(
            (await app.inject({ method: 'HEAD', url: `/files/${a.id}`, headers })).statusCode,
            404,
        );
        assert.equal((await app.inject({ url: `/files/${a.id}/info`, headers })).statusCode, 404);
    }
    assert.equal(
        (await app.inject({ url: `/api/files/${a.id}`, headers: management(a.accessToken) }))
            .statusCode,
        404,
    );
    const info = (
        await app.inject({ url: `/api/files/${a.id}`, headers: management(a.managementToken) })
    ).json();
    assert.equal(info.uses, 0);
    assert.equal(info.accessToken, undefined);
    assert.equal(info.accessHash, undefined);
    assert.equal(new URL(a.downloadUrl).search, '');
    assert.equal(new URL(a.downloadUrl).hash, '');
    for (const key of ['token', 'accessToken', 'access_token']) {
        const query = new URLSearchParams({ [key]: a.accessToken });
        for (const path of [`/files/${a.id}`, `/files/${a.id}/info`])
            assert.equal((await app.inject({ url: `${path}?${query}` })).statusCode, 404);
    }
    const authorized = privateHeaders(a.accessToken);
    assert.equal(
        (await app.inject({ method: 'HEAD', url: `/files/${a.id}`, headers: authorized }))
            .statusCode,
        200,
    );
    assert.equal(
        (await app.inject({ url: `/files/${a.id}/info`, headers: authorized })).json()
            .remainingDownloads,
        100,
    );
    assert.equal(
        (await app.inject({ url: `/files/${a.id}`, headers: authorized })).body,
        'private contents',
    );
    assert.equal(
        (await app.inject({ url: `/files/${a.id}/info`, headers: authorized })).json()
            .remainingDownloads,
        99,
    );
    const rotated = await app.inject({
        method: 'POST',
        url: `/api/files/${a.id}/sharing`,
        headers: management(a.managementToken),
        payload: { visibility: 'private' },
    });
    assert.equal(rotated.statusCode, 200);
    assert.equal(
        (await app.inject({ url: `/files/${a.id}`, headers: authorized })).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                url: `/files/${a.id}`,
                headers: privateHeaders(rotated.json().accessToken),
            })
        ).statusCode,
        200,
    );
    await app.inject({
        method: 'POST',
        url: `/api/files/${a.id}/sharing`,
        headers: management(a.managementToken),
        payload: { visibility: 'public' },
    });
    assert.equal((await app.inject({ url: `/files/${a.id}` })).statusCode, 200);
    const publicFile = await upload('public');
    assert.equal(publicFile.accessToken, undefined);
    assert.equal((await app.inject({ url: `/files/${publicFile.id}` })).statusCode, 200);
});
test('private mock APIs, MCP servers, and webhook receivers check access before side effects', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const mock = (
        await app.inject({
            method: 'POST',
            url: '/api/mocks?visibility=private',
            payload: {
                name: 'Private mock',
                routes: [{ method: 'GET', path: '/', status: 200, body: 'private response' }],
            },
        })
    ).json();
    assert.equal((await app.inject({ url: `/mock/${mock.id}` })).statusCode, 404);
    assert.equal(
        (await app.inject({ url: `/mock/${mock.id}`, headers: management(mock.managementToken) }))
            .statusCode,
        404,
    );
    assert.equal(
        (await app.inject({ url: `/mock/${mock.id}`, headers: privateHeaders(mock.accessToken) }))
            .body,
        'private response',
    );
    assert.equal(
        (
            await app.inject({
                url: `/api/mocks/${mock.id}`,
                headers: management(mock.managementToken),
            })
        ).json().uses,
        1,
    );
    const server = (
        await app.inject({
            method: 'POST',
            url: '/api/mcp-servers?visibility=private',
            payload: {
                name: 'Private MCP',
                tools: [
                    {
                        name: 'test',
                        description: '',
                        response: 'secret result',
                        inputSchema: { type: 'object', properties: {} },
                    },
                ],
            },
        })
    ).json();
    const mcp = (token?: string) =>
        app.inject({
            method: 'POST',
            url: `/mcp/mock/${server.id}`,
            headers: {
                accept: 'application/json, text/event-stream',
                ...(token ? privateHeaders(token) : {}),
            },
            payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        });
    assert.equal((await mcp()).statusCode, 404);
    assert.equal((await mcp(mock.accessToken)).statusCode, 404);
    assert.equal((await mcp(server.accessToken)).statusCode, 200);
    const inbox = (
        await app.inject({ method: 'POST', url: '/api/inboxes?visibility=private' })
    ).json();
    assert.equal(
        (await app.inject({ method: 'POST', url: `/hooks/${inbox.id}`, payload: 'blocked' }))
            .statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id}`,
                headers: privateHeaders(inbox.inspectionToken),
                payload: 'blocked',
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/hooks/${inbox.id}`,
                headers: privateHeaders(inbox.accessToken),
                payload: 'allowed',
            })
        ).statusCode,
        200,
    );
    const history = (
        await app.inject({
            url: `/api/inboxes/${inbox.id}/requests`,
            headers: management(inbox.inspectionToken),
        })
    ).json().requests;
    assert.equal(history.length, 1);
    assert.equal(history[0].body, 'allowed');
    assert.equal(history[0].headers['x-access-token'], '[REDACTED]');
});

test('one-time download links allow exactly one reader and remove file contents afterward', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const created = await app.inject({
        method: 'POST',
        url: '/api/files?visibility=private&maxDownloads=1',
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'once.txt' },
        payload: 'only once',
    });
    assert.equal(created.statusCode, 201);
    const file = created.json();
    assert.equal(file.remainingDownloads, 1);
    const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
            app.inject({ url: `/files/${file.id}`, headers: privateHeaders(file.accessToken) }),
        ),
    );
    assert.equal(responses.filter((response) => response.statusCode === 200).length, 1);
    assert.equal(responses.find((response) => response.statusCode === 200)!.body, 'only once');
    const metadata = (
        await app.inject({
            url: `/api/files/${file.id}`,
            headers: management(file.managementToken),
        })
    ).json();
    assert.equal(metadata.remainingDownloads, 0);
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/files?maxDownloads=0',
                headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'bad.txt' },
                payload: 'x',
            })
        ).statusCode,
        400,
    );
});

test('MCP file access is private by default and supports one-time transfers without management-token bypass', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const call = async (name: string, values: object) =>
        (
            await app.inject({
                method: 'POST',
                url: '/mcp',
                headers: { accept: 'application/json, text/event-stream' },
                payload: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name, arguments: values },
                },
            })
        ).json();
    const uploaded = await call('upload_temporary_file', {
        name: 'once.bin',
        base64: 'AP+A',
        maxDownloads: 1,
    });
    const file = JSON.parse(uploaded.result.content[0].text);
    assert.equal(file.visibility, 'private');
    assert.equal(file.remainingDownloads, 1);
    assert.equal((await call('download_temporary_file', { id: file.id })).result.isError, true);
    assert.equal(
        (await call('download_temporary_file', { id: file.id, accessToken: file.managementToken }))
            .result.isError,
        true,
    );
    const downloaded = await call('download_temporary_file', {
        id: file.id,
        accessToken: file.accessToken,
    });
    assert.equal(downloaded.result.isError, false);
    assert.equal(JSON.parse(downloaded.result.content[0].text).base64, 'AP+A');
    assert.equal(
        (await call('download_temporary_file', { id: file.id, accessToken: file.accessToken }))
            .result.isError,
        true,
    );
});
