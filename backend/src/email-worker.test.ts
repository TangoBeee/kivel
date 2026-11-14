import assert from 'node:assert/strict';
import { test } from 'node:test';
import PostalMime from 'postal-mime';
// The Cloudflare worker deliberately ships plain JavaScript.
// @ts-expect-error worker module has no TypeScript declaration
import { deliveryFeedback } from '../../deploy/email-worker/src/feedback.js';

test('real MIME delivery reports extract only permanent failures and ARF complaints', async () => {
    const mime = (type: string, report: string) =>
        `From: postmaster@example.com\r\nTo: bounces@example.com\r\nSubject: Delivery report\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=${type === 'message/delivery-status' ? 'delivery-status' : 'feedback-report'}; boundary="report"\r\n\r\n--report\r\nContent-Type: text/plain\r\n\r\nReport attached.\r\n--report\r\nContent-Type: ${type}\r\nContent-Disposition: attachment\r\n\r\n${report}\r\n--report--\r\n`;
    const report =
        'Reporting-MTA: dns; mx.example.com\r\n\r\nFinal-Recipient: rfc822; receiver@example.com\r\nAction: failed\r\nStatus: 5.1.1\r\n';
    const bounce = await PostalMime.parse(mime('message/delivery-status', report));
    assert.deepEqual(deliveryFeedback(bounce, ''), {
        type: 'bounce',
        recipient: 'receiver@example.com',
    });
    assert.equal(deliveryFeedback(bounce, 'sender@example.com'), undefined);
    assert.equal(
        deliveryFeedback(
            await PostalMime.parse(
                mime('message/delivery-status', report.replace('5.1.1', '4.2.0')),
            ),
            '',
        ),
        undefined,
    );
    const complaint = await PostalMime.parse(
        mime(
            'message/feedback-report',
            'Feedback-Type: abuse\r\nOriginal-Recipient: rfc822; receiver@example.com\r\n',
        ),
    );
    assert.deepEqual(deliveryFeedback(complaint, 'feedback@example.com'), {
        type: 'complaint-review',
        recipient: 'receiver@example.com',
    });
});

test('the email worker preserves the envelope sender independently of a forged header From', async (t) => {
    // @ts-expect-error worker module has no TypeScript declaration
    const { createEmailWorker } = await import('../../deploy/email-worker/src/handler.js');
    let delivered: Record<string, unknown> | undefined;
    t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
        delivered = JSON.parse(String(options.body));
        return new Response(JSON.stringify({ stored: false }), { status: 202 });
    });
    const raw =
        'From: Trusted <trusted@example.com>\r\nTo: inbox@example.test\r\nSubject: Forged sender\r\n\r\nMessage';
    const worker = createEmailWorker((input: ArrayBuffer) => PostalMime.parse(input));
    await worker.email(
        {
            from: 'attacker@other.test',
            to: 'inbox@example.test',
            rawSize: Buffer.byteLength(raw),
            raw: new Response(raw).body,
            setReject: (reason: string) => assert.fail(reason),
        },
        {
            INGEST_URL: 'https://kivel.example/hooks/email',
            EMAIL_INGEST_SECRET: 'test-worker-secret',
        },
    );
    assert.equal(delivered?.mailFrom, 'attacker@other.test');
    assert.equal(delivered?.from, 'Trusted <trusted@example.com>');
});

