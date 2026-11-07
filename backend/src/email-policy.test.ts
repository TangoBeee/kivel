import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryApprovals } from './approvals.js';
import { MemoryJobs } from './scheduled-jobs.js';
import { ResourceStore } from './resources.js';
import { MemoryEmailSending } from './email-sending-store.js';
import { emailApprovalRequired } from './email-threading.js';

const origin = 'http://localhost:3000';
const content = { to: ['recipient@example.com'], subject: 'Review this email', text: 'Draft body' };

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
    const identities = new MemoryIdentityRepository();
    const owner = identities.register('policy-owner', 'test')!;
    const ownerId = owner.personalAccountId;
    identities.setEntitlement(ownerId, 'team', new Date(Date.now() + 7 * 86400000).toISOString());
    const token = randomBytes(32).toString('base64url');
    identities.createSession(owner.id, ownerId, token);
    const human = { origin, cookie: `kivel_session=${token}` };
    const key = identities.createKey(
        identities.authenticateSession(token)!,
        'Email agent',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 7 * 86400000).toISOString(),
    );
    const agent = { authorization: `Bearer ${key.key}` };
    const jobs = new MemoryJobs();
    const approvals = new MemoryApprovals();
    const resources = new ResourceStore();
    const sending = new MemoryEmailSending();
    const sent: string[] = [];
    const secret = 'email-policy-ingestion-secret';
    const app = buildApp({
        identityStore: identities,
        resourceStore: resources,
        approvalStore: approvals,
        jobStore: jobs,
        emailSending: sending,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
        agentEmailConfig: { host: 'mail', port: 587, enabled: true },
        agentEmailSend: async (_body, id) => {
            sent.push(id);
            return { id };
        },
    });
    t.after(() => app.close());
    const created = await app.inject({ method: 'POST', url: '/api/email-inboxes', headers: agent });
    assert.equal(created.statusCode, 201, created.body);
    const inbox = created.json();
    const base = `/api/email-inboxes/${inbox.id}`;
    const rules = (payload: object, headers: Record<string, string> = human) =>
        app.inject({ method: 'PUT', url: `${base}/rules`, headers, payload });
    const create = async () => {
        const response = await app.inject({
            method: 'POST',
            url: `${base}/drafts`,
            headers: agent,
            payload: content,
        });
        assert.equal(response.statusCode, 201, response.body);
        return response.json();
    };
    const submit = (id: string, payload: object, headers: Record<string, string> = agent) =>
        app.inject({ method: 'POST', url: `/api/email-drafts/${id}/send`, headers, payload });
    const inspect = async (id: string) =>
        (await app.inject({ url: `/api/email-drafts/${id}`, headers: agent })).json();
    const answer = (id: string, answer: string) =>
        app.inject({
            method: 'POST',
            url: `/api/approvals/${id}/answer`,
            headers: human,
            payload: { answer },
        });
    const send = (idempotencyKey: string = randomUUID()) =>
        app.inject({
            method: 'POST',
            url: `${base}/send`,
            headers: { ...agent, 'idempotency-key': idempotencyKey },
            payload: content,
        });
    async function ingest(fields: object) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const payload = JSON.stringify({
            to: inbox.address,
            subject: 'Inbound',
            text: 'Message',
            ...fields,
        });
        return app.inject({
            method: 'POST',
            url: '/hooks/email',
            payload,
            headers: {
                'content-type': 'application/json',
                'x-kivel-timestamp': timestamp,
                'x-kivel-signature': createHmac('sha256', secret)
                    .update(`${timestamp}.${payload}`)
                    .digest('hex'),
            },
        });
    }
    async function member(role: 'admin' | 'viewer') {
        const user = identities.register(`policy-${role}`, 'test')!;
        const invitation = randomUUID();
        identities.invite(ownerId, user.username, role, invitation);
        assert.equal(identities.acceptInvite(user.id, user.username, invitation), ownerId);
        const token = randomBytes(32).toString('base64url');
        identities.createSession(user.id, ownerId, token);
        return { origin, cookie: `kivel_session=${token}` };
    }
    return {
        app,
        agent,
        human,
        jobs,
        approvals,
        resources,
        sending,
        ownerId,
        sent,
        base,
        rules,
        create,
        submit,
        inspect,
        answer,
        send,
        ingest,
        member,
    };
}

