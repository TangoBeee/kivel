import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import DodoPayments from 'dodopayments';
import type { Subscription } from 'dodopayments/resources/subscriptions';
import { buildApp } from './app.js';
import { subscriptionState } from './billing.js';
import { MemoryIdentityRepository } from './identity.js';
import { MemoryRecoveryRepository } from './recovery-store.js';
const products = { proProduct: 'pdt_pro', teamProduct: 'pdt_team' };
const config = {
    apiKey: 'dodo_test_example',
    webhookSecret: 'whsec_' + Buffer.from('test-webhook-signing-secret-32bytes').toString('base64'),
    environment: 'test_mode' as const,
    ...products,
};
function subscription(overrides: object = {}): Subscription {
    return {
        subscription_id: 'sub_test',
        customer: { customer_id: 'cus_test' },
        product_id: 'pdt_pro',
        metadata: { accountId: 'test' },
        status: 'active',
        quantity: 1,
        on_demand: false,
        addons: [],
        meters: [],
        trial_period_days: 0,
        recurring_pre_tax_amount: 1200,
        next_billing_date: new Date(Date.now() + 86400000).toISOString(),
        ...overrides,
    } as unknown as Subscription;
}
function signature(payload: string, id = 'evt_test', timestamp = Math.floor(Date.now() / 1000)) {
    return {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature':
            'v1,' +
            createHmac('sha256', Buffer.from(config.webhookSecret.slice(6), 'base64'))
                .update(`${id}.${timestamp}.${payload}`)
                .digest('base64'),
    };
}
test('Dodo entitlements require a configured, active, paid fixed subscription', () => {
    assert.equal(subscriptionState(subscription(), products).plan, 'pro');
    assert.equal(
        subscriptionState(subscription({ product_id: 'pdt_team' }), products).plan,
        'team',
    );
    assert.equal(
        subscriptionState(subscription({ cancel_at_next_billing_date: true }), products).plan,
        'pro',
    );
    for (const override of [
        { status: 'on_hold' },
        { status: 'cancelled' },
        { status: 'failed' },
        { status: 'expired' },
        { status: 'paused' },
        { product_id: 'pdt_other', status: 'expired' },
        { quantity: 2 },
        { trial_period_days: 7 },
        { on_demand: true },
        { recurring_pre_tax_amount: -1 },
        { next_billing_date: new Date(0).toISOString() },
        { next_billing_date: 'invalid' },
    ])
        assert.equal(
            subscriptionState(subscription(override), products).plan,
            'free',
            JSON.stringify(override),
        );
});
test('a fully discounted active subscription still grants its plan', () => {
    const state = subscriptionState(subscription({ recurring_pre_tax_amount: 0 }), products);
    assert.equal(state.plan, 'pro');
    assert.ok(state.validUntil);
});
test('an unmapped paid product cannot revoke access even with a nonstandard quantity', () => {
    assert.throws(
        () =>
            subscriptionState(
                subscription({ product_id: 'pdt_unknown', quantity: 2 }),
                products,
                undefined,
                () => {},
            ),
        { statusCode: 500 },
    );
});
test('Dodo verifies webhook signatures and renews an active subscription on a retired product', async (t) => {
    let applied = 0,
        retrieved = 0,
        productId = 'pdt_unmapped';
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        environment: 'test_mode',
        maxRetries: 0,
        fetch: async () => {
            retrieved++;
            return Response.json(subscription({ product_id: productId }));
        },
    });
    const repository = {
        process: async (
            _id: string,
            _created: number,
            _customer: string,
            load: () => Promise<ReturnType<typeof subscriptionState>>,
        ) => {
            assert.equal((await load()).plan, 'pro');
            applied++;
            return true;
        },
    };
    const app = buildApp({
        billingRepository: repository as never,
        dodoClient: dodo,
        billingConfig: { ...config, legacyProducts: { pdt_oldpro: 'pro' } },
    });
    t.after(() => app.close());
    const payload = JSON.stringify({
        type: 'subscription.active',
        business_id: 'biz_test',
        timestamp: new Date().toISOString(),
        data: { ...subscription(), payload_type: 'Subscription' },
    });
    const send = (body: string, headers: Record<string, string>) =>
        app.inject({ method: 'POST', url: '/billing/webhook', payload: body, headers });
    assert.equal(
        (await send(payload, { ...signature(payload), 'webhook-signature': 'v1,forged' }))
            .statusCode,
        400,
    );
    assert.equal((await send(payload, signature(payload, 'evt_old', 1))).statusCode, 400);
    assert.equal((await send(payload + ' ', signature(payload))).statusCode, 400);
    assert.equal(applied, 0);
    assert.equal(retrieved, 0);
    const unmapped = await send(payload, signature(payload));
    assert.equal(unmapped.statusCode, 500, unmapped.body);
    assert.equal(applied, 0);
    assert.equal(retrieved, 1);
    productId = 'pdt_oldpro';
    assert.equal((await send(payload, signature(payload))).statusCode, 200);
    assert.equal(applied, 1);
    assert.equal(retrieved, 2);
    const harmless = JSON.stringify({
        type: 'payment.succeeded',
        data: { payload_type: 'Payment' },
    });
    assert.equal((await send(harmless, signature(harmless, 'evt_payment'))).statusCode, 200);
    assert.equal(applied, 1);
});
test('Dodo checkout requires a verified recovery email before contacting the provider', async (t) => {
    let calls = 0;
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        fetch: async () => {
            calls++;
            throw Error('Provider must not be called.');
        },
    });
    const app = buildApp({
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: config,
    });
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'billing-owner',
            email: 'billing@example.test',
            password: 'a-long-billing-test-password',
        },
    });
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    const response = await app.inject({
        method: 'POST',
        url: '/api/billing/checkout',
        headers: { origin, cookie },
        payload: { plan: 'pro' },
    });
    assert.equal(response.statusCode, 409);
    assert.match(response.body, /recovery email/);
    assert.equal(calls, 0);
});
test('Dodo prices use live product minor units and reject unsupported billing configurations', async (t) => {
    let trial = 0,
        pro = 200,
        team = 600;
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        maxRetries: 0,
        fetch: async (url) =>
            Response.json({
                product_id: String(url).split('/').pop(),
                is_recurring: true,
                price: {
                    type: 'recurring_price',
                    price: String(url).includes('pdt_team') ? team : pro,
                    currency: 'USD',
                    payment_frequency_count: 1,
                    payment_frequency_interval: 'Month',
                    subscription_period_count: 20,
                    subscription_period_interval: 'Year',
                    trial_period_days: trial,
                },
            }),
    });
    const app = buildApp({
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: config,
    });
    t.after(() => app.close());
    const response = await app.inject('/api/billing');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().provider, 'dodo');
    assert.equal(response.json().prices[0].amount, 200);
    trial = 7;
    const bad = buildApp({
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: config,
    });
    t.after(() => bad.close());
    assert.equal((await bad.inject('/api/billing')).statusCode, 503);

    trial = 0;
    const identities = new MemoryIdentityRepository();
    const recovery = Object.assign(new MemoryRecoveryRepository(identities), {
        async status() {
            return {
                email: 'plan@example.test',
                verifiedAt: new Date().toISOString(),
                pendingEmail: null,
            };
        },
    });
    const early = buildApp({
        identityStore: identities,
        recoveryStore: recovery,
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: { ...config, priceSchedule: 'early' },
    });
    t.after(() => early.close());
    assert.equal(
        (await early.inject('/api/billing')).statusCode,
        503,
        'Legacy products do not match early pricing',
    );
    pro = 500;
    team = 2900;
    const preview = await early.inject('/api/billing');
    assert.equal(preview.statusCode, 200, preview.body);
    assert.deepEqual(
        preview.json().prices.map((value: { amount: number }) => value.amount),
        [500, 2900],
    );

    const origin = 'http://localhost:3000';
    const registered = await early.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'price-check',
            password: 'test fixture password',
            email: 'plan@example.test',
        },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    pro = 900;
    assert.equal(
        (
            await early.inject({
                method: 'POST',
                url: '/api/billing/checkout',
                headers: { origin, cookie },
                payload: { plan: 'pro' },
            })
        ).statusCode,
        503,
        'Checkout validates the current provider price even when a quote is cached',
    );

    const standard = buildApp({
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: { ...config, priceSchedule: 'standard' },
    });
    t.after(() => standard.close());
    assert.equal((await standard.inject('/api/billing')).json().prices[0].amount, 900);
});

