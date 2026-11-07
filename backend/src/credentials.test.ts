import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Kivel } from '@kivel.io/sdk';
import { command, needsInput } from '@kivel.io/cli';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryCredentials } from './credentials.js';
import { MemoryApprovals } from './approvals.js';
import { MemoryActivity } from './activity.js';
import { secretVault } from './secret-vault.js';
import { credentialLimits } from '@kivel.io/tools/billing-plans';

const origin = 'http://localhost:3000';
const secret = 'test-credential-encryption-key-with-enough-entropy';
const input = {
    name: 'Example account',
    url: 'example.com',
    username: 'owner@example.com',
    password: 'private-password-value',
    notes: 'Private notes\nSecond line',
};
async function fixture(
    t: { after(fn: () => Promise<unknown>): void },
    plan: 'free' | 'team' = 'team',
) {
    const identities = new MemoryIdentityRepository(),
        store = new MemoryCredentials(),
        approvals = new MemoryApprovals(),
        activity = new MemoryActivity();
    const owner = identities.register('vault-owner', 'test')!;
    const ownerId = owner.personalAccountId;
    identities.setEntitlement(
        ownerId,
        plan,
        plan === 'free' ? null : new Date(Date.now() + 86400000).toISOString(),
    );
    async function session(user: typeof owner, accountId = ownerId) {
        const token = randomBytes(32).toString('base64url');
        identities.createSession(user.id, accountId, token);
        return {
            headers: { origin, cookie: `kivel_session=${token}` },
            identity: identities.authenticateSession(token)!,
        };
    }
    const human = await session(owner);
    const writer = identities.createKey(
        human.identity,
        'Signup agent',
        ['resources:read', 'resources:write', 'account:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const another = identities.createKey(
        human.identity,
        'Other agent',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const reader = identities.createKey(
        human.identity,
        'Read key',
        ['resources:read'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const agent = { authorization: `Bearer ${writer.key}` };
    const read = { authorization: `Bearer ${reader.key}` };
    const otherKey = { authorization: `Bearer ${another.key}` };
    const outsider = identities.register('vault-outsider', 'test')!;
    const foreign = await session(outsider, outsider.personalAccountId);
    const options = {
        identityStore: identities,
        credentialStore: store,
        approvalStore: approvals,
        activity,
        authSecret: secret,
        mailDomain: 'kivel.space',
        emailIngestSecret: 'test-credential-email-ingest-secret',
    };
    const app = buildApp(options);
    t.after(() => app.close());
    const save = (body: object = input, headers: Record<string, string> = agent) =>
        app.inject({ method: 'POST', url: '/api/credentials', headers, payload: body });
    const reveal = (id: string, body: object = {}, headers: Record<string, string> = agent) =>
        app.inject({
            method: 'POST',
            url: `/api/credentials/${id}/reveal`,
            headers,
            payload: body,
        });
    const patch = (id: string, body: object, headers: Record<string, string> = agent) =>
        app.inject({ method: 'PATCH', url: `/api/credentials/${id}`, headers, payload: body });
    const answer = (
        id: string,
        answer = 'Approve',
        headers: Record<string, string> = human.headers,
    ) =>
        app.inject({
            method: 'POST',
            url: `/api/approvals/${id}/answer`,
            headers,
            payload: { answer },
        });
    async function member(role: 'admin' | 'viewer' | 'member') {
        const user = identities.register(`vault-${role}`, 'test')!;
        const token = randomUUID();
        identities.invite(ownerId, user.username, role, token);
        identities.acceptInvite(user.id, user.username, token);
        return session(user);
    }
    return {
        app,
        options,
        ownerId,
        human,
        agent,
        read,
        otherKey,
        foreign,
        store,
        approvals,
        activity,
        writer,
        save,
        reveal,
        patch,
        answer,
        member,
    };
}

test('vault encrypts passwords and notes, lists only metadata and binds secrets to the workspace and entry', async (t) => {
    const f = await fixture(t);
    const created = await f.save();
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.headers['cache-control'], 'no-store');
    const entry = created.json().credential;
    const stored = (await f.store.get(f.ownerId, entry.id))!;
    assert.equal(JSON.stringify(stored).includes(input.password), false);
    assert.equal(JSON.stringify(stored).includes('Private notes'), false);
    const encryption = secretVault(secret, 'credentials');
    assert.equal(
        JSON.parse(encryption.decrypt(stored.encrypted, `${f.ownerId}:${entry.id}`)).password,
        input.password,
    );
    assert.throws(() => encryption.decrypt(stored.encrypted, `other:${entry.id}`));
    for (const url of ['/api/credentials', `/api/credentials/${entry.id}`]) {
        const result = await f.app.inject({ url, headers: f.read });
        assert.equal(result.statusCode, 200, result.body);
        assert.equal(result.body.includes(input.password), false);
        assert.equal(result.body.includes('Private notes'), false);
        assert.equal(result.body.includes(stored.encrypted), false);
    }
    assert.equal((await f.reveal(entry.id, {}, f.read)).statusCode, 403);
    assert.equal((await f.reveal(entry.id, {}, f.foreign.headers)).statusCode, 404);
    assert.equal(
        (await f.app.inject({ url: `/api/credentials/${entry.id}`, headers: f.foreign.headers }))
            .statusCode,
        404,
    );
    assert.equal(
        (await f.app.inject({ url: '/api/memory/$credentials', headers: f.agent })).statusCode,
        400,
    );
    const revealed = await f.reveal(entry.id, { confirm: true }, f.human.headers);
    assert.equal(revealed.statusCode, 200, revealed.body);
    assert.deepEqual(revealed.json(), {
        status: 'revealed',
        id: entry.id,
        password: input.password,
        notes: input.notes,
    });
    assert.equal(revealed.headers['cache-control'], 'no-store');
    assert.equal(
        f.activity.list(f.ownerId).filter((entry) => entry.tool === 'reveal_credential').length,
        1,
    );
    assert.equal(JSON.stringify(f.activity.list(f.ownerId)).includes(input.password), false);
    const rotated = buildApp({
        ...f.options,
        authSecret: 'another-server-secret-of-sufficient-length',
    });
    t.after(() => rotated.close());
    const unavailable = await rotated.inject({
        method: 'POST',
        url: `/api/credentials/${entry.id}/reveal`,
        headers: f.human.headers,
        payload: { confirm: true },
    });
    assert.equal(unavailable.statusCode, 409, unavailable.body);
    assert.match(unavailable.body, /must be re-added/);
});

test('each default reveal needs one owner or admin approval bound to the caller and entry version', async (t) => {
    const f = await fixture(t);
    const admin = await f.member('admin'),
        viewer = await f.member('viewer');
    const entry = (await f.save()).json().credential;
    const pending = await f.reveal(entry.id);
    assert.equal(pending.statusCode, 202, pending.body);
    const approvalId = pending.json().approvalId;
    const approval = f.approvals.get(f.ownerId, approvalId)!;
    assert.equal(approval.agentName, 'Signup agent');
    assert.match(approval.details!, /Example|example/);
    assert.equal((await f.answer(approvalId, 'Approve', f.agent)).statusCode, 403);
    assert.equal((await f.answer(approvalId, 'Approve', viewer.headers)).statusCode, 403);
    assert.equal((await f.answer(approvalId, 'Approve', admin.headers)).statusCode, 200);
    assert.equal((await f.reveal(entry.id, { approvalId }, f.otherKey)).statusCode, 403);
    const simultaneous = await Promise.all([
        f.reveal(entry.id, { approvalId }),
        f.reveal(entry.id, { approvalId }),
    ]);
    assert.deepEqual(simultaneous.map((result) => result.statusCode).sort(), [200, 409]);
    assert.equal((await f.reveal(entry.id)).statusCode, 202);
    assert.equal((await f.reveal(entry.id, { confirm: true })).statusCode, 403);
    const stale = (await f.reveal(entry.id)).json();
    assert.equal((await f.answer(stale.approvalId)).statusCode, 200);
    assert.equal((await f.patch(entry.id, { name: 'Changed account' })).statusCode, 200);
    assert.equal((await f.reveal(entry.id, { approvalId: stale.approvalId })).statusCode, 403);
    const forged = await f.app.inject({
        method: 'POST',
        url: '/api/approvals',
        headers: f.agent,
        payload: {
            question: 'Approve?',
            options: ['Approve', 'Reject'],
            credential: {
                id: entry.id,
                version: (await f.store.get(f.ownerId, entry.id))!.version,
                requesterId: f.human.identity.userId,
            },
        },
    });
    assert.equal((await f.answer(forged.json().id)).statusCode, 200);
    assert.equal((await f.reveal(entry.id, { approvalId: forged.json().id })).statusCode, 403);
    const member = await f.member('member');
    assert.equal((await f.reveal(entry.id, { confirm: true }, member.headers)).statusCode, 403);
    const memberRequest = await f.reveal(entry.id, {}, member.headers);
    assert.equal(memberRequest.statusCode, 202, memberRequest.body);
    assert.equal((await f.answer(memberRequest.json().approvalId)).statusCode, 200);
    assert.equal(
        (await f.reveal(entry.id, { approvalId: memberRequest.json().approvalId }, member.headers))
            .statusCode,
        200,
    );
    const rejected = (await f.reveal(entry.id)).json();
    assert.equal((await f.answer(rejected.approvalId, 'Reject')).statusCode, 200);
    assert.equal((await f.reveal(entry.id, { approvalId: rejected.approvalId })).statusCode, 403);
    const approvedExpiry = (await f.reveal(entry.id)).json();
    assert.equal((await f.answer(approvedExpiry.approvalId)).statusCode, 200);
    const expiring = (await f.reveal(entry.id)).json();
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 3600001);
    assert.equal((await f.reveal(entry.id, { approvalId: expiring.approvalId })).statusCode, 403);
    assert.equal(
        (await f.reveal(entry.id, { approvalId: approvedExpiry.approvalId })).statusCode,
        409,
    );
    const event = f.activity
        .list(f.ownerId)
        .find((item) => item.tool === 'reveal_credential' && item.keyId === f.writer.info.id)!;
    assert.equal(event.keyId, f.writer.info.id);
    assert.equal(event.agentName, 'Signup agent');
});

test('only human owners or admins can grant agent reads, including at creation', async (t) => {
    const f = await fixture(t);
    const admin = await f.member('admin'),
        viewer = await f.member('viewer');
    assert.equal((await f.save({ ...input, agentMayRead: true })).statusCode, 403);
    assert.equal((await f.save({ ...input, agentMayRead: false })).statusCode, 403);
    const created = await f.save();
    const entry = created.json().credential;
    assert.equal(entry.agentMayRead, false);
    assert.equal((await f.patch(entry.id, { agentMayRead: true })).statusCode, 403);
    assert.equal((await f.patch(entry.id, { agentMayRead: true }, viewer.headers)).statusCode, 403);
    assert.equal((await f.patch(entry.id, { agentMayRead: true }, admin.headers)).statusCode, 200);
    assert.equal((await f.reveal(entry.id)).statusCode, 200);
    assert.equal((await f.reveal(entry.id, {}, f.read)).statusCode, 403);
    assert.equal((await f.patch(entry.id, { agentMayRead: false })).statusCode, 403);
    assert.equal(
        (await f.patch(entry.id, { agentMayRead: false }, f.human.headers)).statusCode,
        200,
    );
    assert.equal((await f.reveal(entry.id)).statusCode, 202);
    const deleted = await f.app.inject({
        method: 'DELETE',
        url: `/api/credentials/${entry.id}`,
        headers: f.agent,
    });
    assert.equal(deleted.statusCode, 204);
    assert.equal((await f.reveal(entry.id)).statusCode, 404);
});

test('generated passwords, plan limits and linked resources work through the API and SDK', async (t) => {
    const f = await fixture(t, 'free');
    const client = new Kivel({
        apiKey: f.writer.key,
        fetch: async (url, options) => {
            const parsed = new URL(String(url));
            const response = await f.app.inject({
                method: options?.method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
                url: parsed.pathname + parsed.search,
                headers: Object.fromEntries(new Headers(options?.headers)),
                ...(options?.body ? { payload: String(options.body) } : {}),
            });
            return new Response(response.statusCode === 204 ? null : response.body, {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
            });
        },
    });
    const first = await client.saveCredential({
        name: input.name,
        url: input.url,
        username: input.username,
    });
    assert.equal(first.password?.length, 24);
    assert.equal(needsInput(['credential', 'save']), true);
    const cliGenerated = (await command(client, ['password', 'generate', '--length', '40'])) as {
        password: string;
    };
    assert.equal(cliGenerated.password.length, 40);
    const cliSaved = (await command(
        client,
        ['credential', 'save'],
        Buffer.from(JSON.stringify(input)),
    )) as { credential: { id: string } };
    const cliId = cliSaved.credential.id;
    const cliPending = (await command(client, ['credential', 'reveal', cliId])) as {
        approvalId: string;
    };
    assert.equal((await f.answer(cliPending.approvalId)).statusCode, 200);
    const cliRevealed = (await command(client, [
        'credential',
        'reveal',
        cliId,
        '--approval-id',
        cliPending.approvalId,
    ])) as { password: string };
    assert.equal(cliRevealed.password, input.password);
    await command(client, ['credential', 'delete', cliId]);
    const second = await client.generatePassword(64);
    assert.equal(second.password.length, 64);
    assert.notEqual(second.password.slice(0, 24), first.password);
    assert.equal(
        (
            await f.app.inject({
                method: 'POST',
                url: '/api/passwords/generate',
                headers: f.agent,
                payload: { length: 3 },
            })
        ).statusCode,
        400,
    );
    for (let index = 1; index < credentialLimits.free; index++)
        assert.equal((await f.save()).statusCode, 201);
    assert.equal((await f.save()).statusCode, 429);
    assert.equal((await client.credentials()).credentials.length, 10);
    assert.equal((await f.save({ ...input, authenticatorId: randomUUID() })).statusCode, 404);
    assert.equal((await f.save({ ...input, inboxId: randomUUID() })).statusCode, 404);
    const foreignAuthenticator = await f.app.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.foreign.headers,
        payload: { name: 'Foreign service', secret: 'JBSWY3DPEHPK3PXP' },
    });
    assert.equal(foreignAuthenticator.statusCode, 201, foreignAuthenticator.body);
    assert.equal(
        (await f.save({ ...input, authenticatorId: foreignAuthenticator.json().id })).statusCode,
        404,
    );
    const ownAuthenticator = await f.app.inject({
        method: 'POST',
        url: '/api/authenticators',
        headers: f.agent,
        payload: { name: 'Own service', secret: 'JBSWY3DPEHPK3PXP' },
    });
    assert.equal(ownAuthenticator.statusCode, 201, ownAuthenticator.body);
    await client.deleteCredential(first.credential.id);
    const linked = await client.saveCredential({
        ...input,
        authenticatorId: ownAuthenticator.json().id,
    });
    assert.equal(linked.credential.authenticatorId, ownAuthenticator.json().id);
    assert.equal(
        (await f.save({ ...input, url: 'https://user:password@example.com' })).statusCode,
        400,
    );
    for (const plan of ['free', 'pro', 'team'] as const) {
        const store = new MemoryCredentials();
        const base = { ...first.credential, version: randomUUID(), encrypted: 'ciphertext' };
        for (let index = 0; index < credentialLimits[plan]; index++)
            assert.equal(
                await store.save('owner', { ...base, id: String(index) }, credentialLimits[plan]),
                true,
            );
        assert.equal(
            await store.save('owner', { ...base, id: 'excess' }, credentialLimits[plan]),
            false,
        );
    }
});

