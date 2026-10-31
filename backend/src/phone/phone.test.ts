import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../app.js';
import { MemoryIdentityRepository } from '../identity.js';
import { MemoryPhones } from './store.js';
import { TelnyxProvider } from './telnyx.js';
import type { PhoneProvider, PhoneOrder } from './provider.js';
import { PhonePurchaseRejected } from './provider.js';
import { newPhone } from './store.js';

test('Telnyx verifies raw Ed25519 webhooks, rejects stale/forged events and uses bounded provider requests', async () => {
    const keys = generateKeyPairSync('ed25519'),
        publicKey = keys.publicKey
            .export({ type: 'spki', format: 'der' })
            .subarray(-32)
            .toString('base64');
    const calls: { url: string; init?: RequestInit }[] = [];
    const provider = new TelnyxProvider(
        { apiKey: 'test', publicKey, messagingProfileId: 'profile' },
        async (url, init) => {
            calls.push({ url: String(url), ...(init ? { init } : {}) });
            return Response.json({ data: [] });
        },
    );
    const raw = Buffer.from(
        JSON.stringify({
            data: {
                id: randomUUID(),
                event_type: 'message.received',
                occurred_at: new Date().toISOString(),
                payload: {
                    type: 'SMS',
                    text: 'Verification code: 123456',
                    from: { phone_number: '+12125550111' },
                    to: [{ phone_number: '+12125550123' }],
                },
            },
        }),
    );
    const time = String(Math.floor(Date.now() / 1000)),
        signature = sign(
            null,
            Buffer.concat([Buffer.from(`${time}|`), raw]),
            keys.privateKey,
        ).toString('base64');
    assert.equal(
        provider.verify({ 'telnyx-timestamp': time, 'telnyx-signature-ed25519': signature }, raw),
        true,
    );
    assert.equal(
        provider.verify(
            { 'telnyx-timestamp': time, 'telnyx-signature-ed25519': signature },
            Buffer.from('{}'),
        ),
        false,
    );
    assert.equal(
        provider.verify({ 'telnyx-timestamp': '1', 'telnyx-signature-ed25519': signature }, raw),
        false,
    );
    assert.equal(provider.inbound(raw)?.text, 'Verification code: 123456');
    await provider.available('212');
    assert.match(calls[0]!.url, /api.telnyx.com/);
    assert.equal(calls[0]!.init?.redirect, 'error');
    await assert.rejects(() => provider.available('x'));
});

async function phoneFixture(
    t: { after: (work: () => Promise<unknown>) => void },
    changes: Partial<PhoneProvider> = {},
) {
    const identities = new MemoryIdentityRepository(),
        user = identities.register('phone-fixes', 'test')!;
    const token = randomBytes(32).toString('base64url');
    identities.createSession(user.id, user.personalAccountId, token);
    const identity = identities.authenticateSession(token)!;
    let count = 2,
        validUntil = new Date(Date.now() + 86400000).toISOString();
    identities.setEntitlement(identity.account.id, 'pro', validUntil);
    const key = identities.createKey(
        identity,
        'Phone fixes',
        ['resources:read', 'resources:write'],
        validUntil,
    );
    const store = new MemoryPhones();
    const provider: PhoneProvider = {
        available: async () =>
            ['+12125550123', '+12125550124'].map((number) => ({
                number,
                monthlyCost: '1',
                upfrontCost: '1',
                currency: 'USD',
            })),
        purchase: async (number) => ({ id: 'order', number, status: 'pending' }),
        order: async () => {
            throw Error('Provider unavailable');
        },
        findOrder: async () => undefined,
        numberId: async () => undefined,
        release: async () => {},
        verify: () => true,
        inbound: (raw) => JSON.parse(raw.toString()),
        ...changes,
    };
    const app = buildApp({
        identityStore: identities,
        phoneStore: store,
        phoneProvider: provider,
        phoneEntitlements: async () => ({ count, validUntil }),
    });
    t.after(() => app.close());
    return {
        app,
        store,
        identity,
        headers: { authorization: `Bearer ${key.key}` },
        limit: (value: number) => {
            count = value;
        },
        lapse: () => {
            count = 0;
            validUntil = new Date(Date.now() - 8 * 86400000).toISOString();
        },
    };
}

