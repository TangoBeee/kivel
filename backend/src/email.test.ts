import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { emailInboxId, emailLocalPart, extractFromEmail } from './email.js';

const secret = 'test-ingest-secret-that-is-long-enough-123';
const signed = (body: object, key = secret, timestamp = Math.floor(Date.now() / 1000)) => {
    const payload = JSON.stringify(body);
    return {
        payload,
        headers: {
            'content-type': 'application/json',
            'x-socket-timestamp': String(timestamp),
            'x-socket-signature': `sha256=${createHmac('sha256', key).update(`${timestamp}.${payload}`).digest('hex')}`,
        },
    };
};

test('addresses round-trip to inbox IDs and reject anything else', () => {
    const id = 'c5b8a8f2-3c44-4d1e-9a6b-0f1e2d3c4b5a';
    const local = emailLocalPart(id);
    assert.match(local, /^[a-z2-7]{26}$/);
    assert.equal(emailInboxId(local), id);
    assert.equal(emailInboxId(local.toUpperCase()), id);
    assert.equal(emailInboxId('admin'), undefined);
    assert.equal(emailInboxId('a'.repeat(27)), undefined);
});

test('one-time codes and verification links are extracted without false years', () => {
    const first = extractFromEmail(
        'Your Acme verification code',
        'Hi! Your verification code is 482913. It expires in 2026.\nOr click https://acme.test/verify?token=abc&amp;u=1.\nUnsubscribe: https://acme.test/unsubscribe',
    );
    assert.deepEqual(first.codes, ['482913']);
    assert.deepEqual(first.links, [
        { url: 'https://acme.test/verify?token=abc&u=1', kind: 'verification' },
    ]);
    assert.deepEqual(extractFromEmail('Sign in', 'Use code AB12CD to sign in.').codes, ['AB12CD']);
    assert.deepEqual(extractFromEmail('Welcome', 'Order 482913 has shipped.').codes, []);
    assert.deepEqual(extractFromEmail('Your OTP', 'OTP: 123 456').codes, ['123 456']);
});

test('email inboxes receive signed mail, expose codes over HTTP and MCP, and refuse forgeries', async (t) => {
    const app = buildApp({ mailDomain: 'socketspace.xyz', emailIngestSecret: secret });
    t.after(() => app.close());
    const created = await app.inject({ method: 'POST', url: '/api/email-inboxes' });
    assert.equal(created.statusCode, 201, created.body);
    const inbox = created.json();
    assert.match(inbox.address, /^[a-z2-7]{26}@socketspace\.xyz$/);
    const auth = { 'x-resource-token': inbox.managementToken };
    const waiting = app.inject({
        url: `/api/email-inboxes/${inbox.id}/wait?timeoutSeconds=5`,
        headers: auth,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const mail = {
        to: inbox.address.toUpperCase(),
        from: 'Acme <no-reply@acme.test>',
        subject: 'Confirm your email',
        text: 'Your verification code is 700412. Confirm: https://acme.test/confirm/xyz',
        attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', size: 10 }],
    };
    const delivered = await app.inject({ method: 'POST', url: '/hooks/email', ...signed(mail) });
    assert.equal(delivered.statusCode, 202, delivered.body);
    const arrived = (await waiting).json();
    assert.equal(arrived.timedOut, false);
    assert.deepEqual(arrived.messages[0].codes, ['700412']);
    assert.equal(arrived.messages[0].links[0].kind, 'verification');
    assert.equal(arrived.messages[0].attachments[0].filename, 'a.pdf');

    assert.equal(
        (await app.inject({ method: 'POST', url: '/hooks/email', ...signed(mail, 'x'.repeat(40)) }))
            .statusCode,
        401,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/hooks/email',
                ...signed(mail, secret, Math.floor(Date.now() / 1000) - 3600),
            })
        ).statusCode,
        401,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/hooks/email',
                ...signed({ ...mail, to: `${'a'.repeat(26)}@socketspace.xyz` }),
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'POST',
                url: '/hooks/email',
                ...signed({ ...mail, to: inbox.address.replace('socketspace.xyz', 'evil.test') }),
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (await app.inject({ url: `/api/email-inboxes/${inbox.id}/messages` })).statusCode,
        404,
    );

    const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    };
    const call = async (name: string, args: object) =>
        JSON.parse(
            (
                await app.inject({
                    method: 'POST',
                    url: '/mcp',
                    headers,
                    payload: {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: { name, arguments: args },
                    },
                })
            ).json().result.content[0].text,
        );
    const viaMcp = await call('create_email_inbox', {});
    assert.match(viaMcp.address, /@socketspace\.xyz$/);
    const listed = await call('list_emails', { id: inbox.id, token: inbox.managementToken });
    assert.equal(listed.messages.length, 1);
    const idle = await call('wait_for_email', {
        id: inbox.id,
        token: inbox.managementToken,
        after: listed.messages[0].id,
        timeoutSeconds: 1,
    });
    assert.equal(idle.timedOut, true);
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/email-inboxes/${inbox.id}`,
                headers: auth,
            })
        ).statusCode,
        204,
    );
});

test('email inboxes report clearly when the mail domain is not configured', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    assert.equal((await app.inject({ method: 'POST', url: '/api/email-inboxes' })).statusCode, 503);
    assert.equal(
        (await app.inject({ method: 'POST', url: '/hooks/email', payload: {} })).statusCode,
        503,
    );
});