test('a customer Worker delivers only to its exact address with its own routing key', async (t) => {
    // @ts-expect-error worker module has no TypeScript declaration
    const { createEmailWorker } = await import('../../deploy/email-worker/src/handler.js');
    const { buildApp } = await import('./app.js');
    const { MemoryIdentityRepository } = await import('./identity.js');
    const { randomBytes } = await import('node:crypto');
    const identities = new MemoryIdentityRepository();
    let ownership = false;
    let routing = false;
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'default-worker-secret',
        authSecret: 'fixture-auth-secret',
        emailCustomDns: async (record) => {
            assert.match(record.name, /^_kivel-mail\.agents\.example\.com$/);
            return { ownership, routing };
        },
    });
    t.after(() => app.close());
    const user = (await identities.register('custom-inbox-owner', 'unused'))!;
    await identities.setEntitlement(
        user.personalAccountId,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    const session = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, user.personalAccountId, session);
    const identity = (await identities.authenticateSession(session))!;
    const key = await identities.createKey(
        identity,
        'Agent',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const human = { cookie: `kivel_session=${session}`, origin: 'http://localhost:3000' };
    const agent = { authorization: `Bearer ${key.key}` };
    const inbox = await app.inject({
        method: 'POST',
        url: '/api/email-inboxes',
        headers: human,
        payload: {},
    });
    assert.equal(inbox.statusCode, 201, inbox.body);
    const base = `/api/email-inboxes/${inbox.json().id}`;
    const path = `${base}/custom-address`;
    const address = 'agent@agents.example.com';
    const verify = (rotate = false, headers: Record<string, string> = human) =>
        app.inject({ method: 'PUT', url: path, headers, payload: { address, rotate } });
    assert.equal((await verify(false, agent)).statusCode, 403);
    assert.equal((await verify()).statusCode, 409);
    ownership = true;
    assert.equal((await verify()).statusCode, 409);
    routing = true;
    const unknown = await app.inject({
        method: 'GET',
        url: `${path}?address=${encodeURIComponent('agent@agents.example.com/unwanted')}`,
        headers: human,
    });
    assert.equal(unknown.statusCode, 400);
    const other = (await identities.register('unrelated-workspace', 'unused'))!;
    const otherSession = randomBytes(32).toString('base64url');
    await identities.createSession(other.id, other.personalAccountId, otherSession);
    const foreign = await app.inject({
        url: path,
        headers: { cookie: `kivel_session=${otherSession}` },
    });
    assert.equal(foreign.statusCode, 404);
    const setup = await verify();
    assert.equal(setup.statusCode, 200, setup.body);
    const route = setup.json();
    const metadata = await app.inject({ url: path, headers: agent });
    assert.equal(metadata.statusCode, 200, metadata.body);
    assert.equal(metadata.json().customAddress.address, address);
    assert.ok(!metadata.body.includes(route.routingKey));
    assert.equal(
        (await app.inject({ url: base, headers: agent })).json().address,
        inbox.json().address,
    );

    let calls = 0;
    let accepted = 0;
    t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
        calls++;
        const reply = await app.inject({
            method: 'POST',
            url: '/hooks/email',
            headers: options.headers as Record<string, string>,
            payload: String(options.body),
        });
        if (reply.statusCode === 202) accepted++;
        return new Response(reply.body, { status: reply.statusCode });
    });
    const worker = createEmailWorker((input: ArrayBuffer) => PostalMime.parse(input));
    const raw = [
        'From: Trusted <trusted@example.com>',
        'To: forged@example.com',
        'Subject: Verify',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="test-mail"',
        '',
        '--test-mail',
        'Content-Type: text/plain',
        '',
        'Verification code is 482901.',
        '--test-mail',
        'Content-Type: text/plain; name="receipt.txt"',
        'Content-Disposition: attachment; filename="receipt.txt"',
        '',
        'receipt bytes',
        '--test-mail--',
        '',
    ].join('\r\n');
    async function deliver(key: string, to = address, configured = address) {
        const rejects: string[] = [];
        await worker.email(
            {
                from: 'smtp@example.com',
                to,
                rawSize: Buffer.byteLength(raw),
                raw: new Response(raw).body,
                setReject: (reason: string) => rejects.push(reason),
            },
            {
                INGEST_URL: 'https://kivel.example/hooks/email',
                CUSTOM_ROUTE_ADDRESS: configured,
                CUSTOM_ROUTE_KEY: key,
            },
        );
        return rejects;
    }
    assert.deepEqual(await deliver(route.routingKey, 'other@agents.example.com'), [
        'No such mailbox.',
    ]);
    assert.equal(calls, 0);
    assert.deepEqual(await deliver(route.routingKey), []);
    assert.deepEqual(await deliver(route.routingKey), []);
    assert.equal(accepted, 2);
    const messages = (await app.inject({ url: `${base}/messages`, headers: agent })).json()
        .messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, address);
    assert.deepEqual(messages[0].codes, ['482901']);
    assert.equal(messages[0].attachments[0].filename, 'receipt.txt');
    const attachment = await app.inject({
        url: `${base}/messages/${messages[0].id}/attachments/${messages[0].attachments[0].id}`,
        headers: agent,
    });
    assert.equal(attachment.statusCode, 200);
    assert.deepEqual(
        await deliver(route.routingKey, 'other@agents.example.com', 'other@agents.example.com'),
        ['No such mailbox.'],
    );
    const rotated = (await verify(true)).json().routingKey;
    assert.notEqual(rotated, route.routingKey);
    assert.deepEqual(await deliver(route.routingKey), ['No such mailbox.']);
    ownership = false;
    assert.deepEqual(await deliver(rotated), ['No such mailbox.']);
    ownership = true;
    assert.equal(
        (await app.inject({ method: 'DELETE', url: path, headers: agent })).statusCode,
        403,
    );
    assert.equal(
        (await app.inject({ method: 'DELETE', url: path, headers: human })).statusCode,
        204,
    );
    assert.deepEqual(await deliver(rotated), ['No such mailbox.']);
    assert.equal(
        (await app.inject({ url: `${base}/messages`, headers: agent })).json().messages.length,
        1,
    );
});
