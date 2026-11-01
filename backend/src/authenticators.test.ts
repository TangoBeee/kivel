import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import qrcode from 'qrcode-generator';
import jpeg from 'jpeg-js';
import { SocketHelp } from '@socket-help/sdk';
import { command } from '@socket-help/cli';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryAuthenticators } from './authenticators.js';
import { MemoryAgents } from './agents.js';
import { MemoryActivity } from './activity.js';
import { decodeBase32, parseTotp, totp, totpVault } from './totp.js';
import { decodeTotpQr } from './totp-qr.js';
import { plans } from '@socket-help/tools/plans';

const secret = 'JBSWY3DPEHPK3PXP';
export function base32(bytes: Buffer) {
    let bits = 0,
        value = 0,
        result = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value >>> bits) & 31];
        }
    }
    if (bits) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value << (5 - bits)) & 31];
    return result;
}
function qrImage(uri: string) {
    const qr = qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    const size = (qr.getModuleCount() + 8) * 4,
        png = new PNG({ width: size, height: size });
    png.data.fill(255);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const row = Math.floor(y / 4) - 4,
                col = Math.floor(x / 4) - 4;
            if (
                row >= 0 &&
                col >= 0 &&
                row < qr.getModuleCount() &&
                col < qr.getModuleCount() &&
                qr.isDark(row, col)
            ) {
                const i = (y * size + x) * 4;
                png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
            }
        }
    return png;
}
async function fixture(
    t: { after(fn: () => Promise<unknown>): void },
    plan: 'free' | 'pro' | 'team' = 'free',
) {
    const identities = new MemoryIdentityRepository(),
        store = new MemoryAuthenticators(),
        activity = new MemoryActivity(),
        agents = new MemoryAgents();
    const user = identities.register('auth-owner', 'test')!;
    identities.setEntitlement(
        user.personalAccountId,
        plan,
        new Date(Date.now() + 86400000).toISOString(),
    );
    const session = 'a'.repeat(43);
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    const key = identities.createKey(
        identity,
        'Authenticator test',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const other = identities.register('auth-other', 'test')!,
        otherSession = 'b'.repeat(43);
    identities.createSession(other.id, other.personalAccountId, otherSession);
    const otherKey = identities.createKey(
        identities.authenticateSession(otherSession)!,
        'Other test',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const app = buildApp({
        identityStore: identities,
        authenticatorStore: store,
        activity,
        agentStore: agents,
        authSecret: 'test-authenticator-encryption-key-32-characters',
    });
    t.after(() => app.close());
    return {
        app,
        store,
        activity,
        agents,
        owner: identity.account.id,
        headers: { authorization: `Bearer ${key.key}` },
        otherHeaders: { authorization: `Bearer ${otherKey.key}` },
        identities,
    };
}

test('TOTP matches every RFC 6238 SHA1, SHA256 and SHA512 eight-digit test vector', () => {
    const vectors: [number, string, string, string][] = [
        [59, '94287082', '46119246', '90693936'],
        [1111111109, '07081804', '68084774', '25091201'],
        [1111111111, '14050471', '67062674', '99943326'],
        [1234567890, '89005924', '91819424', '93441116'],
        [2000000000, '69279037', '90698825', '38618901'],
        [20000000000, '65353130', '77737706', '47863826'],
    ];
    const keys = [
        '12345678901234567890',
        '12345678901234567890123456789012',
        '1234567890123456789012345678901234567890123456789012345678901234',
    ];
    for (const [seconds, ...codes] of vectors)
        for (const [index, algorithm] of (['SHA1', 'SHA256', 'SHA512'] as const).entries())
            assert.equal(
                totp(
                    { secret: base32(Buffer.from(keys[index]!)), algorithm, digits: 8, period: 30 },
                    seconds * 1000,
                ).code,
                codes[index],
            );
    const config = { secret, algorithm: 'SHA1' as const, digits: 6 as const, period: 60 as const };
    assert.equal(totp(config, 55000).secondsRemaining, 5);
    assert.equal(totp(config, 55000).nextCode, undefined);
    assert.equal(totp(config, 55001).nextCode, totp(config, 60000).code);
    assert.equal(totp(config, 56000).nextCode, totp(config, 60000).code);
    assert.equal(totp(config, 60000).secondsRemaining, 60);
    assert.equal(totp({ ...config, digits: 7 }, 59000).code.length, 7);
});
test('TOTP parsing rejects invalid inputs and encryption authenticates both workspace and record', () => {
    assert.equal(decodeBase32(secret).length, 10);
    const parsed = parseTotp({
        uri: `otpauth://totp/Example:bot%40example.test?secret=${secret}&issuer=Example&algorithm=SHA256&digits=8&period=60`,
    });
    assert.equal(parsed.issuer, 'Example');
    assert.equal(parsed.accountName, 'bot@example.test');
    assert.equal(parsed.config.period, 60);
    for (const input of [
        { uri: `otpauth://hotp/a?secret=${secret}` },
        { secret: 'not-a-key' },
        { secret, algorithm: 'MD5' },
        { secret, digits: 5 },
        { secret, period: 15 },
        { uri: `otpauth://totp/a?secret=${secret}&secret=${secret}` },
        { uri: `otpauth://totp/a?secret=${secret}`, digits: 8 },
    ])
        assert.throws(() => parseTotp(input));
    assert.throws(
        () => parseTotp({ uri: `otpauth://totp/Example%00?secret=${secret}` }),
        /control characters/,
    );
    const vault = totpVault('a'.repeat(40)),
        encrypted = vault.encrypt(parsed.config, 'workspace-a', 'id');
    assert.ok(!encrypted.includes(secret));
    assert.deepEqual(vault.decrypt(encrypted, 'workspace-a', 'id'), parsed.config);
    assert.notEqual(vault.encrypt(parsed.config, 'workspace-a', 'id'), encrypted);
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[20] = tampered[20]! ^ 1;
    assert.throws(() => vault.decrypt(tampered.toString('base64'), 'workspace-a', 'id'));
    assert.throws(() => vault.decrypt(encrypted, 'workspace-b', 'id'));
    assert.throws(() => vault.decrypt(encrypted, 'workspace-a', 'other'));
    assert.throws(() => totpVault('b'.repeat(40)).decrypt(encrypted, 'workspace-a', 'id'));
});
test('PNG and JPEG QR imports decode real setup URIs without native image dependencies', async () => {
    const uri = `otpauth://totp/Example:agent?secret=${secret}`,
        png = qrImage(uri);
    assert.equal(await decodeTotpQr(PNG.sync.write(png).toString('base64')), uri);
    assert.equal(
        await decodeTotpQr(
            jpeg
                .encode({ width: png.width, height: png.height, data: png.data }, 95)
                .data.toString('base64'),
        ),
        uri,
    );
    await assert.rejects(decodeTotpQr('bad base64'));
    const large = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(large);
    large.writeUInt32BE(2000, 16);
    large.writeUInt32BE(2000, 20);
    await assert.rejects(decodeTotpQr(large.toString('base64')));
});
test('authenticator limits are shared plan definitions and enforced atomically', async (t) => {
    for (const plan of ['free', 'pro', 'team'] as const) {
        const f = await fixture(t, plan),
            limit = plans[plan].authenticators;
        assert.equal(limit, { free: 2, pro: 25, team: 100 }[plan]);
        const responses = await Promise.all(
            Array.from({ length: limit + 1 }, (_, index) =>
                f.app.inject({
                    method: 'POST',
                    url: '/api/authenticators',
                    headers: f.headers,
                    payload: { name: `Account ${index}`, secret },
                }),
            ),
        );
        assert.equal(
            responses.filter((r) => r.statusCode === 201).length,
            limit,
            responses.map((r) => r.body).join('\n'),
        );
        assert.equal(responses.filter((r) => r.statusCode === 429).length, 1);
        assert.equal((await f.store.list(f.owner)).length, limit);
    }
});
test('authenticator secrets stay private, generation is audited and limited, and management is isolated', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.app.inject('/api/authenticators')).statusCode, 401);
    const added = await f.app.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.headers,
        payload: { name: 'Example', secret },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.ok(!added.body.includes(secret));
    assert.equal(added.json().encrypted, undefined);
    const id = added.json().id;
    assert.equal(
        (
            await f.app.inject({
                method: 'PATCH',
                url: `/api/authenticators/${id}`,
                headers: f.headers,
                payload: { name: 'Not a secret update', secret },
            })
        ).statusCode,
        400,
    );
    for (const suffix of ['', '/code'])
        assert.equal(
            (
                await f.app.inject({
                    url: `/api/authenticators/${id}${suffix}`,
                    headers: f.otherHeaders,
                })
            ).statusCode,
            404,
        );
    assert.equal(
        (
            await f.app.inject({
                method: 'PATCH',
                url: `/api/authenticators/${id}`,
                headers: f.otherHeaders,
                payload: { name: 'stolen' },
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await f.app.inject({
                method: 'DELETE',
                url: `/api/authenticators/${id}`,
                headers: f.otherHeaders,
            })
        ).statusCode,
        404,
    );
    for (let i = 0; i < 30; i++) {
        const response = await f.app.inject({
            url: `/api/authenticators/${id}/code`,
            headers: f.headers,
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.match(response.json().code, /^\d{6}$/);
    }
    const blocked = await f.app.inject({
        url: `/api/authenticators/${id}/code`,
        headers: f.headers,
    });
    assert.equal(blocked.statusCode, 429);
    assert.ok(blocked.headers['retry-after']);
    const entries = f.activity.list(f.owner);
    assert.equal(entries.length, 30);
    assert.ok(entries.every((entry) => entry.tool === 'get_totp_code'));
    assert.ok(
        entries.every(
            (entry) => entry.agentName === 'Authenticator test' && !!entry.userId && !!entry.keyId,
        ),
    );
    assert.ok(!JSON.stringify(entries).includes(secret));
    assert.equal(
        (
            await f.app.inject({
                method: 'PATCH',
                url: `/api/authenticators/${id}`,
                headers: f.headers,
                payload: { name: 'Renamed' },
            })
        ).statusCode,
        200,
    );
    assert.equal(
        (await f.app.inject({ url: '/api/authenticators', headers: f.headers })).json()
            .authenticators[0].name,
        'Renamed',
    );
    assert.equal(
        (
            await f.app.inject({
                method: 'DELETE',
                url: `/api/authenticators/${id}`,
                headers: f.headers,
            })
        ).statusCode,
        204,
    );
    assert.equal((await f.store.list(f.owner)).length, 0);
});
test('MCP discovery, resource_request, SDK and CLI expose the same authenticator lifecycle', async (t) => {
    const f = await fixture(t);
    const client = new SocketHelp({
        baseUrl: 'http://localhost:3000',
        fetch: async (url, init) => {
            const parsed = new URL(String(url));
            const response = await f.app.inject({
                method: (init?.method ?? 'GET') as 'POST',
                url: parsed.pathname + parsed.search,
                headers: {
                    ...Object.fromEntries(new Headers(init?.headers).entries()),
                    ...f.headers,
                },
                ...(init?.body ? { payload: String(init.body) } : {}),
            });
            return new Response(response.statusCode === 204 ? null : response.body, {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
            });
        },
    });
    const rpc = async (name: string, args: object = {}) => {
        const response = await f.app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { ...f.headers, accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        const result = response.json().result;
        assert.equal(result?.isError, false, response.body);
        return JSON.parse(result.content[0].text);
    };
    const imported = await rpc('add_authenticator', {
        name: 'Agent',
        imageBase64: PNG.sync
            .write(qrImage(`otpauth://totp/Example:agent?secret=${secret}`))
            .toString('base64'),
    });
    assert.equal((await rpc('get_totp_code', { id: imported.id })).code.length, 6);
    assert.equal(
        (await rpc('resource_request', { kind: 'authenticators', action: 'list' })).authenticators
            .length,
        1,
    );
    await rpc('resource_request', {
        kind: 'authenticators',
        action: 'update',
        id: imported.id,
        config: { name: 'Updated' },
    });
    assert.equal(
        (await rpc('describe_tool', { toolId: 'agents-agent-authenticator' })).mcpTool,
        'add_authenticator',
    );
    assert.ok(
        (await rpc('search_tools', { query: 'authenticator' })).tools.some(
            (tool: { id: string }) => tool.id === 'get_totp_code',
        ),
    );
    assert.equal((await client.getTotpCode(imported.id)).code.length, 6);
    assert.equal(
        ((await command(client, ['authenticator', 'list'])) as { authenticators: unknown[] })
            .authenticators.length,
        1,
    );
    const sdk = await client.addAuthenticator({ name: 'SDK', secret });
    await command(client, ['authenticator', 'rename', sdk.id, 'CLI name']);
    await client.deleteAuthenticator(sdk.id);
    await rpc('delete_authenticator', { id: imported.id });
    assert.equal((await client.listAuthenticators()).authenticators.length, 0);
});

test('only write credentials generate codes and audit records identify sessions and agents over HTTP and MCP', async (t) => {
    const f = await fixture(t, 'team');
    const owner = f.identities.findUser('auth-owner')!;
    const ownerIdentity = f.identities.authenticateSession('a'.repeat(43))!;
    const readKey = f.identities.createKey(
        ownerIdentity,
        'Read only agent',
        ['resources:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const sessions = new Map<string, { cookie: string; origin: string }>();
    for (const role of ['viewer', 'admin'] as const) {
        const user = f.identities.register(`auth-${role}`, 'test')!;
        const invite = `${role}-invitation`,
            session = (role === 'admin' ? 'c' : 'v').repeat(43);
        assert.ok(f.identities.invite(f.owner, user.username, role, invite));
        assert.equal(f.identities.acceptInvite(user.id, user.username, invite), f.owner);
        assert.ok(f.identities.createSession(user.id, f.owner, session));
        sessions.set(role, {
            cookie: `socket_session=${session}`,
            origin: 'http://localhost:3000',
        });
    }
    const created = await f.app.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.headers,
        payload: { name: 'Team account', secret },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    const mcp = (headers: Record<string, string>) =>
        f.app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { ...headers, accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'get_totp_code', arguments: { id } },
            },
        });
    for (const headers of [sessions.get('viewer')!, { authorization: `Bearer ${readKey.key}` }]) {
        assert.equal((await f.app.inject({ url: '/api/authenticators', headers })).statusCode, 200);
        assert.equal(
            (await f.app.inject({ url: `/api/authenticators/${id}/code`, headers })).statusCode,
            403,
        );
        const refused = (await mcp(headers)).json();
        assert.equal(refused.result?.isError, true, JSON.stringify(refused));
        assert.match(refused.result.content[0].text, /403/);
    }
    assert.equal(f.activity.list(f.owner).length, 0);
    const writeIdentity = f.identities.authenticateKey(f.headers.authorization.slice(7))!;
    f.agents.addAgent({
        keyId: writeIdentity.keyId!,
        accountId: f.owner,
        name: 'Approved coding agent',
        createdAt: new Date().toISOString(),
    });
    const browserOwner = {
        cookie: `socket_session=${'a'.repeat(43)}`,
        origin: 'http://localhost:3000',
    };
    for (const headers of [browserOwner, sessions.get('admin')!, f.headers]) {
        assert.equal(
            (await f.app.inject({ url: `/api/authenticators/${id}/code`, headers })).statusCode,
            200,
        );
        const generated = (await mcp(headers)).json();
        assert.equal(generated.result?.isError, false, JSON.stringify(generated));
    }
    const entries = f.activity.list(f.owner);
    assert.equal(entries.length, 6);
    const browserEntries = entries.filter((entry) => !entry.keyId);
    assert.equal(browserEntries.filter((entry) => entry.userId === owner.id).length, 2);
    assert.equal(
        browserEntries.filter((entry) => entry.userId === f.identities.findUser('auth-admin')!.id)
            .length,
        2,
    );
    const keyIdentity = f.identities.authenticateKey(f.headers.authorization.slice(7))!;
    for (const entry of entries.filter((entry) => entry.keyId)) {
        assert.equal(entry.keyId, keyIdentity.keyId);
        assert.equal(entry.agentName, 'Approved coding agent');
        assert.equal(entry.userId, owner.id);
    }
});

test('changed encryption keys return an actionable conflict without deleting the authenticator', async (t) => {
    const f = await fixture(t);
    const created = await f.app.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.headers,
        payload: { name: 'Encrypted account', secret },
    });
    const id = created.json().id;
    const rotated = buildApp({
        identityStore: f.identities,
        authenticatorStore: f.store,
        activity: f.activity,
        authSecret: 'different-authenticator-server-secret-32-characters',
    });
    t.after(() => rotated.close());
    const response = await rotated.inject({
        url: `/api/authenticators/${id}/code`,
        headers: f.headers,
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.json().error, /must be re-added/);
    assert.ok(!response.body.includes(secret));
    assert.equal((await f.store.list(f.owner)).length, 1);
    assert.equal(f.activity.list(f.owner).length, 0);
    assert.equal(
        (
            await rotated.inject({
                method: 'DELETE',
                url: `/api/authenticators/${id}`,
                headers: f.headers,
            })
        ).statusCode,
        204,
    );
    const added = await rotated.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.headers,
        payload: { name: 'Re-added account', secret },
    });
    assert.equal(
        (
            await rotated.inject({
                url: `/api/authenticators/${added.json().id}/code`,
                headers: f.headers,
            })
        ).statusCode,
        200,
    );
});