test('MCP reveals wait for human approval and discovery exposes vault lifecycle operations', async (t) => {
    const f = await fixture(t);
    const call = async (name: string, args: object) => {
        const response = await f.app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { ...f.agent, accept: 'application/json, text/event-stream' },
            payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            },
        });
        const result = response.json().result;
        assert.ok(result, response.body);
        return { result, value: JSON.parse(result.content[0].text) };
    };
    const saved = await call('save_credential', input);
    assert.equal(saved.result.isError, false);
    const id = saved.value.credential.id;
    const pendingCall = call('reveal_credential', { id, timeoutSeconds: 2 });
    let pending = f.approvals.list(f.ownerId, true);
    for (let count = 0; !pending.length && count < 50; count++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        pending = f.approvals.list(f.ownerId, true);
    }
    assert.equal(pending.length, 1);
    assert.equal((await f.answer(pending[0]!.id)).statusCode, 200);
    const result = await pendingCall;
    assert.equal(result.result.isError, false, JSON.stringify(result.value));
    assert.equal(result.value.password, input.password);
    assert.equal((await call('list_credentials', {})).value.credentials.length, 1);
    assert.equal(
        (await call('describe_tool', { toolId: 'agents-password-vault' })).value.mcpTool,
        'save_credential',
    );
    assert.equal(
        (await call('search_tools', { query: 'vault' })).value.tools.some(
            (tool: { id: string }) => tool.id === 'agents-password-vault',
        ),
        true,
    );
    const deleted = await call('resource_request', { kind: 'credentials', action: 'delete', id });
    assert.equal(deleted.result.isError, false, JSON.stringify(deleted.value));
});
