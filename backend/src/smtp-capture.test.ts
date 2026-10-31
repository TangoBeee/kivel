import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import nodemailer from 'nodemailer';
import { buildApp } from './app.js';
async function freePort() {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
}
test('SMTP capture authenticates per inbox, keeps messages private, rotates credentials and never relays recipients', async (t) => {
    const port = await freePort();
    const app = buildApp({
        smtpCaptureConfig: {
            port,
            host: '127.0.0.1',
            publicHost: 'localhost',
            publicPort: port,
            local: true,
        },
    });
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const registration = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'smtp-user',
            email: 'smtp@example.test',
            password: 'correct-horse-battery-staple',
        },
    });
    const cookie = String(registration.headers['set-cookie']).split(';')[0]!;
    const key = (
        await app.inject({
            method: 'POST',
            url: '/api/account/keys',
            headers: { origin, cookie },
            payload: { name: 'SMTP' },
        })
    ).json();
    const headers = { authorization: `Bearer ${key.key}` };
    const response = await app.inject({ method: 'POST', url: '/api/smtp-inboxes', headers });
    assert.equal(response.statusCode, 201, response.body);
    const capture = response.json();
    const send = (password: string) =>
        nodemailer
            .createTransport({
                host: '127.0.0.1',
                port,
                secure: false,
                ignoreTLS: true,
                auth: { user: capture.id, pass: password },
            })
            .sendMail({
                from: 'app@example.com',
                to: 'real-recipient@example.org',
                subject: 'Verification code',
                text: 'Your verification code is 123456.',
            });
    await send(capture.smtp.password);
    const mail = (
        await app.inject({ url: `/api/email-inboxes/${capture.id}/messages`, headers })
    ).json().messages;
    assert.equal(mail.length, 1);
    assert.deepEqual(mail[0].codes, ['123456']);
    assert.equal(mail[0].to, 'real-recipient@example.org');
    assert.equal(
        (await app.inject({ url: `/api/email-inboxes/${capture.id}/messages` })).statusCode,
        404,
    );
    await assert.rejects(() => send('invalid-password'));
    const rotated = (
        await app.inject({ method: 'POST', url: `/api/smtp-inboxes/${capture.id}/rotate`, headers })
    ).json();
    await assert.rejects(() => send(capture.smtp.password));
    await send(rotated.smtp.password);
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/email-inboxes/${capture.id}`, headers }))
            .statusCode,
        204,
    );
    await assert.rejects(() => send(rotated.smtp.password));
});