test('required approval covers HTTP, MCP and draft delivery without consuming allowance', async (t) => {
    const f = await fixture(t);
    assert.equal(
        (await f.app.inject({ url: `${f.base}/rules`, headers: f.agent })).json().rules
            .requireApproval,
        false,
    );
    const queuedBeforeRule = await f.create();
    assert.equal((await f.submit(queuedBeforeRule.id, {})).statusCode, 202);
    assert.equal((await f.rules({ requireApproval: true })).statusCode, 200);
    assert.equal((await f.rules({ requireApproval: false }, f.agent)).statusCode, 403);
    assert.equal(
        (await f.app.inject({ url: `${f.base}/rules`, headers: f.agent })).json().rules
            .requireApproval,
        true,
    );
    assert.equal((await f.rules({ requireApproval: 'true' })).statusCode, 400);
    const direct = await f.send();
    assert.equal(direct.statusCode, 403, direct.body);
    assert.equal(direct.json().error, emailApprovalRequired);
    const draft = await f.create();
    const unapproved = await f.submit(draft.id, {});
    assert.equal(unapproved.statusCode, 403, unapproved.body);
    assert.equal(unapproved.json().error, emailApprovalRequired);
    const rpc = await f.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...f.agent, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'send_email',
                arguments: {
                    id: f.base.split('/').at(-1),
                    ...content,
                    idempotencyKey: randomUUID(),
                },
            },
        },
    });
    assert.equal(rpc.json().result.isError, true);
    assert.equal(JSON.parse(rpc.json().result.content[0].text).error, emailApprovalRequired);
    await f.app.runScheduledJobs(Date.now() + 10);
    assert.equal((await f.inspect(queuedBeforeRule.id)).status, 'failed');
    assert.equal(f.sent.length, 0);
    assert.equal(await f.sending.withOwner(f.ownerId, (session) => session.usage()), 0);

    const approved = await f.submit(draft.id, { approval: true });
    assert.equal(approved.statusCode, 202, approved.body);
    assert.equal((await f.answer(approved.json().approvalId, 'Approve')).statusCode, 200);
    await f.app.runScheduledJobs(Date.now() + 20);
    assert.equal((await f.inspect(draft.id)).status, 'completed');
    assert.equal(f.sent.length, 1);
    assert.equal(await f.sending.withOwner(f.ownerId, (session) => session.usage()), 1);
});

test('inbound rules check forged header and envelope senders independently and match exact addresses', async (t) => {
    const f = await fixture(t);
    assert.equal(
        (
            await f.rules({
                inboundAllow: ['allowed@example.com'],
                inboundBlock: ['blocked@example.com'],
            })
        ).statusCode,
        200,
    );
    for (const [from, mailFrom, stored] of [
        ['allowed@example.com', 'attacker@elsewhere.test', false],
        ['allowed@example.com', 'blocked@example.com', false],
        ['blocked@example.com', 'allowed@example.com', false],
        [`${'Long name '.repeat(100)}<blocked@example.com>`, 'allowed@example.com', false],
        ['attacker@elsewhere.test', 'allowed@example.com', false],
        ['allowed@example.com', '', false],
        ['', 'allowed@example.com', true],
        ['Allowed Person <ALLOWED@EXAMPLE.COM>', 'ALLOWED@EXAMPLE.COM', true],
        ['allowed+tag@example.com', 'allowed@example.com', false],
        ['allowed@example.com', 'allowed+tag@example.com', false],
    ] as const) {
        const result = await f.ingest({ from, mailFrom });
        assert.equal(result.statusCode, 202, result.body);
        assert.equal(result.json().stored, stored, JSON.stringify({ from, mailFrom }));
    }
    assert.equal((await f.ingest({ from: 'allowed@example.com' })).json().stored, false);
    assert.equal((await f.rules({ inboundAllow: ['example.com'] })).statusCode, 200);
    assert.equal(
        (await f.ingest({ from: 'one@example.com', mailFrom: 'two@sub.example.com' })).json()
            .stored,
        false,
    );
    assert.equal(
        (await f.ingest({ from: 'one@sub.example.com', mailFrom: 'two@example.com' })).json()
            .stored,
        false,
    );
    assert.equal(
        (await f.ingest({ from: 'one@example.com', mailFrom: 'two@example.com' })).json().stored,
        true,
    );
    assert.equal((await f.rules({ inboundBlock: ['blocked.example'] })).statusCode, 200);
    assert.equal(
        (await f.ingest({ from: 'allowed@example.com', mailFrom: 'x@blocked.example' })).json()
            .stored,
        false,
    );
    assert.equal(
        (await f.ingest({ from: 'x@blocked.example', mailFrom: 'allowed@example.com' })).json()
            .stored,
        false,
    );
    assert.equal((await f.ingest({ from: 'legacy@example.com' })).json().stored, true);
});

