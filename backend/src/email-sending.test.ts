import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryRecoveryRepository } from './recovery-store.js';
import { MemoryEmailSending, newSendJob } from './email-sending-store.js';
import { RateLimiter } from './rate-limit.js';
import { liftEmailSuspension } from './email-admin.js';

async function fixture(
    t: { after: (callback: () => Promise<unknown>) => void },
    plan: 'free' | 'pro' | 'team' = 'pro',
) {
    const identities = new MemoryIdentityRepository(),
        store = new MemoryEmailSending();
    const user = identities.register('email-sender', 'test-hash')!;
    const session = randomBytes(32).toString('base64url');
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    identities.setEntitlement(
        identity.account.id,
        plan,
        plan === 'free' ? null : new Date(Date.now() + 86400000).toISOString(),
    );
    const key = identities.createKey(
        identity,
        'Sender',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const recovery = new MemoryRecoveryRepository(identities);
    let fail = false;
    let verified = plan !== 'free',
        clock = Date.now();
    recovery.status = async () => ({
        email: 'owner@example.com',
        pendingEmail: null,
        verifiedAt: verified ? new Date().toISOString() : null,
    });
    const sent: { body: Record<string, unknown>; key: string; id: string }[] = [];
    const app = buildApp({
        identityStore: identities,
        recoveryStore: recovery,
        emailSending: store,
        rateLimiter: new RateLimiter(() => clock),
        authSecret: 'test-email-sending-secret-that-is-long-enough',
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'x'.repeat(40),
        agentEmailConfig: { host: 'mail', port: 587, enabled: true },
        agentEmailSend: async (body, key) => {
            const id = randomUUID();
            sent.push({ body, key, id });
            if (fail) throw new Error('Simulated interrupted SMTP submission');
            return { id };
        },
    });
    t.after(() => app.close());
    const headers = { authorization: `Bearer ${key.key}` };
    const inbox = (await app.inject({ method: 'POST', url: '/api/email-inboxes', headers })).json();
    const send = (
        key = randomUUID(),
        payload: object = {
            to: ['recipient@example.com'],
            subject: 'Hello',
            text: 'A test message.',
        },
    ) =>
        app.inject({
            method: 'POST',
            url: `/api/email-inboxes/${inbox.id}/send`,
            headers: { ...headers, 'idempotency-key': key },
            payload,
        });
    const event = (type: string, receipt = sent[0]!, valid = true) => {
        const payload = JSON.stringify({
            to: (receipt.body.envelope as { from: string }).from,
            feedback: {
                type: type === 'email.bounced' ? 'bounce' : 'complaint',
                recipient: (receipt.body.to as string[])[0],
            },
        });
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = createHmac('sha256', 'x'.repeat(40))
            .update(`${timestamp}.${payload}`)
            .digest('hex');
        return app.inject({
            method: 'POST',
            url: '/hooks/email',
            headers: {
                'content-type': 'application/json',
                'x-socket-timestamp': timestamp,
                'x-socket-signature': valid ? signature : '0'.repeat(64),
            },
            payload,
        });
    };
    return {
        app,
        inbox,
        headers,
        sent,
        store,
        identity,
        send,
        event,
        interrupt: () => {
            fail = true;
        },
        verify: () => {
            verified = true;
        },
        advance: () => {
            clock += 60001;
        },
    };
}

test('outbound email fixes the sender, adds unsubscribe/footer, stores the thread and retries idempotently', async (t) => {
    const f = await fixture(t);
    const key = randomUUID();
    const response = await f.send(key);
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(f.sent[0]!.body.from, f.inbox.address);
    assert.match(String(f.sent[0]!.body.text), /Sent by an AI agent through socket.help/);
    assert.match(
        String((f.sent[0]!.body.headers as Record<string, string>)['List-Unsubscribe']),
        /\/email\/unsubscribe\//,
    );
    assert.equal((await f.send(key)).statusCode, 200);
    assert.equal(f.sent.length, 1);
    assert.equal(
        (
            await f.send(key, {
                to: ['other@example.com'],
                subject: 'Different',
                text: 'Do not send.',
            })
        ).statusCode,
        409,
    );
    const messages = (
        await f.app.inject({ url: `/api/email-inboxes/${f.inbox.id}/messages`, headers: f.headers })
    ).json().messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].direction, 'outbound');
    assert.equal(messages[0].deliveryStatus, 'sent');
    const url = String(
        (f.sent[0]!.body.headers as Record<string, string>)['List-Unsubscribe'],
    ).slice(1, -1);
    const path = new URL(url).pathname;
    assert.equal((await f.app.inject({ url: path })).statusCode, 200);
    assert.equal(
        (await f.send()).statusCode,
        202,
        'GET must not unsubscribe on a link scanner visit',
    );
    assert.equal((await f.app.inject({ method: 'POST', url: path })).statusCode, 200);
    assert.equal((await f.send()).statusCode, 403);
});

