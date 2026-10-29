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