test('draft reviews last up to a day, expire visibly and can be resubmitted only by owners or admins', async (t) => {
    const f = await fixture(t);
    const now = Date.now();
    let clock = now;
    t.mock.method(Date, 'now', () => clock);
    const admin = await f.member('admin');
    const viewer = await f.member('viewer');
    const draft = await f.create();
    const submitted = await f.submit(draft.id, { approval: true });
    assert.equal(submitted.statusCode, 202, submitted.body);
    const review = f.approvals.get(f.ownerId, submitted.json().approvalId)!;
    assert.equal(Date.parse(review.expiresAt) - clock, 86400000);
    clock += 86400001;
    assert.equal((await f.inspect(draft.id)).status, 'expired');
    assert.equal((await f.submit(draft.id, { approval: true })).statusCode, 403);
    assert.equal((await f.submit(draft.id, { approval: true }, viewer)).statusCode, 403);
    await f.app.runScheduledJobs(clock);
    assert.equal((await f.jobs.get(draft.id))?.status, 'expired');
    const again = await f.submit(draft.id, { approval: true }, f.human);
    assert.equal(again.statusCode, 202, again.body);
    assert.notEqual(again.json().approvalId, submitted.json().approvalId);
    assert.equal((await f.answer(submitted.json().approvalId, 'Approve')).statusCode, 409);
    assert.equal((await f.answer(again.json().approvalId, 'Reject')).statusCode, 200);
    assert.equal((await f.inspect(draft.id)).status, 'rejected');
    const concurrent = await Promise.all([
        f.submit(draft.id, { approval: true }, f.human),
        f.submit(draft.id, { approval: true }, admin),
    ]);
    assert.ok(concurrent.every((result) => [202, 409].includes(result.statusCode)));
    assert.equal(
        new Set(
            concurrent
                .filter((result) => result.statusCode === 202)
                .map((result) => result.json().approvalId),
        ).size,
        1,
    );
    assert.equal(f.approvals.list(f.ownerId, true).length, 1);
    const latest = concurrent.find((result) => result.statusCode === 202)!.json();
    assert.notEqual(latest.approvalId, again.json().approvalId);
    assert.equal((await f.answer(latest.approvalId, 'Approve')).statusCode, 200);
    await f.app.runScheduledJobs(clock + 10);
    assert.equal((await f.inspect(draft.id)).status, 'completed');
    assert.equal(f.sent.length, 1);
});

test('draft review deadlines respect scheduled time and draft expiry and reserved delivery keys cannot be supplied over HTTP', async (t) => {
    const f = await fixture(t);
    const now = Date.now();
    const scheduled = await f.create();
    const sendAt = new Date(now + 90 * 60000).toISOString();
    const response = await f.submit(scheduled.id, { approval: true, sendAt });
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(response.json().approvalExpiresAt, sendAt);

    const short = await f.create();
    const expiresAt = new Date(now + 30000).toISOString();
    await f.jobs.create({ ...(await f.jobs.get(short.id))!, expiresAt });
    const bounded = await f.submit(short.id, { approval: true });
    assert.equal(bounded.statusCode, 202, bounded.body);
    assert.equal(bounded.json().approvalExpiresAt, expiresAt);

    const draft = await f.create();
    assert.equal((await f.send(`draft:${draft.id}`)).statusCode, 400);
    assert.equal((await f.send(`draft-${draft.id}`)).statusCode, 202);
    const reviewed = await f.submit(draft.id, { approval: true });
    assert.equal((await f.answer(reviewed.json().approvalId, 'Approve')).statusCode, 200);
    await f.app.runScheduledJobs(Date.now() + 10);
    assert.equal((await f.inspect(draft.id)).status, 'completed');
    assert.equal(f.sent.length, 2);
});