test('Dodo subscription ownership falls back to current customer metadata when checkout metadata is absent', async (t) => {
    let account = '';
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        maxRetries: 0,
        fetch: async (input) =>
            Response.json(
                new URL(String(input)).pathname.startsWith('/customers/')
                    ? { customer_id: 'cus_test', metadata: { accountId: 'workspace_current' } }
                    : subscription({ metadata: {} }),
            ),
    });
    const repository = {
        process: async (
            _id: string,
            _at: number,
            _customer: string,
            load: () => Promise<{ accountId: string }>,
        ) => {
            account = (await load()).accountId;
            return true;
        },
    };
    const app = buildApp({
        dodoClient: dodo,
        billingConfig: config,
        billingRepository: repository as never,
    });
    t.after(() => app.close());
    const payload = JSON.stringify({
        type: 'subscription.renewed',
        data: { ...subscription(), payload_type: 'Subscription' },
    });
    const response = await app.inject({
        method: 'POST',
        url: '/billing/webhook',
        headers: signature(payload),
        payload,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(account, 'workspace_current');
});

test('phone add-ons grant slots only for the configured product on an active paid subscription', () => {
    const products = {
        proProduct: 'pdt_pro',
        teamProduct: 'pdt_team',
        phoneAddonId: 'addon_phone',
    };
    const addon = subscription({ addons: [{ addon_id: 'addon_phone', quantity: 2 }] });
    assert.equal(subscriptionState(addon, products).plan, 'pro');
    assert.equal(subscriptionState(addon, products).phoneNumbers, 2);
    assert.equal(
        subscriptionState(addon, { proProduct: 'pdt_pro', teamProduct: 'pdt_team' }).plan,
        'pro',
    );
    assert.equal(
        subscriptionState(
            subscription({ addons: [{ addon_id: 'addon_phone', quantity: 11 }] }),
            products,
        ).plan,
        'pro',
    );
    assert.equal(
        subscriptionState(
            subscription({ addons: [{ addon_id: 'addon_phone', quantity: 1 }], status: 'on_hold' }),
            products,
        ).phoneNumbers,
        0,
    );
});

