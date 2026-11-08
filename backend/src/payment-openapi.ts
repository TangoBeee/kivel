const security = [{ accountKey: [] }, { sessionCookie: [] }];
const amount = { type: 'number', minimum: 0.01, maximum: 1000000, multipleOf: 0.01 };
const text = { type: 'string', maxLength: 80 };
const requestBody = (properties: object, required: string[] = []) => ({
    required: true,
    content: {
        'application/json': {
            schema: { type: 'object', additionalProperties: false, properties, required },
        },
    },
});
const responses = {
    '200': { description: 'Test mode result' },
    '202': {
        description:
            'Awaiting owner or admin approval. Resume the same payment with its idempotency key after approval.',
    },
    '400': { description: 'Invalid test input' },
    '403': { description: 'Permission, test balance or wallet limit refused' },
    '404': { description: 'Resource unavailable or outside this workspace' },
    '409': { description: 'Idempotency conflict or payment token replay' },
    '429': { description: 'Plan or rate limit reached' },
};
const id = [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }];
const wallet = {
    name: text,
    balance: { ...amount, minimum: 0, default: 100 },
    perPaymentLimit: {
        ...amount,
        minimum: 0,
        description:
            'Owner/admin browser session only, including on creation. API keys omit this field and receive plan defaults.',
    },
    dailyLimit: {
        ...amount,
        minimum: 0,
        description: 'Owner/admin browser session only. UTC calendar day.',
    },
    approvalThreshold: {
        ...amount,
        minimum: 0,
        description:
            'Owner/admin browser session only. Payments strictly above this value require approval.',
    },
};
const paywall = {
    name: text,
    amount,
    description: text,
    modes: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        items: { type: 'string', enum: ['wallet', 'permissive'] },
    },
    response: {
        type: 'object',
        properties: {
            status: { type: 'integer', minimum: 200, maximum: 299 },
            body: { description: 'JSON value up to 16 KiB' },
        },
    },
};
const checkout = {
    name: text,
    amount,
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], default: 'USD' },
    item: text,
    description: text,
    successUrl: { type: 'string', format: 'uri' },
    cancelUrl: { type: 'string', format: 'uri' },
    webhookUrl: {
        type: 'string',
        format: 'uri',
        description:
            'Public HTTP(S) URL. The creation response includes webhookSecret once. X-Kivel-Signature is t=<Unix seconds>,v1=<HMAC-SHA256 hex of timestamp + dot + raw JSON>. Delivery retries server errors and 429 up to three attempts.',
    },
};
const retention = {
    ttlSeconds: {
        type: 'integer',
        minimum: 60,
        description: 'Within the current plan retention limit. Defaults to one hour.',
    },
    persistent: { type: 'boolean', default: false },
};
export function paymentOpenApi(): Record<string, object> {
    const paths: Record<string, object> = {};
    for (const [kind, fields, required] of [
        ['wallets', wallet, ['name']],
        ['paywalls', paywall, ['name', 'amount']],
        ['checkouts', checkout, ['name', 'amount', 'item']],
    ] as const) {
        paths[`/api/test-${kind}`] = {
            get: {
                operationId: `listTest${kind}`,
                tags: ['Test payments'],
                security,
                summary: `List test ${kind}`,
                responses,
            },
            post: {
                operationId: `createTest${kind}`,
                tags: ['Test payments'],
                security,
                summary: `Create a test ${kind.slice(0, -1)}`,
                description:
                    'Test mode only. No real money, settlement, blockchain transactions or private keys. Counts toward existing resource and storage limits. Wallets are workspace-only. Paywalls and hosted checkouts are public; management is workspace-only. Checkout webhookSecret is returned once.',
                requestBody: requestBody({ ...fields, ...retention }, [...required]),
                responses: {
                    ...responses,
                    '201': {
                        description:
                            'Test resource created; webhookSecret returned once for checkouts',
                    },
                },
            },
        };
        paths[`/api/test-${kind}/{id}`] = {
            parameters: id,
            get: {
                operationId: `getTest${kind}`,
                tags: ['Test payments'],
                security,
                summary: 'Inspect test configuration and results',
                responses,
            },
            patch: {
                operationId: `updateTest${kind}`,
                tags: ['Test payments'],
                security,
                summary: 'Update test configuration',
                description:
                    'Wallet limits and approval thresholds require an owner/admin browser session. Changing wallet settings invalidates pending authorizations. Use top-up to change balance.',
                requestBody: requestBody(fields),
                responses,
            },
            delete: {
                operationId: `deleteTest${kind}`,
                tags: ['Test payments'],
                security,
                summary: 'Delete the test resource and its ledger or attempts',
                responses: { ...responses, '204': { description: 'Deleted' } },
            },
        };
    }
    paths['/api/test-wallets/{id}/pay'] = {
        parameters: id,
        post: {
            operationId: 'payFromTestWallet',
            tags: ['Test payments'],
            security,
            summary: 'Pay a test paywall or checkout, or record a payment',
            description:
                'Test mode. payee may be a Kivel /pay or /checkout URL or any payee string. Own target price is used when amount is omitted. Wallets support USD only. Reuse the same idempotencyKey to resume approval or retry safely; a different body or caller with that key gets 409. Above the threshold only an owner/admin can approve in the browser. authorizeOnly reserves test balance and returns paymentHeader for X-PAYMENT, valid up to five minutes. Default mode retries the paywall and returns its content.',
            requestBody: requestBody(
                {
                    payee: { type: 'string', maxLength: 2048 },
                    amount,
                    memo: { type: 'string', maxLength: 200 },
                    idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
                    authorizeOnly: { type: 'boolean', default: false },
                },
                ['payee', 'idempotencyKey'],
            ),
            responses,
        },
    };
    paths['/api/test-wallets/{id}/top-up'] = {
        parameters: id,
        post: {
            operationId: 'topUpTestWallet',
            tags: ['Test payments'],
            security,
            summary: 'Add free test balance',
            description:
                'Unlimited top-ups, rate-limited by plan. Maximum balance 1,000,000 test units.',
            requestBody: requestBody({ amount }, ['amount']),
            responses,
        },
    };
    paths['/api/test-wallets/{id}/transactions'] = {
        parameters: [
            ...id,
            { in: 'query', name: 'cursor', schema: { type: 'string' } },
            {
                in: 'query',
                name: 'limit',
                schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
        ],
        get: {
            operationId: 'listWalletTransactions',
            tags: ['Test payments'],
            security,
            summary: 'Read the test ledger, newest first',
            responses,
        },
    };
    paths['/api/test-checkouts/{id}/complete'] = {
        parameters: id,
        post: {
            operationId: 'completeTestCheckout',
            tags: ['Test payments'],
            security,
            summary: 'Complete checkout with a fake card fixture',
            description:
                'Never send real cards. Only outcome and last4 are retained. Luhn-valid generated cards succeed by default. 4000000000000002 declines, 4000000000009995 has insufficient funds, 4000002500003155 requires verification, 4000000000000069 is expired. Resume verification with the returned confirmationToken. Test wallets use wallet_pay instead.',
            requestBody: requestBody(
                {
                    idempotencyKey: { type: 'string', maxLength: 100 },
                    card: {
                        type: 'object',
                        required: ['number'],
                        properties: {
                            number: { type: 'string', maxLength: 30, writeOnly: true },
                            expiry: { type: 'string', description: 'Optional MM/YY or MM/YYYY' },
                            cvc: { type: 'string', pattern: '^\\d{3,4}$', writeOnly: true },
                        },
                    },
                },
                ['idempotencyKey', 'card'],
            ),
            responses,
        },
    };
    paths['/api/test-checkouts/{id}/confirm'] = {
        parameters: id,
        post: {
            operationId: 'confirmTestCheckout',
            tags: ['Test payments'],
            security,
            summary: 'Confirm the extra test verification step',
            requestBody: requestBody({ confirmationToken: { type: 'string', maxLength: 4096 } }, [
                'confirmationToken',
            ]),
            responses,
        },
    };
    paths['/pay/{id}/{path}'] = {
        get: {
            operationId: 'requestTestPaywall',
            tags: ['Test payments'],
            summary: 'Public x402 v1 test paywall',
            description:
                'Accepts any HTTP method and sub-path. X-PAYMENT is base64 JSON. Wallet mode verifies an opaque HMAC-protected token, debits once and rejects replay. Permissive mode only validates x402 v1 exact/base-sepolia payload structure. No signature verification, settlement or funds exist in permissive mode. Success includes base64 JSON X-PAYMENT-RESPONSE with testMode true.',
            parameters: [
                ...id,
                { in: 'path', name: 'path', required: true, schema: { type: 'string' } },
                { in: 'header', name: 'X-PAYMENT', schema: { type: 'string', maxLength: 8192 } },
            ],
            responses: {
                ...responses,
                '402': {
                    description:
                        'x402Version 1 and accepts: scheme, network, asset, amount/maxAmountRequired, payTo, resource, description and maxTimeoutSeconds',
                },
            },
        },
    };
    paths['/checkout/{id}'] = {
        get: {
            operationId: 'hostedTestCheckout',
            tags: ['Test payments'],
            summary: 'Public test outcome picker; no card fields',
            parameters: id,
            responses: {
                '200': {
                    description:
                        'Noindex hosted test page with explicit success/cancel links, never an automatic external redirect',
                },
                '404': responses['404'],
            },
        },
    };
    return paths;
}
