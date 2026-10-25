import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { SMTPServer } from 'smtp-server';
import { buildApp } from './app.js';
import { RateLimiter } from './rate-limit.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryRecoveryRepository } from './recovery-store.js';
import { smtpSender } from './mail.js';
import type { MailMessage } from './mail.js';
const origin = 'http://localhost:3000',
    original = 'original-password-for-test',
    replacement = 'replacement-password-for-test';
const codeFrom = (value: string) => value.match(/\bcode is:\s+(\d{8})\b/)![1]!;
async function until(check: () => boolean) {
    for (let i = 0; i < 150; i++) {
        if (check()) return;
        await delay(10);
    }
    throw new Error('Email did not arrive.');
}

test('real SMTP verification and password reset preserve ownership, revoke credentials, and reject URL tokens and replay', async (t) => {
    const mail: string[] = [];
    const server = new SMTPServer({
        authOptional: true,
        disabledCommands: ['STARTTLS'],
        onData(stream, _session, done) {
            let text = '';
            stream.on('data', (chunk) => {
                text += chunk;
            });
            stream.on('end', () => {
                mail.push(text);
                done();
            });
        },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve) => server.close(resolve)));
    const port = (server.server.address() as { port: number }).port;
    let limitTime = Date.now();
    const strictSender = smtpSender({
        host: '127.0.0.1',
        port,
        from: 'accounts@socket.test',
        local: false,
    });
    await assert.rejects(() =>
        strictSender.send({
            to: 'user@example.test',
            subject: 'TLS required',
            text: 'Not delivered over plaintext.',
        }),
    );
    strictSender.close();
    assert.equal(mail.length, 0);
    const identities = new MemoryIdentityRepository(),
        store = new MemoryRecoveryRepository(identities);
    const app = buildApp({
        identityStore: identities,
        recoveryStore: store,
        rateLimiter: new RateLimiter(() => limitTime),
        authSecret: 'test-recovery-secret-at-least-32-characters',
        mailSender: smtpSender({
            host: '127.0.0.1',
            port,
            from: 'accounts@socket.test',
            local: true,
        }),
    });
    t.after(() => app.close());
    const registration = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: { username: 'recoverable', password: original, email: 'USER@Example.test' },
    });
    assert.equal(registration.statusCode, 201, registration.body);
    const userId = registration.json().user.id,
        cookie = String(registration.headers['set-cookie']).split(';')[0]!;
    await until(() => mail.length === 1);
    assert.match(mail[0]!, /user@example.test/);
    const verification = codeFrom(mail[0]!);
    assert.equal((await store.status(userId)).verifiedAt, null);
    const verify = () =>
        app.inject({
            method: 'POST',
            url: '/api/account/email/verify',
            headers: { origin, cookie },
            payload: { code: verification },
        });
    assert.equal((await verify()).statusCode, 204);
    assert.equal((await verify()).statusCode, 400);
    assert.equal((await store.status(userId)).email, 'user@example.test');
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin, cookie },
            payload: { name: 'Before reset' },
        })
    ).json();
    const resource = (
        await app.inject({ method: 'POST', url: '/api/inboxes', headers: { origin, cookie } })
    ).json();
    const unknown = await app.inject({
        method: 'POST',
        url: '/api/auth/password/forgot',
        headers: { origin },
        payload: { email: 'nobody@example.test' },
    });
    const reset = await app.inject({
        method: 'POST',
        url: '/api/auth/password/forgot',
        headers: { origin },
        payload: { email: 'user@example.test' },
    });
    assert.equal(unknown.statusCode, 202);
    assert.equal(reset.statusCode, 202);
    assert.deepEqual(unknown.json(), reset.json());
    // Registration and reset share an email cooldown.
    assert.equal(mail.length, 1);
    const recipient = await store.recipient('user@example.test');
    assert.ok(recipient);
    limitTime += 61000;
    const resetApp = app;
    await resetApp.inject({
        method: 'POST',
        url: '/api/auth/password/forgot',
        headers: { origin },
        payload: { email: 'user@example.test' },
    });
    await until(() => mail.length === 2);
    const resetCode = codeFrom(mail[1]!);
    assert.equal(
        (
            await resetApp.inject({
                method: 'POST',
                url: `/api/auth/password/reset?code=${resetCode}`,
                headers: { origin },
                payload: { email: 'user@example.test', password: replacement },
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (
            await resetApp.inject({
                method: 'POST',
                url: '/api/auth/password/reset',
                headers: { origin: 'https://foreign.test' },
                payload: { email: 'user@example.test', code: resetCode, password: replacement },
            })
        ).statusCode,
        403,
    );
    const change = () =>
        resetApp.inject({
            method: 'POST',
            url: '/api/auth/password/reset',
            headers: { origin },
            payload: { email: 'user@example.test', code: resetCode, password: replacement },
        });
    assert.equal((await change()).statusCode, 204);
    assert.equal((await change()).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/account', headers: { cookie } })).statusCode, 401);
    assert.equal(
        (await app.inject({ url: '/api/account', headers: { authorization: `Bearer ${key.key}` } }))
            .statusCode,
        401,
    );
    assert.equal(
        await identities.createSession(
            userId,
            registration.json().account.id,
            'stale',
            recipient.passwordHash,
        ),
        false,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/auth/login',
                headers: { origin },
                payload: { username: 'recoverable', password: original },
            })
        ).statusCode,
        401,
    );
    const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin },
        payload: { username: 'recoverable', password: replacement },
    });
    assert.equal(login.statusCode, 200);
    const newCookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.equal(
        (await app.inject({ url: `/api/inboxes/${resource.id}`, headers: { cookie: newCookie } }))
            .statusCode,
        200,
    );
});