test('QR decoder capacity is held until worker exit after timeout and successful decoding', async (t) => {
    const { EventEmitter } = await import('node:events');
    const { TotpQrDecoder } = await import('./totp-qr.js');
    class TestWorker extends EventEmitter {
        stopping = false;
        terminate() {
            this.stopping = true;
            return new Promise<number>((resolve) => this.once('exit', () => resolve(1)));
        }
    }
    const workers: TestWorker[] = [];
    const decoder = new TotpQrDecoder(() => {
        const worker = new TestWorker();
        workers.push(worker);
        return worker;
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const image = Buffer.from('synthetic worker input').toString('base64');
    const first = assert.rejects(decoder.decode(image), /timed out/);
    const second = assert.rejects(decoder.decode(image), /timed out/);
    t.mock.timers.tick(5000);
    assert.ok(workers.every((worker) => worker.stopping));
    await assert.rejects(decoder.decode(image), /busy/);
    workers[0]!.emit('exit', 1);
    await first;
    const successful = decoder.decode(image);
    workers[2]!.emit('message', { text: `otpauth://totp/test?secret=${secret}` });
    await assert.rejects(decoder.decode(image), /busy/);
    workers[1]!.emit('exit', 1);
    await second;
    workers[2]!.emit('exit', 1);
    assert.equal(await successful, `otpauth://totp/test?secret=${secret}`);
});
