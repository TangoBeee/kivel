import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { readConfig } from './config.js';

const production = {
    SMTP_HOST: 'smtp.example.test',
    SMTP_FROM: 'support@kivel.io',
    NODE_ENV: 'production',
    AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    PUBLIC_BASE_URL: 'https://kivel.io',
    DATABASE_URL: 'postgres://socket:password@database/socket',
};

test('production requires persistent storage, a public origin, and HTTPS', () => {
    assert.throws(() => readConfig({ NODE_ENV: 'production' }), /PUBLIC_BASE_URL/);
    assert.throws(
        () => readConfig({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://kivel.io' }),
        /DATABASE_URL/,
    );
    assert.throws(() => readConfig({ ...production, PUBLIC_BASE_URL: 'http://kivel.io' }), /HTTPS/);
    assert.equal(readConfig(production).host, '0.0.0.0');
    assert.equal(readConfig({}).host, '127.0.0.1');
});

test('invalid ports, database URLs, log levels, and trust-all proxies fail startup', () => {
    for (const PORT of ['0', '65536', 'abc', '2.5'])
        assert.throws(() => readConfig({ PORT }), /PORT/);
    for (const DATABASE_URL of ['bad', 'https://example.com/db', 'postgres://localhost'])
        assert.throws(() => readConfig({ DATABASE_URL }), /DATABASE_URL/);
    for (const TRUSTED_PROXIES of [
        'true',
        '0.0.0.0/0',
        '::/0',
        '127.0.0.1/33',
        'unknown',
        '127.0.0.1/8/2',
    ]) {
        assert.throws(() => readConfig({ TRUSTED_PROXIES }), /TRUSTED_PROXIES/);
    }
    assert.throws(() => readConfig({ LOG_LEVEL: 'everything' }), /LOG_LEVEL/);
    assert.deepEqual(readConfig({ TRUSTED_PROXIES: '127.0.0.1,172.30.0.0/24' }).trustProxy, [
        '127.0.0.1',
        '172.30.0.0/24',
    ]);
});

test('billing stays disabled without complete configuration and production requires a stable auth secret', () => {
    assert.throws(() => readConfig({ ...production, AUTH_SECRET: undefined }), /AUTH_SECRET/);
    assert.equal(readConfig(production).billingConfig, undefined);
    assert.throws(
        () => readConfig({ ...production, DODO_PAYMENTS_API_KEY: 'dodo_test_example' }),
        /four Dodo/,
    );
    assert.throws(() => readConfig({ SSH_PORT: '3000' }), /SSH_PORT/);
});

test('SMTP is explicit, validates settings, and is required before enabling subscriptions', () => {
    const mail = {
        SMTP_HOST: 'smtp.example.test',
        SMTP_FROM: 'accounts@example.test',
        SMTP_USER: 'provider-user',
        SMTP_PASSWORD: 'provider-password',
    };
    const result = readConfig({ ...production, ...mail });
    assert.equal(result.mailConfig?.port, 587);
    assert.equal(result.mailConfig?.local, false);
    assert.throws(
        () => readConfig({ ...production, SMTP_HOST: 'smtp.example.test', SMTP_FROM: undefined }),
        /SMTP/,
    );
    assert.throws(() => readConfig({ ...production, ...mail, SMTP_PORT: 'invalid' }), /SMTP/);
    assert.throws(
        () => readConfig({ ...production, ...mail, SMTP_FROM: 'injected\r\naddress@example.test' }),
        /email/,
    );
    const billing = {
        BILLING_ENABLED: 'true',
        DODO_PAYMENTS_API_KEY: 'dodo_test_example',
        DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_ZXhhbXBsZQ==',
        DODO_PRO_PRODUCT_ID: 'pdt_pro',
        DODO_TEAM_PRODUCT_ID: 'pdt_team',
    };
    assert.throws(
        () => readConfig({ ...production, ...billing, SMTP_HOST: undefined, SMTP_FROM: undefined }),
        /recovery email/,
    );
    assert.ok(readConfig({ ...production, ...billing, ...mail }).billingConfig);
});

test('public production requires recovery delivery and beta billing is explicitly opt-in', () => {
    assert.throws(
        () => readConfig({ ...production, SMTP_HOST: undefined, SMTP_FROM: undefined }),
        /recovery email/,
    );
    const dodo = {
        DODO_PAYMENTS_API_KEY: 'test-provider-key',
        DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_dGVzdA==',
        DODO_PRO_PRODUCT_ID: 'pdt_pro',
        DODO_TEAM_PRODUCT_ID: 'pdt_team',
    };
    assert.equal(readConfig({ ...production, ...dodo }).billingConfig, undefined);
    assert.equal(
        readConfig({ ...production, ...dodo, BILLING_ENABLED: 'false' }).billingConfig,
        undefined,
    );
    assert.ok(readConfig({ ...production, ...dodo, BILLING_ENABLED: 'true' }).billingConfig);
    const paid = { ...production, ...dodo, BILLING_ENABLED: 'true' };
    assert.equal(readConfig(paid).billingConfig?.priceSchedule, 'legacy');
    for (const schedule of ['early', 'standard']) {
        for (const legacy of [undefined, '{}'])
            assert.throws(
                () =>
                    readConfig({
                        ...paid,
                        BILLING_PRICE_SCHEDULE: schedule,
                        DODO_LEGACY_PRODUCT_IDS: legacy,
                    }),
                /DODO_LEGACY_PRODUCT_IDS is required/,
            );
        assert.equal(
            readConfig({
                ...paid,
                BILLING_PRICE_SCHEDULE: schedule,
                DODO_LEGACY_PRODUCT_IDS: '{"pdt_oldpro":"pro","pdt_oldteam":"team"}',
            }).billingConfig?.priceSchedule,
            schedule,
        );
    }
    assert.throws(
        () => readConfig({ ...paid, BILLING_PRICE_SCHEDULE: 'invalid' }),
        /BILLING_PRICE_SCHEDULE/,
    );
    assert.deepEqual(
        readConfig({
            ...paid,
            DODO_LEGACY_PRODUCT_IDS: '{"pdt_oldpro":"pro","pdt_oldteam":"team"}',
        }).billingConfig?.legacyProducts,
        { pdt_oldpro: 'pro', pdt_oldteam: 'team' },
    );
    for (const raw of [
        'bad JSON',
        '[]',
        '{"pdt_pro":"team"}',
        '{"pdt_old":"free"}',
        '{"bad":"pro"}',
    ])
        assert.throws(
            () => readConfig({ ...paid, DODO_LEGACY_PRODUCT_IDS: raw }),
            /DODO_LEGACY_PRODUCT_IDS/,
        );
    assert.throws(() => readConfig({ ...production, BILLING_ENABLED: 'true' }), /all four/);
    assert.throws(() => readConfig({ ...production, BILLING_ENABLED: 'yes' }), /true or false/);
});

test('agent relay, public SMTP capture and phone activation fail closed until separately configured', () => {
    assert.throws(() => readConfig({ EMAIL_SENDING_ENABLED: 'true' }), /private SMTP relay/);
    assert.throws(() => readConfig({ AGENT_SMTP_HOST: 'smtp.remote.com' }), /AGENT_SMTP/);
    assert.equal(readConfig({ AGENT_SMTP_HOST: 'mail' }).agentEmailConfig?.enabled, false);
    assert.throws(() => readConfig({ SMTP_CAPTURE_PORT: '2465' }), /TLS certificate/);
    assert.equal(readConfig({}).smtpCaptureConfig, undefined);
    assert.throws(() => readConfig({ PHONE_ENABLED: 'true' }), /Phone activation/);
    assert.throws(() => readConfig({ TELNYX_API_KEY: 'test' }), /all three/);
    assert.equal(readConfig({}).phoneEnabled, false);
});

test('backend routes use shared plan definitions for numeric allowances', () => {
    const source = new URL('./', import.meta.url);
    for (const file of readdirSync(source, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
        assert.doesNotMatch(
            readFileSync(new URL(file, source), 'utf8'),
            /\b(?:free|pro|team)\s*:\s*(?:\d|\{\s*\w+\s*:\s*\d)/,
            `${file} must read plan allowances from @kivel.io/tools/plans`,
        );
    }
});
