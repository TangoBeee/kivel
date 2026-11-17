import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.js';
import type { MailMessage } from './mail.js';

const origin = 'http://localhost:3000';
const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
};

async function connected(mail: MailMessage[]) {
    const app = buildApp({
        mailSender: {
            async send(value) {
                mail.push(value);
            },
            close() {},
        },
    });
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'owner',
            email: 'owner@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    const session = { origin, cookie: String(registered.headers['set-cookie']).split(';')[0]! };
    await until(() => mail.length === 1);
    const code = mail[0]!.text.match(/\bcode is:\s+(\d{8})\b/)![1]!;
    const verified = await app.inject({
        method: 'POST',
        url: '/api/account/email/verify',
        headers: session,
        payload: { code },
    });
    assert.equal(verified.statusCode, 204, verified.body);
    const login = (
        await app.inject({
            method: 'POST',
            url: '/api/agents/login',
            payload: { name: 'Claude Code on MacBook' },
        })
    ).json();
    await app.inject({
        method: 'POST',
        url: `/api/agents/login/${login.userCode}/approve`,
        headers: session,
        payload: {},
    });
    const apiKey = (
        await app.inject({
            method: 'POST',
            url: '/api/agents/token',
            payload: { deviceCode: login.deviceCode },
        })
    ).json().apiKey as string;
    return { app, session, agent: { authorization: `Bearer ${apiKey}` } };
}

test('an agent asks its human, cannot answer itself, and gets the answer exactly once', async (t) => {
    const mail: MailMessage[] = [];
    const { app, session, agent } = await connected(mail);
    t.after(() => app.close());
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/approvals',
                payload: { question: 'Deploy?' },
            })
        ).statusCode,
        401,
    );
    const asked = await app.inject({
        method: 'POST',
        url: '/api/approvals',
        headers: agent,
        payload: {
            question: 'Deploy build 412 to production?',
            details: '3 files changed',
            options: ['Deploy', 'Wait', 'Deploy'],
        },
    });
    assert.equal(asked.statusCode, 201, asked.body);
    const approval = asked.json();
    assert.equal(approval.agentName, 'Claude Code on MacBook');
    assert.deepEqual(approval.options, ['Deploy', 'Wait']);
    assert.equal(approval.emailed, true);
    assert.equal(approval.answerUrl, `${origin}/approve/?id=${approval.id}`);
    assert.equal(approval.accountId, undefined);
    const notice = mail.at(-1)!;
    assert.equal(notice.to, 'owner@example.test');
    assert.match(notice.text, /Deploy build 412/);
    assert.ok(notice.text.includes(approval.answerUrl));

    const waiting = await app.inject({
        url: `/api/approvals/${approval.id}/wait?timeoutSeconds=1`,
        headers: agent,
    });
    assert.equal(waiting.json().timedOut, true);
    assert.equal(waiting.json().status, 'pending');

    const answer = (headers: Record<string, string>, value = 'Deploy') =>
        app.inject({
            method: 'POST',
            url: `/api/approvals/${approval.id}/answer`,
            headers,
            payload: { answer: value, note: 'Go ahead' },
        });
    assert.equal((await answer(agent)).statusCode, 403);
    assert.equal((await answer(session, 'Ship it')).statusCode, 400);
    const pending = (
        await app.inject({ url: '/api/approvals?status=pending', headers: session })
    ).json();
    assert.equal(pending.approvals.length, 1);

    const wait = app.inject({ url: `/api/approvals/${approval.id}/wait`, headers: agent });
    await new Promise((r) => setTimeout(r, 50));
    const answered = await answer(session);
    assert.equal(answered.statusCode, 200, answered.body);
    const result = (await wait).json();
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 'answered');
    assert.equal(result.answer, 'Deploy');
    assert.equal(result.note, 'Go ahead');
    assert.equal(result.answeredBy, 'owner');
    assert.equal((await answer(session, 'Wait')).statusCode, 409);
    assert.equal(
        (await app.inject({ url: '/api/approvals?status=pending', headers: session })).json()
            .approvals.length,
        0,
    );
});

test('approval requests validate input and expire', async (t) => {
    const mail: MailMessage[] = [];
    const { app, session, agent } = await connected(mail);
    t.after(() => app.close());
    const ask = (payload: Record<string, unknown>) =>
        app.inject({ method: 'POST', url: '/api/approvals', headers: agent, payload });
    assert.equal((await ask({ question: '' })).statusCode, 400);
    assert.equal((await ask({ question: 'x', options: ['Only'] })).statusCode, 400);
    assert.equal((await ask({ question: 'x', timeoutMinutes: 0 })).statusCode, 400);
    const created = await ask({ question: 'Delete the staging database?', timeoutMinutes: 1 });
    assert.deepEqual(created.json().options, ['Approve', 'Deny']);
    const id = created.json().id;
    const realNow = Date.now;
    Date.now = () => realNow() + 61000;
    t.after(() => {
        Date.now = realNow;
    });
    assert.equal(
        (await app.inject({ url: `/api/approvals/${id}`, headers: agent })).json().status,
        'expired',
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: `/api/approvals/${id}/answer`,
                headers: session,
                payload: { answer: 'Approve' },
            })
        ).statusCode,
        409,
    );
});