test('Free sending needs verified account mail, enforces recipient/daily/minute caps and rejects invalid input before reserving allowance', async (t) => {
    const f = await fixture(t, 'free');
    assert.equal((await f.send()).statusCode, 403);
    f.verify();
    assert.equal(
        (
            await f.send(randomUUID(), {
                to: ['one@example.com', 'two@example.com', 'three@example.com', 'four@example.com'],
                subject: 'Too many',
                text: 'No',
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (await f.send(randomUUID(), { to: ['one@example.com'], subject: 'No body' })).statusCode,
        400,
    );
    assert.equal(await f.store.withOwner(f.identity.account.id, (session) => session.usage()), 0);
    for (let index = 0; index < 3; index++) assert.equal((await f.send()).statusCode, 202);
    assert.equal((await f.send()).statusCode, 429);
    f.advance();
    const capped = await f.send();
    assert.equal(capped.statusCode, 429);
    assert.match(capped.body, /Daily email allowance/);
    assert.equal(f.sent.length, 3);
});

test('Return-Path complaints are recorded for review without suspension and duplicate bounces do not inflate rates', async (t) => {
    const f = await fixture(t);
    await f.send();
    assert.equal((await f.event('email.complained', f.sent[0], false)).statusCode, 401);
    assert.equal((await f.send()).statusCode, 202);
    assert.equal((await f.event('email.complained')).statusCode, 202);
    assert.equal((await f.send()).statusCode, 202);
    const stats = await f.store.withOwner(f.identity.account.id, (session) => session.reputation());
    assert.equal(stats.suspended, null);
    const reported = (await f.store.find(
        String(f.sent[0]!.body.messageId).slice(1).split('.')[0]!,
    ))!;
    assert.equal(reported.recipients[0]!.complained, true);
    assert.ok(reported.recipients[0]!.complaintReportedAt);
    assert.equal(
        await f.store.withOwner(f.identity.account.id, (session) =>
            session.blocked('recipient@example.com'),
        ),
        false,
    );
    const g = await fixture(t);
    await g.send();
    const jobId = String(g.sent[0]!.body.messageId).slice(1).split('.')[0]!;
    await g.store.withOwner(g.identity.account.id, async (session) => {
        const job = newSendJob({
            ownerId: g.identity.account.id,
            inboxId: g.inbox.id,
            key: randomUUID(),
            hash: 'seed',
            recipients: Array.from({ length: 19 }, () => ({
                address: 'other@example.com',
                providerId: randomUUID(),
            })),
        });
        job.status = 'sent';
        await session.save(job);
    });
    assert.equal((await g.event('email.bounced')).statusCode, 202);
    assert.equal((await g.event('email.bounced')).statusCode, 202);
    const first = await g.store.withOwner(g.identity.account.id, (session) => session.reputation());
    assert.equal(first.bounced, 1);
    assert.equal(first.suspended, null, 'Exactly 5% does not exceed the threshold');
    const job = (await g.store.find(jobId))!;
    assert.equal(job.recipients[0]!.bounced, true);
});

test('Pro and Team daily allowances are enforced before provider calls; a lone bounce does not suspend', async (t) => {
    for (const [plan, cap] of [
        ['pro', 50],
        ['team', 300],
    ] as const) {
        const f = await fixture(t, plan);
        await f.store.withOwner(f.identity.account.id, async (session) => {
            for (let index = 0; index < cap; index += 10) {
                const job = newSendJob({
                    ownerId: f.identity.account.id,
                    inboxId: f.inbox.id,
                    key: randomUUID(),
                    hash: 'seed',
                    recipients: Array.from({ length: 10 }, () => ({
                        address: 'seed@example.com',
                        providerId: randomUUID(),
                    })),
                });
                job.status = 'sent';
                await session.save(job);
            }
        });
        const response = await f.send();
        assert.equal(response.statusCode, 429, response.body);
        assert.equal(f.sent.length, 0);
    }
    const f = await fixture(t);
    await f.send();
    await f.event('email.bounced');
    assert.equal(
        (await f.store.withOwner(f.identity.account.id, (session) => session.reputation()))
            .suspended,
        null,
    );
});

test('bounce suspension needs 20 recipients in 30 days and operators can lift it without clearing suppression', async (t) => {
    const f = await fixture(t);
    await f.send();
    await f.store.withOwner(f.identity.account.id, async (session) => {
        const old = newSendJob({
            ownerId: f.identity.account.id,
            inboxId: f.inbox.id,
            key: randomUUID(),
            hash: 'old',
            recipients: Array.from({ length: 30 }, () => ({
                address: 'old@example.com',
                providerId: randomUUID(),
                bounced: true,
            })),
        });
        old.createdAt = new Date(Date.now() - 31 * 86400000).toISOString();
        old.status = 'sent';
        await session.save(old);
    });
    await f.event('email.bounced');
    assert.deepEqual(
        await f.store.withOwner(f.identity.account.id, (session) => session.reputation()),
        { sent: 1, bounced: 1, suspended: null },
    );
    await f.store.withOwner(f.identity.account.id, async (session) => {
        const recent = newSendJob({
            ownerId: f.identity.account.id,
            inboxId: f.inbox.id,
            key: randomUUID(),
            hash: 'recent',
            recipients: Array.from({ length: 19 }, (_, i) => ({
                address: `recent${i}@example.com`,
                providerId: randomUUID(),
                ...(i === 0 ? { bounced: true } : {}),
            })),
        });
        recent.status = 'sent';
        await session.save(recent);
    });
    await f.event('email.bounced');
    assert.match(
        (await f.store.withOwner(f.identity.account.id, (session) => session.reputation()))
            .suspended!,
        /30 days/,
    );
    await assert.rejects(liftEmailSuspension(f.store, 'invalid'), /UUID/);
    await liftEmailSuspension(f.store, f.identity.account.id);
    assert.equal(
        (await f.store.withOwner(f.identity.account.id, (session) => session.reputation()))
            .suspended,
        null,
    );
    assert.equal(
        await f.store.withOwner(f.identity.account.id, (session) =>
            session.blocked('recipient@example.com'),
        ),
        true,
    );
});

test('replyTo sets threading headers from received mail and cross-workspace sends are rejected', async (t) => {
    const f = await fixture(t);
    const payload = JSON.stringify({
        from: 'recipient@example.com',
        to: f.inbox.address,
        subject: 'A conversation',
        text: 'Reply here.',
        messageId: '<original@example.com>',
        references: ['<earlier@example.com>'],
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const delivered = await f.app.inject({
        method: 'POST',
        url: '/hooks/email',
        payload,
        headers: {
            'content-type': 'application/json',
            'x-socket-timestamp': timestamp,
            'x-socket-signature': createHmac('sha256', 'x'.repeat(40))
                .update(`${timestamp}.${payload}`)
                .digest('hex'),
        },
    });
    assert.equal(delivered.statusCode, 202, delivered.body);
    const received = (
        await f.app.inject({ url: `/api/email-inboxes/${f.inbox.id}/messages`, headers: f.headers })
    ).json().messages[0];
    const response = await f.send(randomUUID(), {
        to: ['recipient@example.com'],
        subject: 'Re: A conversation',
        text: 'A reply.',
        replyTo: received.id,
    });
    assert.equal(response.statusCode, 202, response.body);
    const headers = f.sent[0]!.body.headers as Record<string, string>;
    assert.equal(headers['In-Reply-To'], '<original@example.com>');
    assert.equal(headers.References, '<earlier@example.com> <original@example.com>');
    assert.equal(
        (
            await f.app.inject({
                method: 'POST',
                url: `/api/email-inboxes/${f.inbox.id}/send`,
                payload: { to: ['attacker@example.com'], subject: 'No', text: 'Not permitted.' },
                headers: { 'idempotency-key': randomUUID() },
            })
        ).statusCode,
        404,
    );
    const wait = await f.app.inject({
        url: `/api/email-inboxes/${f.inbox.id}/wait?after=${received.id}&timeoutSeconds=1`,
        headers: f.headers,
    });
    assert.equal(wait.json().timedOut, true, 'Sent messages must not masquerade as incoming mail');
});

test('monthly caps count deliveries on earlier days', async (t) => {
    const f = await fixture(t);
    await f.store.withOwner(f.identity.account.id, async (session) => {
        const job = newSendJob({
            ownerId: f.identity.account.id,
            inboxId: f.inbox.id,
            key: randomUUID(),
            hash: 'seed',
            recipients: Array.from({ length: 500 }, () => ({
                address: 'seed@example.com',
                providerId: randomUUID(),
            })),
        });
        const now = new Date();
        job.createdAt = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        ).toISOString();
        await session.save(job);
    });
    const response = await f.send();
    assert.equal(response.statusCode, 429);
    assert.match(response.body, /Monthly email allowance/);
});

test('an uncertain SMTP submission is reserved once and never resent automatically', async (t) => {
    const f = await fixture(t);
    f.interrupt();
    const key = randomUUID();
    assert.equal((await f.send(key)).statusCode, 502);
    const retry = await f.send(key);
    assert.equal(retry.statusCode, 409, retry.body);
    assert.match(retry.body, /uncertain relay outcome/);
    assert.equal(f.sent.length, 1);
    assert.equal(await f.store.withOwner(f.identity.account.id, (session) => session.usage()), 1);
});

test('every plan monthly limit is enforced and forged bounce addresses cannot suspend a sender', async (t) => {
    for (const [plan, cap] of [
        ['free', 30],
        ['pro', 500],
        ['team', 3000],
    ] as const) {
        const f = await fixture(t, plan);
        f.verify();
        await f.store.withOwner(f.identity.account.id, async (session) => {
            const job = newSendJob({
                ownerId: f.identity.account.id,
                inboxId: f.inbox.id,
                key: randomUUID(),
                hash: 'seed',
                recipients: Array.from({ length: cap }, () => ({
                    address: 'seed@example.com',
                    providerId: randomUUID(),
                })),
            });
            job.createdAt = new Date(
                Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
            ).toISOString();
            await session.save(job);
        });
        const response = await f.send();
        assert.equal(response.statusCode, 429);
        assert.match(response.body, /Monthly email allowance/);
    }
    const f = await fixture(t);
    await f.send();
    const payload = JSON.stringify({
        to: String((f.sent[0]!.body.envelope as { from: string }).from).replace(
            /-[A-Za-z0-9_-]{16}@/,
            '-AAAAAAAAAAAAAAAA@',
        ),
        feedback: { type: 'complaint', recipient: 'recipient@example.com' },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    await f.app.inject({
        method: 'POST',
        url: '/hooks/email',
        headers: {
            'content-type': 'application/json',
            'x-socket-timestamp': timestamp,
            'x-socket-signature': createHmac('sha256', 'x'.repeat(40))
                .update(`${timestamp}.${payload}`)
                .digest('hex'),
        },
        payload,
    });
    assert.equal(
        (await f.store.withOwner(f.identity.account.id, (session) => session.reputation()))
            .suspended,
        null,
    );
});