test('verification requires a current browser session and password; codes expire and lock after five failures', async (t) => {
    let now = Date.now();
    const identities = new MemoryIdentityRepository(),
        store = new MemoryRecoveryRepository(identities, () => now),
        mail: MailMessage[] = [];
    const app = buildApp({
        identityStore: identities,
        recoveryStore: store,
        mailSender: {
            async send(value) {
                mail.push(value);
            },
            close() {},
        },
    });
    t.after(() => app.close());
    const user = (await identities.register(
        'code-check',
        await (await import('./identity.js')).passwordHash(original),
    ))!;
    const token = 'a'.repeat(43);
    await identities.createSession(user.id, user.personalAccountId, token);
    const cookie = `socket_session=${token}`,
        id = user.id;
    const request = (email: string, password = original) =>
        app.inject({
            method: 'POST',
            url: '/api/account/email',
            headers: { origin, cookie },
            payload: { email, password },
        });
    assert.equal((await request('first@example.test', 'wrong-password-for-check')).statusCode, 401);
    assert.equal((await request('first@example.test')).statusCode, 202);
    await until(() => mail.length === 1);
    const code = codeFrom(mail[0]!.text),
        wrong = String((Number(code) + 1) % 100000000).padStart(8, '0');
    const verify = (value: string) =>
        app.inject({
            method: 'POST',
            url: '/api/account/email/verify',
            headers: { origin, cookie },
            payload: { code: value },
        });
    for (let i = 0; i < 5; i++) assert.equal((await verify(wrong)).statusCode, 400);
    assert.equal((await verify(code)).statusCode, 400);
    assert.equal((await store.status(id)).email, null);
    assert.equal((await request('second@example.test')).statusCode, 202);
    await until(() => mail.length === 2);
    now += 16 * 60000;
    assert.equal((await verify(codeFrom(mail[1]!.text))).statusCode, 400);
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin, cookie },
            payload: { name: 'No browser' },
        })
    ).json();
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/api/account/email',
                headers: { origin, authorization: `Bearer ${key.key}` },
                payload: { email: 'third@example.test', password: original },
            })
        ).statusCode,
        403,
    );
    assert.equal(mail.length, 2);
});

test('outbox payloads are encrypted and failed sends can be retried without issuing a new code', async (t) => {
    const identities = new MemoryIdentityRepository(),
        store = new MemoryRecoveryRepository(identities),
        mail: MailMessage[] = [];
    const app = buildApp({
        identityStore: identities,
        recoveryStore: store,
        authSecret: 'a-stable-outbox-secret-for-this-test',
        mailSender: {
            async send(value) {
                mail.push(value);
                throw Error('SMTP failure');
            },
            close() {},
        },
    });
    t.after(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: { username: 'queued-mail', password: original, email: 'retry@example.test' },
    });
    await until(() => mail.length === 1);
    const jobs = (store as unknown as { jobs: Map<string, { payload: Buffer }> }).jobs;
    assert.equal(jobs.size, 1);
    const encrypted = [...jobs.values()][0]!.payload;
    assert.equal(encrypted.includes(Buffer.from(codeFrom(mail[0]!.text))), false);
    assert.equal(encrypted.includes(Buffer.from('retry@example.test')), false);
});