test('Telnyx definite 4xx purchase rejections are distinguishable from uncertain failures', async () => {
    const publicKey = generateKeyPairSync('ed25519')
        .publicKey.export({ type: 'spki', format: 'der' })
        .subarray(-32)
        .toString('base64');
    for (const status of [422, 429, 408, 503]) {
        const provider = new TelnyxProvider(
            { apiKey: 'test', publicKey, messagingProfileId: 'profile' },
            async () => new Response('{}', { status }),
        );
        await assert.rejects(
            provider.purchase('+12125550123', randomUUID()),
            (error) =>
                error instanceof PhonePurchaseRejected === (status === 422 || status === 429),
        );
    }
});

test('a definitely rejected phone purchase frees its slot and is never resubmitted with the same key', async (t) => {
    let purchases = 0;
    const f = await phoneFixture(t, {
        purchase: async (number) => {
            purchases++;
            if (purchases === 1) throw new PhonePurchaseRejected(422);
            return { id: 'accepted', number, status: 'pending' };
        },
    });
    f.limit(1);
    const request = {
        method: 'POST' as const,
        url: '/api/phone-numbers',
        headers: { ...f.headers, 'idempotency-key': 'rejected-purchase-key' },
        payload: { number: '+12125550123' },
    };
    assert.equal((await f.app.inject(request)).statusCode, 502);
    assert.equal((await f.store.find(request.payload.number))?.state, 'failed');
    assert.equal((await f.app.inject(request)).json().number.state, 'failed');
    assert.equal(purchases, 1);
    const accepted = await f.app.inject({
        ...request,
        headers: { ...f.headers, 'idempotency-key': 'replacement-purchase-key' },
        payload: { number: '+12125550124' },
    });
    assert.equal(accepted.statusCode, 202, accepted.body);
    assert.equal(purchases, 2);
});

test('bad phone orders cannot block stale-order cleanup or release of lapsed numbers', async (t) => {
    const released: string[] = [];
    const f = await phoneFixture(t, {
        findOrder: async (id) => {
            if (id === bad.id) throw Error('Provider unavailable');
            return undefined;
        },
        release: async (id) => {
            released.push(id);
        },
    });
    const bad = newPhone(f.identity.account.id, '+12125550123', 'bad-order'),
        stale = newPhone(f.identity.account.id, '+12125550124', 'stale-order'),
        lapsed = newPhone(f.identity.account.id, '+12125550125', 'lapsed');
    stale.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
    lapsed.createdAt = new Date(Date.now() - 86400000).toISOString();
    lapsed.state = 'active';
    lapsed.providerId = 'release-me';
    await f.store.withOwner(f.identity.account.id, async (session) => {
        for (const phone of [bad, stale, lapsed]) await session.save(phone);
    });
    f.lapse();
    await f.app.runPhoneLifecycle();
    assert.equal((await f.store.find(bad.number))?.state, 'ordering');
    assert.equal((await f.store.find(stale.number))?.state, 'failed');
    assert.equal((await f.store.find(lapsed.number))?.state, 'released');
    assert.deepEqual(released, ['release-me']);
});

