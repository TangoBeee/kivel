import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import DodoPayments from 'dodopayments';
import type { Subscription } from 'dodopayments/resources/subscriptions';
import { buildApp } from './app.js';
import { subscriptionState } from './billing.js';
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
        { product_id: 'pdt_other' },
        { quantity: 2 },
        { trial_period_days: 7 },
        { on_demand: true },
        { recurring_pre_tax_amount: 0 },
        { next_billing_date: new Date(0).toISOString() },
        { next_billing_date: 'invalid' },
        { addons: [{}] },
        { meters: [{}] },
    ])
        assert.equal(
            subscriptionState(subscription(override), products).plan,
            'free',
            JSON.stringify(override),
        );
});
test('Dodo verifies webhook body, timestamp and signature and retrieves current subscription state', async (t) => {
    let applied = 0,
        retrieved = 0;
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        environment: 'test_mode',
        maxRetries: 0,
        fetch: async () => {
            retrieved++;
            return Response.json(subscription());
        },
    });
    const repository = {
        process: async (
            _id: string,
            _created: number,
            _customer: string,
            load: () => Promise<unknown>,
        ) => {
            await load();
            applied++;
            return true;
        },
    };
    const app = buildApp({
        billingRepository: repository as never,
        dodoClient: dodo,
        billingConfig: config,
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
    assert.equal((await send(payload, signature(payload))).statusCode, 200);
    assert.equal(applied, 1);
    assert.equal(retrieved, 1);
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
    let trial = 0;
    const dodo = new DodoPayments({
        bearerToken: config.apiKey,
        maxRetries: 0,
        fetch: async (url) =>
            Response.json({
                product_id: String(url).split('/').pop(),
                is_recurring: true,
                price: {
                    type: 'recurring_price',
                    price: String(url).includes('pdt_team') ? 2400 : 600,
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
    assert.equal(response.json().prices[0].amount, 600);
    trial = 7;
    const bad = buildApp({
        dodoClient: dodo,
        billingRepository: {} as never,
        billingConfig: config,
    });
    t.after(() => bad.close());
    assert.equal((await bad.inject('/api/billing')).statusCode, 503);
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