test('approval retries preserve the action and audit history without spending another request', async (t) => {
    const mail: MailMessage[] = [];
    const { app, session, agent } = await connected(mail);
    t.after(() => app.close());
    const ask = (target: string, key = 'release-v4') =>
        app.inject({
            method: 'POST',
            url: '/api/approvals',
            headers: { ...agent, 'idempotency-key': key },
            payload: {
                question: 'Deploy the release?',
                action: { type: 'deploy.release', target, summary: 'Three files changed' },
            },
        });
    const [first, retry] = await Promise.all([ask('production'), ask('production')]);
    assert.deepEqual([first.statusCode, retry.statusCode].sort(), [200, 201]);
    assert.equal(first.json().id, retry.json().id);
    const id = first.json().id;
    assert.equal((await ask('staging')).statusCode, 409);
    assert.equal(mail.filter((item) => item.text.includes(id)).length, 1);
    assert.equal((await ask('staging', 'next')).statusCode, 201);
    const firstPage = (await app.inject({ url: '/api/approvals?limit=1', headers: agent })).json();
    assert.ok(firstPage.nextCursor);
    const secondPage = (
        await app.inject({
            url: '/api/approvals?limit=1&cursor=' + firstPage.nextCursor,
            headers: agent,
        })
    ).json();
    assert.notEqual(firstPage.approvals[0].id, secondPage.approvals[0].id);
    const answer = () =>
        app.inject({
            method: 'POST',
            url: `/api/approvals/${id}/answer`,
            headers: session,
            payload: { answer: 'Approve', note: 'Proceed' },
        });
    const responses = await Promise.all([answer(), answer()]);
    assert.deepEqual(responses.map((item) => item.statusCode).sort(), [200, 409]);
    const after = await ask('production');
    assert.equal(after.json().status, 'answered');
    assert.deepEqual(after.json().action, {
        type: 'deploy.release',
        target: 'production',
        summary: 'Three files changed',
    });
    assert.equal(after.json().idempotency, undefined);
    const audited = (
        await app.inject({ url: `/api/approvals/${id}/events`, headers: agent })
    ).json().events;
    assert.deepEqual(
        audited.map((event: { type: string }) => event.type),
        ['requested', 'answered'],
    );
    assert.equal(audited[1].actor, 'owner');
    assert.match(audited[1].actorId, /^[a-f0-9-]{36}$/);
    const filtered = (
        await app.inject({ url: '/api/approvals?status=answered&outcome=Approve', headers: agent })
    ).json();
    assert.deepEqual(
        filtered.approvals.map((item: { id: string }) => item.id),
        [id],
    );
    const byDecision = (decision: string) =>
        app.inject({ url: '/api/approvals?decision=' + decision, headers: agent });
    assert.deepEqual(
        (await byDecision('approved')).json().approvals.map((item: { id: string }) => item.id),
        [id],
    );
    assert.deepEqual((await byDecision('denied')).json().approvals, []);
    assert.equal(after.json().requesterKind, 'agent');
    const names = (await app.inject({ url: '/api/approvals/agents', headers: agent })).json()
        .agents;
    assert.ok(names.includes(after.json().agentName));
    const rpc = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...agent, accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'resource_request',
                arguments: { kind: 'approvals', action: 'events', id },
            },
        },
    });
    assert.deepEqual(JSON.parse(rpc.json().result.content[0].text).events, audited);
});

test('only a signed-in owner or admin can change policy and signing secrets are returned once', async (t) => {
    const { app, session, agent } = await connected([]);
    t.after(() => app.close());
    const update = (payload: object, headers = session) =>
        app.inject({ method: 'PUT', url: '/api/approvals/policy', headers, payload });
    const draft = {
        url: 'https://example.com/notifications',
        reminderMinutes: 3,
        escalationMinutes: 5,
    };
    assert.equal((await update(draft, { ...session, ...agent })).statusCode, 403);
    assert.equal((await update({ ...draft, url: 'https://127.0.0.1/' })).statusCode, 400);
    assert.equal((await update({ ...draft, escalationMinutes: 2 })).statusCode, 400);
    const first = await update(draft);
    assert.equal(first.statusCode, 200, first.body);
    assert.match(first.json().signingSecret, /^kvas_/);
    assert.equal((await update(draft)).json().signingSecret, undefined);
    const readable = (await app.inject({ url: '/api/approvals/policy', headers: agent })).json();
    assert.deepEqual(readable, { enabled: true, reminderMinutes: 3, escalationMinutes: 5 });
    const rotated = (await update({ ...draft, rotateSecret: true })).json();
    assert.notEqual(rotated.signingSecret, first.json().signingSecret);
    assert.deepEqual((await update({ url: null })).json(), { enabled: false });
});