test('unexpected add-ons never revoke Pro or Team and phone allowance is counted separately', () => {
    for (const plan of ['pro', 'team']) {
        for (const [addons, phoneAddonId, allowance] of [
            [[{ addon_id: 'unknown', quantity: 1 }], 'addon_phone', 0],
            [[{ addon_id: 'addon_phone', quantity: 11 }], 'addon_phone', 10],
            [[{ addon_id: 'addon_phone', quantity: 2 }], undefined, 0],
        ] as const) {
            const warnings: string[] = [];
            const state = subscriptionState(
                subscription({ product_id: `pdt_${plan}`, addons }),
                { ...products, ...(phoneAddonId ? { phoneAddonId } : {}) },
                (message) => warnings.push(message),
            );
            assert.equal(state.plan, plan);
            assert.equal(state.phoneNumbers, allowance);
            assert.ok(warnings.length);
        }
    }
});

test('changing phone slots preserves unrelated paid add-ons', async (t) => {
    let accountId = '';
    const changes: { addons: { addon_id: string; quantity: number }[] }[] = [];
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        maxRetries: 0,
        fetch: async (_url, init) => {
            if (init?.method === 'POST') {
                changes.push(JSON.parse(String(init.body)));
                return Response.json({ payment_link: 'https://checkout.dodopayments.com/test' });
            }
            return Response.json(
                subscription({
                    metadata: { accountId },
                    addons: [
                        { addon_id: 'unrelated', quantity: 3 },
                        { addon_id: 'addon_phone', quantity: 1 },
                    ],
                }),
            );
        },
    });
    const app = buildApp({
        dodoClient: dodo,
        billingConfig: { ...config, phoneAddonId: 'addon_phone', phoneAddonEnabled: true },
        billingRepository: { subscription: async () => 'sub_test' } as never,
    });
    t.after(() => app.close());
    const origin = 'http://localhost:3000';
    const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { origin },
        payload: {
            username: 'addon-owner',
            email: 'addon@example.test',
            password: 'long-test-password',
        },
    });
    accountId = registered.json().account.id;
    const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
    for (const quantity of [0, 2]) {
        const response = await app.inject({
            method: 'POST',
            url: '/api/billing/phone-addon',
            headers: { origin, cookie, 'idempotency-key': `phone-change-key-${quantity}` },
            payload: { quantity, confirm: true },
        });
        assert.equal(response.statusCode, 200, response.body);
    }
    assert.deepEqual(changes[0]!.addons, [{ addon_id: 'unrelated', quantity: 3 }]);
    assert.deepEqual(changes[1]!.addons, [
        { addon_id: 'unrelated', quantity: 3 },
        { addon_id: 'addon_phone', quantity: 2 },
    ]);
});
