import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from './app.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryEmailAddresses } from './email-addresses.js';
import { EmailLifecycle } from './email-lifecycle.js';
import { ResourceStore } from './resources.js';
import { MemoryEmailMessages } from './email.js';
import { entitlement } from './entitlements.js';
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
    const identities = new MemoryIdentityRepository();
    const headersAuth = await workspace(identities, 'pro');
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
    });
    t.after(() => app.close());
    const created = await app.inject({
        method: 'POST',
        url: '/api/email-inboxes',
        headers: headersAuth,
    });
    assert.equal(created.statusCode, 201, created.body);
    const inbox = created.json();
    assert.match(inbox.address, /^[a-z2-7]{26}@socketspace\.xyz$/);
    const auth = headersAuth;
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
        ...headersAuth,
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
    assert.equal((await app.inject({ method: 'POST', url: '/api/email-inboxes' })).statusCode, 402);
    assert.equal(
        (await app.inject({ method: 'POST', url: '/hooks/email', payload: {} })).statusCode,
        503,
    );
});

async function workspace(
    identities: MemoryIdentityRepository,
    plan: 'free' | 'pro' | 'team' = 'free',
    expired = false,
) {
    const user = (await identities.register(
        `mail-${randomBytes(4).toString('hex')}`,
        'test-hash',
    ))!;
    const session = randomBytes(32).toString('base64url');
    await identities.createSession(user.id, user.personalAccountId, session);
    const identity = (await identities.authenticateSession(session))!;
    await identities.setEntitlement(
        identity.account.id,
        plan,
        plan === 'free' ? null : new Date(Date.now() + (expired ? -1000 : 86400000)).toISOString(),
    );
    const key = await identities.createKey(
        identity,
        'Email test',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    return { authorization: `Bearer ${key.key}` };
}

test('plan checks cover guests, Free, Pro, Team and expired subscriptions over REST and MCP', async (t) => {
    const identities = new MemoryIdentityRepository();
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
    });
    t.after(() => app.close());
    const guest = await app.inject({ method: 'POST', url: '/api/email-inboxes' });
    assert.equal(guest.statusCode, 402);
    assert.equal(guest.json().requiredPlan, 'free');
    assert.match(guest.json().upgradeUrl, /\/plans\/$/);
    const mcp = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { accept: 'application/json, text/event-stream' },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'create_email_inbox', arguments: {} },
        },
    });
    assert.equal(mcp.json().result.isError, true);
    assert.match(mcp.json().result.content[0].text, /Free account.*plans.*do not retry/);
    for (const [plan, expired] of [
        ['free', false],
        ['pro', false],
        ['team', false],
        ['pro', true],
    ] as const) {
        const headers = await workspace(identities, plan, expired);
        const custom = await app.inject({
            method: 'POST',
            url: '/api/email-inboxes',
            headers,
            payload: { localPart: `qa-${randomBytes(4).toString('hex')}` },
        });
        assert.equal(custom.statusCode, plan === 'free' || expired ? 402 : 201, custom.body);
        if (custom.statusCode === 201) assert.equal(custom.json().expiresAt, null);
    }
});