test('provider outages do not prevent local SMS ingestion, listing or waits', async (t) => {
    let calls = 0;
    const f = await phoneFixture(t, {
        order: async () => {
            calls++;
            throw Error('Provider unavailable');
        },
    });
    const pending = newPhone(f.identity.account.id, '+12125550123', 'pending'),
        active = newPhone(f.identity.account.id, '+12125550124', 'active');
    pending.state = 'pending';
    pending.orderId = 'unknown';
    active.state = 'active';
    active.providerId = 'active-provider';
    await f.store.withOwner(f.identity.account.id, async (session) => {
        await session.save(pending);
        await session.save(active);
    });
    await f.app.runPhoneLifecycle();
    assert.equal(calls, 1);
    const received = await f.app.inject({
        method: 'POST',
        url: '/hooks/telnyx',
        payload: {
            id: randomUUID(),
            at: new Date().toISOString(),
            from: '+12125550999',
            to: active.number,
            text: 'Your code is 123456',
        },
    });
    assert.equal(received.statusCode, 202, received.body);
    for (const path of ['sms', 'wait?timeoutSeconds=1']) {
        const response = await f.app.inject({
            url: `/api/phone-numbers/${active.id}/${path}`,
            headers: f.headers,
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.deepEqual(response.json().messages[0].codes, ['123456']);
    }
    assert.equal(calls, 1);
});

test('phone purchases require paid add-on slots, are idempotent, isolate SMS, pause on lapse and release at provider after grace', async (t) => {
    const identities = new MemoryIdentityRepository(),
        user = identities.register('phone-owner', 'test')!,
        session = randomBytes(32).toString('base64url');
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    identities.setEntitlement(
        identity.account.id,
        'pro',
        new Date(Date.now() + 86400000).toISOString(),
    );
    const key = identities.createKey(
        identity,
        'phone',
        ['resources:read', 'resources:write'],
        new Date(Date.now() + 86400000).toISOString(),
    );
    const headers = { authorization: `Bearer ${key.key}` };
    const store = new MemoryPhones();
    let count = 1,
        validUntil = new Date(Date.now() + 86400000).toISOString(),
        purchases = 0,
        releases = 0;
    const provider: PhoneProvider = {
        available: async () => [
            { number: '+12125550123', monthlyCost: '1', upfrontCost: '1', currency: 'USD' },
        ],
        purchase: async (number) => {
            purchases++;
            return { id: 'order', number, status: 'success' };
        },
        order: async () => ({ id: 'order', number: '+12125550123', status: 'success' }),
        findOrder: async () => undefined,
        numberId: async () => 'provider-id',
        release: async () => {
            releases++;
        },
        verify: (headers) => headers['test-signature'] === 'valid',
        inbound: (raw) => JSON.parse(raw.toString()),
    };
    const app = buildApp({
        identityStore: identities,
        phoneStore: store,
        phoneProvider: provider,
        phoneEntitlements: async () => ({ count, validUntil }),
    });
    t.after(() => app.close());
    const purchaseKey = randomUUID(),
        payload = { number: '+12125550123' };
    const create = () =>
        app.inject({
            method: 'POST',
            url: '/api/phone-numbers',
            headers: { ...headers, 'idempotency-key': purchaseKey },
            payload,
        });
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/phone-numbers', payload })).statusCode,
        401,
    );
    count = 0;
    assert.equal((await create()).statusCode, 402);
    assert.equal(purchases, 0);
    count = 1;
    const response = await create();
    assert.equal(response.statusCode, 202, response.body);
    const phone = response.json().number;
    assert.equal((await create()).statusCode, 200);
    assert.equal(purchases, 1);
    const sms = {
        id: randomUUID(),
        at: new Date().toISOString(),
        from: '+12125550111',
        to: phone.number,
        text: 'Your verification code is 123456',
    };
    const ingest = () =>
        app.inject({
            method: 'POST',
            url: '/hooks/telnyx',
            headers: { 'content-type': 'application/json', 'test-signature': 'valid' },
            payload: sms,
        });
    await ingest();
    await ingest();
    const messages = (
        await app.inject({ url: `/api/phone-numbers/${phone.id}/sms`, headers })
    ).json();
    assert.equal(messages.messages.length, 1);
    assert.deepEqual(messages.messages[0].codes, ['123456']);
    assert.equal((await app.inject({ url: `/api/phone-numbers/${phone.id}/sms` })).statusCode, 401);
    const combined = await app.inject({
        method: 'POST',
        url: '/api/events/wait',
        headers,
        payload: { sources: [{ kind: 'sms', id: phone.id }], timeoutSeconds: 1 },
    });
    assert.equal(combined.statusCode, 200, combined.body);
    assert.equal(combined.json().events[0].messages.length, 1);
    count = 0;
    validUntil = new Date(Date.now() - 1000).toISOString();
    await app.runPhoneLifecycle();
    assert.equal((await store.find(phone.number))?.state, 'paused');
    assert.equal(
        (await app.inject({ url: `/api/phone-numbers/${phone.id}/wait?timeoutSeconds=1`, headers }))
            .statusCode,
        409,
    );
    await store.withOwner(identity.account.id, async (session) => {
        const number = (await session.list())[0]!;
        number.pausedAt = new Date(Date.now() - 8 * 86400000).toISOString();
        await session.save(number);
    });
    await app.runPhoneLifecycle();
    assert.equal(releases, 1);
    assert.equal((await store.find(phone.number))?.state, 'released');
});

test('uncertain phone purchases never activate failed or mismatched provider orders', async (t) => {
    const identities = new MemoryIdentityRepository(),
        user = identities.register('phone-reconcile', 'test')!,
        session = randomBytes(32).toString('base64url');
    identities.createSession(user.id, user.personalAccountId, session);
    const identity = identities.authenticateSession(session)!;
    const validUntil = new Date(Date.now() + 86400000).toISOString();
    identities.setEntitlement(identity.account.id, 'pro', validUntil);
    const key = identities.createKey(
        identity,
        'phone',
        ['resources:read', 'resources:write'],
        validUntil,
    );
    const headers = { authorization: `Bearer ${key.key}` },
        number = '+12125550123',
        store = new MemoryPhones();
    let purchases = 0;
    let order: PhoneOrder = { id: 'order', number: '+12125550124', status: 'success' };
    const provider: PhoneProvider = {
        available: async () => [{ number, monthlyCost: '1', upfrontCost: '1', currency: 'USD' }],
        purchase: async () => {
            purchases++;
            throw new Error('Connection lost after submission');
        },
        findOrder: async () => order,
        order: async () => order,
        numberId: async () => 'provider-id',
        release: async () => {
            throw new Error('No number should be released');
        },
        verify: () => false,
        inbound: () => undefined,
    };
    const app = buildApp({
        identityStore: identities,
        phoneStore: store,
        phoneProvider: provider,
        phoneEntitlements: async () => ({ count: 1, validUntil }),
    });
    t.after(() => app.close());
    const create = () =>
        app.inject({
            method: 'POST',
            url: '/api/phone-numbers',
            headers: { ...headers, 'idempotency-key': 'uncertain-purchase-key' },
            payload: { number },
        });
    assert.equal((await create()).statusCode, 502);
    await app.runPhoneLifecycle();
    assert.equal((await store.find(number))?.state, 'ordering');
    order = { id: 'order', number, status: 'failure' };
    await app.runPhoneLifecycle();
    assert.equal((await store.find(number))?.state, 'failed');
    assert.equal((await create()).json().number.state, 'failed');
    assert.equal(purchases, 1);
    assert.deepEqual((await app.inject({ url: '/api/phone-numbers', headers })).json().numbers, []);

    await store.withOwner(identity.account.id, async (session) => {
        const phone = (await session.list())[0]!;
        await session.save({ ...phone, state: 'pending', orderId: 'order' });
    });
    order = { id: 'order', number: '+12125550124', status: 'success' };
    await app.runPhoneLifecycle();
    assert.equal((await store.find(number))?.state, 'pending');
    order = { id: 'order', number, status: 'success' };
    await app.runPhoneLifecycle();
    assert.equal((await store.find(number))?.state, 'active');
    assert.equal(purchases, 1);
});
