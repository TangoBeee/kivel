import { testPaymentLimits } from '@kivel.io/tools/billing-plans';
import type { DocPage } from './docs';
import type { ToolDetail } from './tool-details';
export const paymentTestingDoc: DocPage = {
    slug: 'test-an-agent-that-pays',
    title: 'Test an agent that pays',
    navTitle: 'Test payments',
    group: 'Resources',
    updatedAt: '2026-11-08',
    description:
        'Test agent spending with fake wallets, human approval, HTTP 402 paywalls and checkout events. No real funds, blockchain transactions or card collection.',
    sections: [
        {
            id: 'test-mode',
            title: 'Use fake money from start to finish',
            paragraphs: [
                'Test wallets, paywalls and checkouts are temporary workspace resources. They use the same resource, storage and retention allowances as mocks. Everything is test mode. There are no real funds, blockchain transactions, payment accounts or private keys. A successful test receipt proves only that this simulated flow completed.',
            ],
            note: 'Never send real card details. The hosted checkout has outcome buttons and no card input fields.',
        },
        {
            id: 'create',
            title: 'Give the agent a test wallet and paywall',
            paragraphs: [
                'Create a wallet with a name and starting USD test balance. The example uses a six-unit paywall, above the default Free approval threshold and within its per-payment limit. Owners on other plans can choose a price or threshold that exercises approval. Create the paywall with its price and response. An ordinary request to its URL returns HTTP 402 with x402 v1 payment instructions. Any HTTP method and sub-path work.',
            ],
            code: {
                title: 'MCP calls',
                value: 'create_test_wallet({"name":"Research agent","balance":100})\ncreate_test_paywall({"name":"Article","amount":6,"response":{"status":200,"body":{"article":"Test content"}}})\n\nGET https://kivel.io/pay/<paywall-id>/article\n→ 402 {"x402Version":1,"testMode":true,"accepts":[...]}',
            },
        },
        {
            id: 'approval',
            title: 'Pay, approve and get the content',
            paragraphs: [
                'Call wallet_pay with the returned paywall URL and a unique idempotencyKey. The configured price is used when amount is omitted. Payments above the wallet threshold return an approval link. An owner or admin opens it in the browser and approves or rejects. Agent keys cannot answer, even their own requests. MCP waits briefly; repeat the identical payment with the same idempotency key after the human answers.',
                'By default wallet_pay authorizes the test amount, retries the paywall and returns its content. To exercise a client retry yourself, set authorizeOnly to true, then send the returned paymentHeader as X-PAYMENT to that exact URL within five minutes. An unused authorization reserves balance. Redemption debits once; replay is rejected. Wallet setting changes invalidate pending payments.',
            ],
            code: {
                title: 'Pay through HTTP',
                value: 'POST /api/test-wallets/<wallet-id>/pay\n{"payee":"https://kivel.io/pay/<paywall-id>/article","memo":"Read the test article","idempotencyKey":"article-attempt-1"}\n\n202 → share answerUrl → human approves → repeat the same request\n200 → {"testMode":true,"status":"succeeded","content":{"article":"Test content"}}',
            },
        },
        {
            id: 'controls',
            title: 'Keep human controls separate from agent actions',
            paragraphs: [
                'Only a signed-in owner or admin can change per-payment limits, daily limits and approval thresholds. API keys must omit these controls, including during wallet creation. They can read the settings, spend within them and add free test balance. Daily spending resets at midnight UTC. A wallet cannot pay more than its available balance or limits, even after approval.',
            ],
            table: {
                caption: 'Default test wallet controls, in fake USD units',
                headers: [
                    'Plan',
                    'Per payment',
                    'Per UTC day',
                    'Approval above',
                    'Top-ups per minute',
                ],
                rows: (['free', 'pro', 'team'] as const).map((plan) => {
                    const value = testPaymentLimits[plan];
                    return [
                        plan[0]!.toUpperCase() + plan.slice(1),
                        String(value.perPayment),
                        String(value.daily),
                        String(value.approval),
                        String(value.topupsPerMinute),
                    ];
                }),
            },
            note: 'Wallets, paywalls and checkouts each count as one resource. Top-ups have no charge or total count limit; the balance is capped at 1,000,000 test units. API payments are limited to 60 per workspace per minute.',
        },
        {
            id: 'x402',
            title: 'Test an x402 client without settlement',
            paragraphs: [
                'The paywall uses the x402 v1 HTTP transport: HTTP 402 with accepts, a base64 JSON X-PAYMENT request header and a base64 JSON X-PAYMENT-RESPONSE receipt. Requirements include scheme exact, network base-sepolia, a synthetic asset and recipient, amount and maxAmountRequired in six-decimal test units, resource URL and description.',
                'Wallet mode accepts only opaque, HMAC-protected Kivel test wallet tokens. Permissive mode validates the structure of a v1 authorization with signature, from, to, value, validAfter, validBefore and nonce. It does not verify signatures, check balances, reject repeated fixture payloads or settle funds. Use it for client serialization tests. This is not a blockchain facilitator or the v2 PAYMENT-SIGNATURE transport.',
            ],
            code: {
                title: 'Transport specification',
                value: 'https://github.com/x402-foundation/x402/blob/main/specs/transports-v1/http.md',
            },
        },
        {
            id: 'checkout',
            title: 'Exercise checkout outcomes and verification',
            paragraphs: [
                'Create a checkout with an item, amount, optional currency and webhook URL. Names and descriptions are plain text limited to 80 characters. Open its public hosted page and choose an outcome. The verification outcome opens a second confirm page. Success and cancel destinations are explicit links with an origin notice, never automatic external redirects.',
                'Agents use complete_test_checkout with a fake card fixture and idempotencyKey, or wallet_pay with the checkout URL. Test wallets support USD only. Generated Luhn-valid cards succeed by default. An expired supplied fixture date produces the expired outcome. Card numbers, expiry and CVC are never retained in checkout state or call logs; only outcome and last four digits remain.',
            ],
            table: {
                caption: 'Fake card fixtures accepted only through the API and MCP',
                headers: ['Number', 'Outcome'],
                rows: [
                    ['4242424242424242', 'Success'],
                    ['4000000000000002', 'Declined'],
                    ['4000000000009995', 'Insufficient funds'],
                    ['4000002500003155', 'Requires verification'],
                    ['4000000000000069', 'Expired'],
                ],
            },
            note: 'For requires_verification, call complete_test_checkout again with only id and the returned confirmationToken. HTTP clients use POST /api/test-checkouts/{id}/confirm.',
        },
        {
            id: 'webhooks',
            title: 'Verify the event and inspect what happened',
            paragraphs: [
                'Checkout creation returns webhookSecret once. Save it. Completion sends payment.succeeded or payment.failed, with testMode true, an event ID and generic payment data. The amount is integer minor units. Verify X-Kivel-Signature before trusting the event: parse t and v1, calculate HMAC-SHA256 over the exact string timestamp + "." + raw JSON body, then compare the hex signature in constant time. Reject stale timestamps and deduplicate event IDs.',
                'Delivery uses the existing public-network protections and forwarding retries: immediate, then after two and ten seconds for 429, server errors or connection failures. Other client errors are final. Delivery attempts are visible in the checkout detail and API. Delivery is best effort, like webhook forwarding; no durable queue runs after a process restart.',
                'The dashboard Payments (test) page has Wallets, Paywalls and Checkouts tabs. Wallet ledgers include payments, top-ups, refusals and approval events. Public endpoint calls are available through inspect_mock_api. Deleting or expiring a resource removes its state and history.',
            ],
            code: {
                title: 'SDK and CLI',
                value: 'const wallet = await client.createTestWallet({ name: "Research agent", balance: 100 });\nawait client.walletPay(wallet.id, { payee: paywall.endpointUrl, idempotencyKey: "article-1" });\nawait client.listWalletTransactions(wallet.id);\n\nkivel test-wallet create < wallet.json\nkivel test-wallet pay <wallet-id> < payment.json\nkivel test-wallet transactions <wallet-id>\nkivel test-checkout complete <checkout-id> < fake-card.json',
            },
        },
    ],
    related: [
        { title: 'API reference', href: '/docs/reference/' },
        { title: 'Test wallet', href: '/tools/test-wallet/' },
        { title: 'Test x402 paywall', href: '/tools/test-x402-paywall/' },
        { title: 'Test checkout', href: '/tools/test-checkout/' },
    ],
};
export const paymentTestingDetails: ToolDetail[] = [
    {
        title: 'Test an agent that pays',
        paragraphs: [
            'Create a wallet with fake USD balance, then a paywall that returns HTTP 402. The agent calls wallet_pay with the paywall URL. A payment within its controls unlocks the content; an amount above the approval threshold asks a human before it can debit. Repeating the same idempotency key resumes that payment safely.',
            'Only a signed-in workspace owner or admin can change wallet limits and approval thresholds or answer approvals. API keys can read controls, add free test balance and request payments. Every test wallet, paywall and checkout counts toward the normal resource pool and expires under mock retention rules.',
        ],
    },
    {
        title: 'No real payment details',
        paragraphs: [
            'These resources use fake test money only. No blockchain settlement, real funds or private keys exist. The public checkout offers test outcome buttons and a second confirmation step. It never collects card details. API and MCP clients may submit fake fixtures from the card generators; the service retains only the result and last four digits.',
            'Checkout events are generic, signed and timestamped. Save the webhook secret returned once, verify the signature on raw bytes, reject stale timestamps and deduplicate event IDs. Inspect attempts and delivery results inside the dashboard or through the API.',
        ],
    },
];