test('Free has exactly one inbox under concurrent creation, valid lifetimes, private reads and permanent address retirement', async (t) => {
    const identities = new MemoryIdentityRepository();
    const addresses = new MemoryEmailAddresses();
    const app = buildApp({
        identityStore: identities,
        emailAddresses: addresses,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
    });
    t.after(() => app.close());
    const headers = await workspace(identities);
    for (const activeDays of [0, 8, 1.5, 'abc'])
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/email-inboxes',
                    headers,
                    payload: { activeDays },
                })
            ).statusCode,
            400,
        );
    const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
            app.inject({
                method: 'POST',
                url: '/api/email-inboxes',
                headers,
                payload: { activeDays: 2 },
            }),
        ),
    );
    const created = attempts.filter((r) => r.statusCode === 201);
    assert.equal(created.length, 1, attempts.map((r) => r.body).join('\n'));
    const inbox = created[0]!.json();
    assert.ok(Math.abs(Date.parse(inbox.expiresAt) - Date.now() - 2 * 86400000) < 5000);
    assert.equal(
        (
            await app.inject({
                url: `/api/email-inboxes/${inbox.id}`,
                headers: await workspace(identities),
            })
        ).statusCode,
        404,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: `/api/email-inboxes/${inbox.id}/renew`, headers }))
            .statusCode,
        409,
    );
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/email-inboxes/${inbox.id}`, headers }))
            .statusCode,
        204,
    );
    assert.ok((await addresses.find(inbox.address))?.retiredAt);
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/email-inboxes', headers })).statusCode,
        201,
    );
});

test('paid custom addresses reject reserved names and cannot be reused after deletion', async (t) => {
    const identities = new MemoryIdentityRepository();
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
    });
    t.after(() => app.close());
    const headers = await workspace(identities, 'pro');
    for (const localPart of [
        'admin',
        'postmaster',
        'support',
        'a',
        'Invalid',
        'bad..name',
        'a--b',
        'help',
        'team',
        'sales',
        'billing',
        'listmaster',
        'mail',
        'bounces',
        'verify',
        'noreply',
        'no-reply',
        'security',
        'sockethelp',
        'socket-help',
    ])
        assert.equal(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/email-inboxes',
                    headers,
                    payload: { localPart },
                })
            ).statusCode,
            400,
        );
    const request = {
        method: 'POST' as const,
        url: '/api/email-inboxes',
        headers,
        payload: { localPart: 'qa-bot-42' },
    };
    const created = (await app.inject(request)).json();
    assert.equal(created.address, 'qa-bot-42@socketspace.xyz');
    await app.inject({ method: 'DELETE', url: `/api/email-inboxes/${created.id}`, headers });
    assert.equal(
        (await app.inject({ ...request, headers: await workspace(identities, 'team') })).statusCode,
        409,
    );
});

test('email forwarding requires Pro and stops delivering as soon as the owner downgrades', async (t) => {
    const identities = new MemoryIdentityRepository();
    let deliveries = 0;
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: secret,
        forwardSend: async () => {
            deliveries++;
            return { status: 204 } as never;
        },
    });
    t.after(() => app.close());
    const headers = await workspace(identities);
    const identity = identities.authenticateKey(headers.authorization.slice(7))!;
    const inbox = (await app.inject({ method: 'POST', url: '/api/email-inboxes', headers })).json();
    const config = {
        method: 'PUT' as const,
        url: `/api/email-inboxes/${inbox.id}/forwarding`,
        headers,
        payload: { url: 'https://example.com/mail' },
    };
    const denied = await app.inject(config);
    assert.equal(denied.statusCode, 402);
    assert.equal(denied.json().requiredPlan, 'pro');
    identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    assert.equal((await app.inject(config)).statusCode, 200);
    const receive = () =>
        app.inject({
            method: 'POST',
            url: '/hooks/email',
            ...signed({
                to: inbox.address,
                from: 'sender@example.com',
                subject: 'Test',
                text: 'A message',
            }),
        });
    assert.equal((await receive()).statusCode, 202);
    assert.equal(deliveries, 1);
    identities.setEntitlement(identity.account.id, 'free', null);
    assert.equal((await receive()).statusCode, 202);
    assert.equal(deliveries, 1);
    assert.equal((await app.inject(config)).statusCode, 402);
});

test('email lifecycle upgrades, downgrades, pauses lapsed plans and retires after grace without reusing addresses', async () => {
    let now = Date.now();
    const identities = new MemoryIdentityRepository();
    const headers = await workspace(identities);
    const identity = (await identities.authenticateKey(headers.authorization.slice(7)))!;
    const addresses = new MemoryEmailAddresses(),
        resources = new ResourceStore(() => now),
        messages = new MemoryEmailMessages();
    const lifecycle = new EmailLifecycle(addresses, resources, identities, messages, () => now);
    const add = async (
        name: string,
        tier: 'free' | 'paid',
        createdAt: number,
        expiry: string | null,
    ) => {
        const row = addresses.claim(
            {
                address: `${name}@socketspace.xyz`,
                ownerId: identity.account.id,
                tier,
                createdAt: new Date(createdAt).toISOString(),
                expiresAt: expiry,
            },
            50,
        );
        row.resourceId = resources.create('email', { address: row.address }, undefined, {
            visibility: 'public',
            quotaKey: identity.account.quotaKey,
            plan: tier === 'paid' ? 'pro' : 'free',
            ownerId: identity.account.id,
            persistent: tier === 'paid',
            expiresAt: expiry ?? '9999-12-31T00:00:00.000Z',
        })!.id;
        addresses.save(row);
        return row;
    };
    const free = await add('initial', 'free', now, new Date(now + 3 * 86400000).toISOString());
    await identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(now + 86400000).toISOString(),
    );
    await lifecycle.reconcile();
    assert.equal(addresses.find(free.address)!.expiresAt, null);
    const newer = await add('newer', 'paid', now + 1, null);
    await identities.setEntitlement(identity.account.id, 'free', null);
    await lifecycle.reconcile();
    assert.equal(addresses.find(newer.address)!.tier, 'free');
    assert.ok(addresses.find(free.address)!.pausedAt);
    await identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(now + 86400000).toISOString(),
    );
    await lifecycle.reconcile();
    assert.equal(addresses.find(free.address)!.pausedAt, null);
    await identities.setEntitlement(identity.account.id, 'pro', new Date(now - 1000).toISOString());
    await lifecycle.reconcile();
    assert.ok(addresses.find(newer.address)!.pausedAt);
    now += 31 * 86400000;
    await lifecycle.reconcile();
    assert.ok(addresses.find(newer.address)!.retiredAt);
    assert.equal(resources.read(newer.resourceId!, 'email', '', identity.account.id), undefined);
    assert.throws(
        () => entitlement(identity, 'customEmailAddress', 'https://socket.help'),
        /requires Pro/,
    );
});

test('MCP relays the shared plan requirement and upgrade URL without creating an anonymous inbox', async (t) => {
    const app = buildApp();
    t.after(() => app.close());
    const response = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
        },
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'create_email_inbox', arguments: {} },
        },
    });
    const result = response.json().result;
    assert.equal(result.isError, true);
    const error = JSON.parse(result.content[0].text);
    assert.equal(error.requiredPlan, 'free');
    assert.match(error.upgradeUrl, /\/plans\/$/);
    assert.match(error.error, /do not retry/);
});

test('clearing owned email history frees storage and keeps the same receiving address', async (t) => {
    const identities = new MemoryIdentityRepository();
    const owner = await workspace(identities);
    const app = buildApp({
        identityStore: identities,
        mailDomain: 'socketspace.xyz',
        emailIngestSecret: 'x'.repeat(40),
    });
    t.after(() => app.close());
    const created = (
        await app.inject({ method: 'POST', url: '/api/email-inboxes', headers: owner })
    ).json();
    const payload = JSON.stringify({
            to: created.address,
            from: 'sender@example.com',
            subject: 'Code',
            text: 'Your verification code is 123456',
        }),
        timestamp = String(Math.floor(Date.now() / 1000));
    const headers = {
        'content-type': 'application/json',
        'x-socket-timestamp': timestamp,
        'x-socket-signature': createHmac('sha256', 'x'.repeat(40))
            .update(`${timestamp}.${payload}`)
            .digest('hex'),
    };
    assert.equal(
        (await app.inject({ method: 'POST', url: '/hooks/email', headers, payload })).statusCode,
        202,
    );
    assert.equal(
        (await app.inject({ method: 'DELETE', url: `/api/email-inboxes/${created.id}/messages` }))
            .statusCode,
        404,
    );
    assert.equal(
        (
            await app.inject({
                method: 'DELETE',
                url: `/api/email-inboxes/${created.id}/messages`,
                headers: owner,
            })
        ).statusCode,
        204,
    );
    assert.equal(
        (
            await app.inject({
                url: `/api/email-inboxes/${created.id}/messages`,
                headers: owner,
            })
        ).json().messages.length,
        0,
    );
    assert.equal(
        (await app.inject({ url: `/api/email-inboxes/${created.id}`, headers: owner })).json()
            .address,
        created.address,
    );
    assert.equal(
        (await app.inject({ method: 'POST', url: '/hooks/email', headers, payload })).statusCode,
        202,
    );
});
