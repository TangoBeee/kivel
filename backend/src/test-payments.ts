import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { testPaymentLimits } from '@kivel.io/tools/billing-plans';
import { checkoutOutcomes, testCardOutcome } from '@kivel.io/tools/test-payments';
import type {
    CheckoutOutcome,
    TestPaymentKind,
    TestTransaction,
} from '@kivel.io/tools/test-payments';
import { Access, HttpError } from './access.js';
import type { Approval, ApprovalRepository, registerApprovals } from './approvals.js';
import type { ActivityRepository } from './activity.js';
import type { ResourceInfo, ResourceRepository } from './resources.js';
import type { RateLimitRepository } from './rate-limit.js';
import type { MockCallRepository } from './mock-calls.js';
import { Forwarder } from './forwarding.js';
import type { ForwardSend } from './forwarding.js';
import type { InboxDelivery } from './inboxes.js';
import { publicUrl } from './public-network.js';
import { secretVault } from './secret-vault.js';

interface Config {
    kind: TestPaymentKind;
    name: string;
    testMode: true;
    perPaymentLimit?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
    amount?: number;
    currency?: string;
    item?: string;
    description?: string;
    modes?: ('wallet' | 'permissive')[];
    response?: { status: number; body: unknown };
    successUrl?: string;
    cancelUrl?: string;
    webhookUrl?: string;
    version: string;
}
interface Transaction extends TestTransaction {
    requestKey: string;
    requestHash: string;
    requesterId: string;
    keyId?: string | undefined;
    version: string;
    expiresAt: string;
    targetId?: string;
    targetVersion?: string;
    targetUrl?: string;
}
interface Attempt {
    id: string;
    key: string;
    hash: string;
    at: string;
    outcome: CheckoutOutcome;
    last4?: string;
    verified?: boolean;
    eventId?: string;
    deliveryStarted?: boolean;
}
interface State {
    balance: number;
    transactions: Transaction[];
    attempts: Attempt[];
    deliveries: InboxDelivery[];
    webhookSecret?: string;
}
const now = () => new Date().toISOString();
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Provide a JSON object.');
    return value as Record<string, unknown>;
};
function text(value: unknown, name: string, max = 80, empty = false) {
    if (
        typeof value !== 'string' ||
        (!empty && !value.trim()) ||
        value.length > max ||
        /[\x00-\x1f\x7f]/.test(value)
    )
        throw new HttpError(
            400,
            `${name} must contain ${empty ? 'up to' : '1 to'} ${max} characters.`,
        );
    return value.trim();
}
function cents(value: unknown, name: string, zero = false) {
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < (zero ? 0 : 0.01) ||
        value > 1_000_000 ||
        Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
    )
        throw new HttpError(
            400,
            `${name} must be a test amount ${zero ? 'from 0' : 'from 0.01'} to 1,000,000 with at most two decimal places.`,
        );
    return Math.round(value * 100);
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configuration = (payload: Record<string, unknown>) => payload.payment as Config | undefined;
const stateOf = (payload: Record<string, unknown>) => payload.paymentState as State;
const publicTransaction = ({
    requestKey: _,
    requestHash: _h,
    requesterId: _r,
    keyId: _k,
    version: _v,
    targetVersion: _tv,
    targetUrl: _tu,
    ...transaction
}: Transaction) => transaction;
export function paymentView(resource: ResourceInfo, origin: string) {
    const config = configuration(resource.payload)!;
    const { version: _, ...visible } = config;
    const state = stateOf(resource.payload);
    const reserved = state.transactions
        .filter((tx) => tx.status === 'authorized' && Date.parse(tx.expiresAt) > Date.now())
        .reduce((sum, tx) => sum + cents(tx.amount, 'Amount'), 0);
    return {
        id: resource.id,
        ...visible,
        expiresAt: resource.expiresAt,
        ...(config.kind === 'wallet'
            ? {
                  balance: state.balance / 100,
                  availableBalance: (state.balance - reserved) / 100,
                  reservedBalance: reserved / 100,
              }
            : {
                  endpointUrl: `${origin}/${config.kind === 'paywall' ? 'pay' : 'checkout'}/${resource.id}`,
              }),
        ...(config.kind === 'checkout'
            ? {
                  attempts: state.attempts.map(
                      ({ key: _k, hash: _h, deliveryStarted: _d, ...attempt }) => attempt,
                  ),
                  deliveries: state.deliveries,
              }
            : {}),
    };
}
const escape = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
const page = (title: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} | Kivel test mode</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#111312;background:#fff;margin:0;padding:48px 20px}main{max-width:520px;margin:auto}h1{font-size:32px;line-height:1.2;letter-spacing:-.03em}p{color:#5d615e;overflow-wrap:anywhere}.banner{border:1px solid #e7e7e3;border-radius:12px;padding:12px 16px;color:#111312}button,a{font:inherit}button{padding:12px 18px;border:1px solid #d3d4d0;border-radius:24px;background:white;cursor:pointer;width:100%;margin:6px 0}button:hover{background:#f4f4f1}a{color:inherit}strong{color:#111312}</style></head><body><main><p>Kivel test checkout</p><div class="banner"><strong>Test mode, no real payment</strong><br>No card details, real money or blockchain transactions.</div>${body}</main></body></html>`;
function html(reply: FastifyReply, title: string, body: string) {
    return reply
        .header('X-Robots-Tag', 'noindex, nofollow')
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer')
        .header('X-Content-Type-Options', 'nosniff')
        .header(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        )
        .type('text/html')
        .send(page(title, body));
}
export function registerTestPayments({
    app,
    access,
    resources,
    approvals,
    review,
    activity,
    limits,
    calls,
    secret,
    forwardSend,
    forwardDelays,
}: {
    app: FastifyInstance;
    access: Access;
    resources: ResourceRepository;
    approvals: ApprovalRepository;
    review: ReturnType<typeof registerApprovals>;
    activity: ActivityRepository;
    limits: RateLimitRepository;
    calls: MockCallRepository;
    secret?: string | undefined;
    forwardSend?: ForwardSend | undefined;
    forwardDelays?: number[] | undefined;
}) {
    const encryption = secret ? secretVault(secret, 'test-payments') : undefined;
    const signingKey = secret
        ? createHmac('sha256', secret).update('kivel-test-payments-v1').digest()
        : undefined;
    const pending = new Set<Promise<void>>();
    app.addHook('preClose', async () => {
        await Promise.allSettled([...pending]);
    });
    function configured() {
        if (!encryption || !signingKey)
            throw new HttpError(503, 'Test payments require AUTH_SECRET on this server.');
        return { encryption, signingKey };
    }
    function signed(data: unknown, associatedData: string) {
        const { encryption, signingKey } = configured();
        const token = encryption.encrypt(JSON.stringify(data), associatedData);
        return `${Buffer.from(token).toString('base64url')}.${createHmac('sha256', signingKey).update(`${associatedData}.${token}`).digest('hex')}`;
    }
    function unsigned<T>(value: string, associatedData: string): T {
        const { encryption, signingKey } = configured();
        try {
            const parts = value.split('.');
            if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1]!)) throw new Error();
            const token = Buffer.from(parts[0]!, 'base64url').toString();
            const mac = createHmac('sha256', signingKey)
                .update(`${associatedData}.${token}`)
                .digest();
            if (!timingSafeEqual(mac, Buffer.from(parts[1]!, 'hex'))) throw new Error();
            return JSON.parse(encryption.decrypt(token, associatedData)) as T;
        } catch {
            throw new HttpError(403, 'Invalid or outdated test payment token.');
        }
    }
    async function human(request: FastifyRequest) {
        const identity = await access.require(request, 'resources:write', true);
        if (!['owner', 'admin'].includes(identity.role))
            throw new HttpError(
                403,
                'Only a signed-in workspace owner or admin may change wallet limits.',
            );
    }
    async function owned(
        request: FastifyRequest,
        id: string,
        kind: TestPaymentKind,
        write = false,
    ) {
        const actor = await access.workspace(request, write ? 'resources:write' : 'resources:read');
        const owner = actor.identity.account.id;
        const resource = await resources.read(id, 'mock', '', owner);
        if (!resource || configuration(resource.payload)?.kind !== kind)
            throw new HttpError(404, 'Test resource unavailable or access denied.');
        return { actor, owner, resource };
    }
    async function mutate<T>(
        id: string,
        owner: string,
        kind: TestPaymentKind,
        operation: (config: Config, state: State) => T,
    ) {
        const result = await resources.mutateMock(
            id,
            { ownerId: owner, managementToken: '' },
            (payload) => {
                const config = configuration(payload);
                if (config?.kind !== kind) throw new HttpError(404, 'Test resource unavailable.');
                return { payload, result: operation(config, stateOf(payload)) };
            },
        );
        if (result === undefined) throw new HttpError(404, 'Test resource unavailable.');
        if (result === 'full')
            throw new HttpError(
                503,
                'Resource storage is full. Delete old test resources and try again.',
            );
        return result as T;
    }
    async function rate(key: string, maximum = 60) {
        const retry = await limits.consume(`test-payments:${key}`, maximum);
        if (retry)
            throw new HttpError(429, 'Test payment rate limit reached. Try again shortly.', retry);
    }
    function url(value: unknown, name: string, webhook = false) {
        if (value === undefined || value === '') return undefined;
        const raw = text(value, name, 2048);
        try {
            if (webhook) return publicUrl(raw).href;
            const result = new URL(raw);
            if (
                !['https:', 'http:'].includes(result.protocol) ||
                result.username ||
                result.password
            )
                throw new Error();
            return result.href;
        } catch {
            throw new HttpError(
                400,
                `Provide a valid ${webhook ? 'public ' : ''}HTTP or HTTPS ${name} without credentials.`,
            );
        }
    }
    async function configInput(
        request: FastifyRequest,
        kind: TestPaymentKind,
        input: Record<string, unknown>,
        previous?: Config,
    ): Promise<Config> {
        const common = ['name', 'ttlSeconds', 'persistent'];
        const fields =
            kind === 'wallet'
                ? ['balance', 'perPaymentLimit', 'dailyLimit', 'approvalThreshold']
                : kind === 'paywall'
                  ? ['amount', 'description', 'modes', 'response']
                  : [
                        'amount',
                        'currency',
                        'item',
                        'description',
                        'successUrl',
                        'cancelUrl',
                        'webhookUrl',
                    ];
        if (Object.keys(input).some((key) => ![...common, ...fields].includes(key)))
            throw new HttpError(400, 'Unknown test payment field.');
        if (previous && input.balance !== undefined)
            throw new HttpError(400, 'Use top-up to add test balance.');
        const actor = await access.workspace(request, 'resources:write');
        const config: Config = {
            ...previous,
            kind,
            testMode: true,
            name: text(input.name ?? previous?.name, 'Name'),
            version: randomUUID(),
        };
        if (kind === 'wallet') {
            const controls = ['perPaymentLimit', 'dailyLimit', 'approvalThreshold'] as const;
            if (controls.some((key) => input[key] !== undefined)) await human(request);
            const defaults = testPaymentLimits[actor.plan];
            for (const key of controls) {
                const fallback =
                    key === 'perPaymentLimit'
                        ? defaults.perPayment
                        : key === 'dailyLimit'
                          ? defaults.daily
                          : defaults.approval;
                config[key] = cents(input[key] ?? previous?.[key] ?? fallback, key, true) / 100;
            }
        } else {
            config.amount = cents(input.amount ?? previous?.amount, 'Amount') / 100;
            config.description = text(
                input.description ?? previous?.description ?? '',
                'Description',
                80,
                true,
            );
            if (kind === 'paywall') {
                const modes = input.modes ?? previous?.modes ?? ['wallet'];
                if (
                    !Array.isArray(modes) ||
                    modes.length < 1 ||
                    modes.length > 2 ||
                    modes.some((mode) => !['wallet', 'permissive'].includes(mode))
                )
                    throw new HttpError(400, 'Choose wallet, permissive, or both payment modes.');
                config.modes = [...new Set(modes)] as NonNullable<Config['modes']>;
                const response = object(
                    input.response ??
                        previous?.response ?? {
                            status: 200,
                            body: { message: 'Test content unlocked.', testMode: true },
                        },
                );
                if (
                    !Number.isInteger(response.status) ||
                    Number(response.status) < 200 ||
                    Number(response.status) > 299 ||
                    [204, 205, 206].includes(Number(response.status)) ||
                    JSON.stringify(response.body ?? null).length > 16384
                )
                    throw new HttpError(
                        400,
                        'Use a success status from 200 to 299 with a body up to 16 KiB, excluding 204, 205 and 206.',
                    );
                config.response = { status: Number(response.status), body: response.body ?? null };
            } else {
                config.item = text(input.item ?? previous?.item, 'Item');
                const currency = input.currency ?? previous?.currency ?? 'USD';
                if (!['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(String(currency)))
                    throw new HttpError(400, 'Choose USD, EUR, GBP, CAD or AUD test currency.');
                config.currency = String(currency);
                for (const key of ['successUrl', 'cancelUrl', 'webhookUrl'] as const) {
                    const location = url(input[key] ?? previous?.[key], key, key === 'webhookUrl');
                    if (location) config[key] = location;
                    else delete config[key];
                }
            }
        }
        return config;
    }
    for (const [path, kind] of [
        ['test-wallets', 'wallet'],
        ['test-paywalls', 'paywall'],
        ['test-checkouts', 'checkout'],
    ] as const) {
        app.get(`/api/${path}`, async (request) => {
            const actor = await access.workspace(request, 'resources:read');
            return {
                testMode: true,
                resources: (await resources.listOwned(actor.identity.account.id))
                    .filter((resource) => configuration(resource.payload)?.kind === kind)
                    .map((resource) => paymentView(resource, access.origin)),
            };
        });
        app.post(`/api/${path}`, { bodyLimit: 24576 }, async (request, reply) => {
            configured();
            const actor = await access.workspace(request, 'resources:write');
            const input = object(request.body);
            const config = await configInput(request, kind, input);
            const balance = kind === 'wallet' ? cents(input.balance ?? 100, 'Balance', true) : 0;
            await access.rate(request, true);
            const webhookSecret =
                kind === 'checkout' ? `whsec_test_${randomBytes(24).toString('hex')}` : undefined;
            const created = await resources.create(
                'mock',
                (id) => ({
                    name: config.name,
                    payment: config,
                    paymentState: {
                        balance,
                        transactions: [],
                        attempts: [],
                        deliveries: [],
                        ...(webhookSecret
                            ? { webhookSecret: configured().encryption.encrypt(webhookSecret, id) }
                            : {}),
                    },
                }),
                undefined,
                await access.allocation(request, {
                    ...input,
                    visibility: kind === 'wallet' ? 'private' : 'public',
                }),
            );
            if (!created) throw new HttpError(503, 'Temporary resource capacity reached.');
            return reply.code(201).send({
                ...paymentView(
                    (await resources.read(created.id, 'mock', '', actor.identity.account.id))!,
                    access.origin,
                ),
                ...(webhookSecret ? { webhookSecret } : {}),
            });
        });
        app.get<{ Params: { id: string } }>(`/api/${path}/:id`, async (request) =>
            paymentView((await owned(request, request.params.id, kind)).resource, access.origin),
        );
        app.patch<{ Params: { id: string } }>(
            `/api/${path}/:id`,
            { bodyLimit: 24576 },
            async (request) => {
                const { owner, resource } = await owned(request, request.params.id, kind, true);
                const previous = configuration(resource.payload)!;
                const next = await configInput(request, kind, object(request.body), previous);
                await mutate(resource.id, owner, kind, (config, state) => {
                    if (config.version !== previous.version)
                        throw new HttpError(409, 'Resource changed. Reload and try again.');
                    Object.assign(config, next);
                    if (kind === 'wallet')
                        for (const transaction of state.transactions)
                            if (['authorized', 'awaitingApproval'].includes(transaction.status))
                                transition(
                                    transaction,
                                    'refused',
                                    'Wallet settings changed. Create a new test payment.',
                                );
                    return true;
                });
                return paymentView(
                    (await resources.read(resource.id, 'mock', '', owner))!,
                    access.origin,
                );
            },
        );
        app.delete<{ Params: { id: string } }>(`/api/${path}/:id`, async (request, reply) => {
            const { owner } = await owned(request, request.params.id, kind, true);
            if (!(await resources.delete(request.params.id, 'mock', '', owner)))
                throw new HttpError(404, 'Test resource unavailable.');
            return reply.code(204).send();
        });
    }
    function transition(transaction: Transaction, status: Transaction['status'], reason?: string) {
        transaction.status = status;
        if (reason) transaction.reason = reason;
        else delete transaction.reason;
        transaction.events.push({ at: now(), status, ...(reason ? { reason } : {}) });
    }
    function expired(state: State) {
        for (const transaction of state.transactions)
            if (
                ['authorized', 'awaitingApproval'].includes(transaction.status) &&
                Date.parse(transaction.expiresAt) <= Date.now()
            )
                transition(transaction, 'expired', 'Test payment authorization expired.');
    }
    function allowance(config: Config, state: State, amount: number, exclude?: string) {
        expired(state);
        const holds = state.transactions.filter(
            (tx) => tx.id !== exclude && tx.status === 'authorized',
        );
        if (amount > cents(config.perPaymentLimit, 'Per-payment limit', true))
            return 'Per-payment limit exceeded.';
        if (amount > state.balance - holds.reduce((sum, tx) => sum + cents(tx.amount, 'Amount'), 0))
            return 'Insufficient test balance.';
        const today = now().slice(0, 10);
        const spent = state.transactions
            .filter(
                (tx) =>
                    tx.id !== exclude &&
                    tx.kind === 'payment' &&
                    tx.status === 'succeeded' &&
                    tx.events.some(
                        (event) => event.status === 'succeeded' && event.at.startsWith(today),
                    ),
            )
            .reduce((sum, tx) => sum + cents(tx.amount, 'Amount'), 0);
        if (
            amount + spent + holds.reduce((sum, tx) => sum + cents(tx.amount, 'Amount'), 0) >
            cents(config.dailyLimit, 'Daily limit', true)
        )
            return 'Daily test payment limit exceeded.';
        return undefined;
    }
    app.post<{ Params: { id: string } }>('/api/test-wallets/:id/top-up', async (request) => {
        const { owner, actor } = await owned(request, request.params.id, 'wallet', true);
        const amount = cents(object(request.body).amount, 'Amount');
        await rate(`topup:${owner}`, testPaymentLimits[actor.plan].topupsPerMinute);
        return mutate(request.params.id, owner, 'wallet', (_config, state) => {
            if (state.balance + amount > 100_000_000)
                throw new HttpError(400, 'Test balance may not exceed 1,000,000.');
            state.balance += amount;
            const transaction: Transaction = {
                id: randomUUID(),
                at: now(),
                kind: 'topup',
                amount: amount / 100,
                payee: 'Test top-up',
                memo: 'No real money',
                status: 'succeeded',
                events: [{ at: now(), status: 'succeeded' }],
                requestKey: '',
                requestHash: '',
                requesterId: actor.identity.userId,
                keyId: actor.identity.keyId,
                version: '',
                expiresAt: now(),
            };
            state.transactions.push(transaction);
            return {
                testMode: true,
                balance: state.balance / 100,
                transaction: publicTransaction(transaction),
            };
        });
    });
    app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
        '/api/test-wallets/:id/transactions',
        async (request) => {
            const { owner, resource } = await owned(request, request.params.id, 'wallet');
            const decisions = new Map(
                await Promise.all(
                    stateOf(resource.payload)
                        .transactions.filter(
                            (tx) => tx.status === 'awaitingApproval' && tx.approvalId,
                        )
                        .map(
                            async (tx) =>
                                [tx.id, await approvals.get(owner, tx.approvalId!)] as const,
                        ),
                ),
            );
            const limit = Number(request.query.limit ?? 50);
            if (!Number.isInteger(limit) || limit < 1 || limit > 100)
                throw new HttpError(400, 'Choose a limit from 1 to 100.');
            return mutate(request.params.id, owner, 'wallet', (_config, state) => {
                expired(state);
                for (const tx of state.transactions) {
                    const approval = decisions.get(tx.id);
                    if (
                        tx.status !== 'awaitingApproval' ||
                        !approval ||
                        approval.walletPayment?.transactionId !== tx.id ||
                        approval.walletPayment.version !== tx.version
                    )
                        continue;
                    if (approval.status === 'answered' && approval.answer === 'Approve') {
                        if (!tx.events.some((event) => event.status === 'approved'))
                            tx.events.push({
                                at: approval.answeredAt ?? now(),
                                status: 'approved',
                            });
                    } else if (approval.status !== 'pending')
                        transition(
                            tx,
                            'refused',
                            'The test payment was rejected or its approval expired.',
                        );
                }
                const transactions = [...state.transactions].reverse();
                const start = request.query.cursor
                    ? transactions.findIndex((tx) => tx.id === request.query.cursor) + 1
                    : 0;
                if (request.query.cursor && start === 0)
                    throw new HttpError(400, 'Invalid transaction cursor.');
                const items = transactions.slice(start, start + limit);
                return {
                    testMode: true,
                    transactions: items.map(publicTransaction),
                    ...(start + limit < transactions.length
                        ? { nextCursor: items.at(-1)!.id }
                        : {}),
                };
            });
        },
    );
    async function target(payee: string, owner: string) {
        let location: URL;
        try {
            location = new URL(payee, access.origin);
        } catch {
            return undefined;
        }
        if (location.origin !== access.origin) return undefined;
        const match = /^\/(pay|checkout)\/([a-f0-9-]{36})(?:\/.*)?$/.exec(location.pathname);
        if (!match) return undefined;
        const resource = await resources.peek(match[2]!, 'mock', { ownerId: owner });
        const config = resource && configuration(resource.payload);
        if (!resource || !config || config.kind !== (match[1] === 'pay' ? 'paywall' : 'checkout'))
            throw new HttpError(404, 'Test payment target unavailable.');
        if (config.kind === 'paywall' && !config.modes?.includes('wallet'))
            throw new HttpError(403, 'This test paywall does not allow wallets.');
        if (config.kind === 'checkout') checkoutSecret(resource);
        if (config.kind === 'checkout' && config.currency !== 'USD')
            throw new HttpError(400, 'Test wallets support USD checkouts only.');
        return {
            resource,
            config,
            url: `${location.origin}${location.pathname}${location.search}`,
        };
    }
    function paymentToken(owner: string, walletId: string, tx: Transaction) {
        return Buffer.from(
            JSON.stringify({
                x402Version: 1,
                scheme: 'exact',
                network: 'base-sepolia',
                payload: {
                    kind: 'kivel-test-wallet',
                    token: signed(
                        {
                            owner,
                            walletId,
                            transactionId: tx.id,
                            targetId: tx.targetId,
                            version: tx.targetVersion,
                            url: tx.targetUrl,
                            expiresAt: tx.expiresAt,
                        },
                        `pay:${tx.targetId}`,
                    ),
                },
            }),
        ).toString('base64');
    }
    async function recordActivity(owner: string, walletId: string, tx: Transaction) {
        await activity.record(owner, {
            at: now(),
            tool: 'wallet_pay',
            resourceId: walletId,
            ok: tx.status === 'succeeded',
            durationMs: 0,
            userId: tx.requesterId,
            ...(tx.keyId ? { keyId: tx.keyId } : {}),
        });
    }
    app.post<{ Params: { id: string } }>(
        '/api/test-wallets/:id/pay',
        { bodyLimit: 8192 },
        async (request, reply) => {
            const { owner, actor, resource } = await owned(
                request,
                request.params.id,
                'wallet',
                true,
            );
            configured();
            const input = object(request.body);
            if (
                Object.keys(input).some(
                    (key) =>
                        !['payee', 'amount', 'memo', 'idempotencyKey', 'authorizeOnly'].includes(
                            key,
                        ),
                )
            )
                throw new HttpError(400, 'Unknown test payment field.');
            const payee = text(input.payee, 'Payee', 2048),
                memo = text(input.memo ?? '', 'Memo', 200, true);
            const requestKey = text(input.idempotencyKey, 'Idempotency key', 100);
            if (input.authorizeOnly !== undefined && typeof input.authorizeOnly !== 'boolean')
                throw new HttpError(400, 'authorizeOnly must be true or false.');
            const destination = await target(payee, owner);
            if (input.authorizeOnly && destination?.config.kind !== 'paywall')
                throw new HttpError(400, 'authorizeOnly is available for test paywalls.');
            const amount = cents(input.amount ?? destination?.config.amount, 'Amount');
            if (destination && amount !== cents(destination.config.amount, 'Amount'))
                throw new HttpError(400, 'Amount must match the test target price.');
            const requestHash = hash({
                payee,
                amount,
                memo,
                authorizeOnly: input.authorizeOnly === true,
            });
            await rate(`pay:${owner}`);
            const snapshot = configuration(resource.payload)!;
            const existing = stateOf(resource.payload).transactions.find(
                (tx) => tx.requestKey === requestKey,
            );
            let prepared: Approval | undefined;
            if (
                !existing &&
                amount > cents(snapshot.approvalThreshold, 'Approval threshold', true)
            ) {
                prepared = await review.prepare(request, {
                    question: `Your agent wants to pay $${(amount / 100).toFixed(2)} to ${payee.slice(0, 150)} for ${memo || 'a test payment'}. Approve?`,
                    details: `Test mode. No real money. Wallet: ${snapshot.name}.`,
                    options: ['Approve', 'Reject'],
                });
            }
            const approval = existing?.approvalId
                ? await approvals.get(owner, existing.approvalId)
                : undefined;
            const transaction = await mutate(resource.id, owner, 'wallet', (config, state) => {
                expired(state);
                let tx = state.transactions.find((item) => item.requestKey === requestKey);
                if (tx) {
                    if (
                        tx.requestHash !== requestHash ||
                        tx.requesterId !== actor.identity.userId ||
                        tx.keyId !== actor.identity.keyId
                    )
                        throw new HttpError(
                            409,
                            'This idempotency key belongs to a different payment or caller.',
                        );
                    if (tx.status !== 'awaitingApproval') return tx;
                    if (!approval) return tx;
                    if (
                        approval.walletPayment?.walletId !== resource.id ||
                        approval.walletPayment.transactionId !== tx.id ||
                        approval.walletPayment.version !== config.version ||
                        approval.walletPayment.requesterId !== actor.identity.userId ||
                        approval.keyId !== actor.identity.keyId
                    )
                        throw new HttpError(
                            403,
                            'Approval does not authorize this payment and caller.',
                        );
                    if (approval.status === 'pending') return tx;
                    if (
                        approval.status !== 'answered' ||
                        approval.answer !== 'Approve' ||
                        Date.parse(approval.expiresAt) <= Date.now()
                    ) {
                        transition(
                            tx,
                            'refused',
                            'The test payment was rejected or its approval expired.',
                        );
                        return tx;
                    }
                    if (!tx.events.some((event) => event.status === 'approved'))
                        tx.events.push({ at: approval.answeredAt ?? now(), status: 'approved' });
                } else {
                    if (config.version !== snapshot.version)
                        throw new HttpError(409, 'Wallet settings changed. Retry the payment.');
                    tx = {
                        id: randomUUID(),
                        at: now(),
                        kind: 'payment',
                        amount: amount / 100,
                        payee,
                        memo,
                        requestKey,
                        requestHash,
                        requesterId: actor.identity.userId,
                        keyId: actor.identity.keyId,
                        version: config.version,
                        expiresAt: new Date(
                            Math.min(
                                Date.now() + (prepared ? 3600_000 : 300_000),
                                Date.parse(resource.expiresAt),
                                destination ? Date.parse(destination.resource.expiresAt) : Infinity,
                            ),
                        ).toISOString(),
                        status: 'authorized',
                        events: [],
                        ...(destination
                            ? {
                                  targetId: destination.resource.id,
                                  targetVersion: destination.config.version,
                                  targetUrl: destination.url,
                              }
                            : {}),
                    };
                    state.transactions.push(tx);
                }
                const reason = allowance(config, state, amount, tx.id);
                if (reason) {
                    transition(tx, 'refused', reason);
                    return tx;
                }
                if (prepared) {
                    tx.approvalId = prepared.id;
                    transition(tx, 'awaitingApproval');
                    return tx;
                }
                if (destination?.config.kind === 'paywall') {
                    tx.expiresAt = new Date(
                        Math.min(Date.now() + 300_000, Date.parse(tx.expiresAt)),
                    ).toISOString();
                    transition(tx, 'authorized');
                } else {
                    state.balance -= amount;
                    transition(tx, 'succeeded');
                }
                return tx;
            });
            if (transaction.status === 'awaitingApproval') {
                if (!approval) {
                    prepared ??= await review.prepare(request, {
                        question: `Your agent wants to pay $${transaction.amount.toFixed(2)} to ${transaction.payee.slice(0, 150)} for ${transaction.memo || 'a test payment'}. Approve?`,
                        details: 'Test mode. No real money.',
                        options: ['Approve', 'Reject'],
                    });
                    prepared.id = transaction.approvalId!;
                    prepared.expiresAt = transaction.expiresAt;
                    prepared.walletPayment = {
                        walletId: resource.id,
                        transactionId: transaction.id,
                        version: transaction.version,
                        requesterId: transaction.requesterId,
                    };
                    await review.submit(prepared);
                }
                return reply.code(202).send({
                    testMode: true,
                    status: transaction.status,
                    transaction: publicTransaction(transaction),
                    approvalId: transaction.approvalId,
                    answerUrl: `${access.origin}/approve/?id=${transaction.approvalId}`,
                });
            }
            await recordActivity(owner, resource.id, transaction);
            if (['refused', 'expired'].includes(transaction.status))
                return reply.code(403).send({
                    testMode: true,
                    status: transaction.status,
                    error: transaction.reason ?? 'Test payment refused.',
                    reason: transaction.reason,
                    transaction: publicTransaction(transaction),
                });
            if (destination?.config.kind === 'checkout') {
                const attempt = await checkoutAttempt(
                    destination.resource,
                    `wallet:${transaction.id}`,
                    hash({ transactionId: transaction.id }),
                    'succeeded',
                );
                return {
                    testMode: true,
                    status: 'succeeded',
                    transaction: publicTransaction(transaction),
                    checkout: { testMode: true, ...publicAttempt(attempt) },
                };
            }
            if (destination?.config.kind === 'paywall') {
                if (transaction.status === 'succeeded')
                    return {
                        testMode: true,
                        status: 'succeeded',
                        transaction: publicTransaction(transaction),
                        content: destination.config.response?.body,
                    };
                const header = paymentToken(owner, resource.id, transaction);
                if (input.authorizeOnly)
                    return {
                        testMode: true,
                        status: 'authorized',
                        transaction: publicTransaction(transaction),
                        paymentHeader: header,
                        headerName: 'X-PAYMENT',
                        expiresAt: transaction.expiresAt,
                    };
                const location = new URL(destination.url);
                const response = await app.inject({
                    method: 'GET',
                    url: `${location.pathname}${location.search}`,
                    headers: { host: location.host, 'x-payment': header },
                });
                return reply.code(response.statusCode).send({
                    testMode: true,
                    status: response.statusCode < 300 ? 'succeeded' : 'refused',
                    transactionId: transaction.id,
                    ...(response.statusCode >= 400
                        ? { error: response.json().reason ?? 'Test paywall refused the payment.' }
                        : {}),
                    content: response.json(),
                    paymentResponse: response.headers['x-payment-response'],
                });
            }
            return {
                testMode: true,
                status: transaction.status,
                transaction: publicTransaction(transaction),
            };
        },
    );
    const delivery = new Forwarder(
        {
            recordDelivery: async (id, entry) => {
                const resource = await resources.peek(id, 'mock');
                if (resource?.ownerId)
                    await mutate(id, resource.ownerId, 'checkout', (_config, state) => {
                        state.deliveries.push(entry);
                        return true;
                    });
            },
        },
        forwardSend,
        forwardDelays,
    );
    async function log(
        resourceId: string,
        request: FastifyRequest,
        status: number,
        details: Record<string, unknown>,
    ) {
        await calls.record(resourceId, {
            at: now(),
            method: request.method,
            path: request.url.split('?')[0]!,
            query: request.url.startsWith('/pay/')
                ? (request.query as Record<string, unknown>)
                : {},
            status,
            durationMs: 0,
            bodySize: 0,
            bodyPreview: JSON.stringify({ testMode: true, ...details }),
        });
    }
    for (const path of ['/pay/:id', '/pay/:id/*'])
        app.all<{ Params: { id: string } }>(path, { bodyLimit: 16384 }, async (request, reply) => {
            reply.header('Cache-Control', 'no-store').header('X-Kivel-Test-Mode', 'true');
            await rate(`public:${request.ip}`);
            const resource = await resources.peek(request.params.id, 'mock');
            const config = resource && configuration(resource.payload);
            if (!resource || config?.kind !== 'paywall')
                throw new HttpError(404, 'Test paywall unavailable.');
            const location = `${access.origin}${request.url}`;
            const required = {
                x402Version: 1,
                testMode: true,
                error: 'Test payment required. No real money or blockchain settlement.',
                accepts: [
                    {
                        scheme: 'exact',
                        network: 'base-sepolia',
                        asset: `0x${'0'.repeat(39)}1`,
                        amount: String(cents(config.amount, 'Amount') * 10000),
                        maxAmountRequired: String(cents(config.amount, 'Amount') * 10000),
                        payTo: `0x${hash(resource.id).slice(0, 40)}`,
                        resource: location,
                        description: config.description || 'Kivel test paywall',
                        mimeType: 'application/json',
                        maxTimeoutSeconds: 300,
                    },
                ],
            };
            const header = request.headers['x-payment'];
            if (typeof header !== 'string') {
                await log(resource.id, request, 402, { paymentStatus: 'required' });
                return reply.code(402).send(required);
            }
            try {
                if (header.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header))
                    throw new HttpError(400, 'X-PAYMENT must be base64-encoded x402 v1 JSON.');
                const payment = object(JSON.parse(Buffer.from(header, 'base64').toString()));
                const payload = object(payment.payload);
                if (
                    payment.x402Version !== 1 ||
                    payment.scheme !== 'exact' ||
                    payment.network !== 'base-sepolia'
                )
                    throw new HttpError(
                        400,
                        'Use x402 v1 exact payments on the base-sepolia test network.',
                    );
                if (payload.kind === 'kivel-test-wallet') {
                    if (!config.modes?.includes('wallet') || typeof payload.token !== 'string')
                        throw new HttpError(403, 'Wallet mode is not allowed.');
                    const claim = unsigned<{
                        owner: string;
                        walletId: string;
                        transactionId: string;
                        targetId: string;
                        version: string;
                        url: string;
                        expiresAt: string;
                    }>(payload.token, `pay:${resource.id}`);
                    if (
                        claim.targetId !== resource.id ||
                        claim.version !== config.version ||
                        claim.url !== location ||
                        Date.parse(claim.expiresAt) <= Date.now()
                    )
                        throw new HttpError(
                            403,
                            'Test payment expired or does not match this paywall URL and price.',
                        );
                    const settled = await mutate(
                        claim.walletId,
                        claim.owner,
                        'wallet',
                        (wallet, state) => {
                            expired(state);
                            const tx = state.transactions.find(
                                (tx) => tx.id === claim.transactionId,
                            );
                            if (!tx)
                                throw new HttpError(
                                    409,
                                    'Test payment authorization is unavailable.',
                                );
                            if (
                                tx.status !== 'authorized' ||
                                tx.version !== wallet.version ||
                                tx.targetId !== resource.id ||
                                tx.targetVersion !== config.version ||
                                tx.targetUrl !== location ||
                                cents(tx.amount, 'Amount') !== cents(config.amount, 'Amount')
                            ) {
                                const error =
                                    'Test payment was already used, expired or invalidated.';
                                tx.events.push({ at: now(), status: 'refused', reason: error });
                                return { transaction: tx, error };
                            }
                            const reason = allowance(
                                wallet,
                                state,
                                cents(tx.amount, 'Amount'),
                                tx.id,
                            );
                            if (reason) {
                                transition(tx, 'refused', reason);
                                return { transaction: tx, error: undefined };
                            }
                            state.balance -= cents(tx.amount, 'Amount');
                            transition(tx, 'succeeded');
                            return { transaction: tx, error: undefined };
                        },
                    );
                    if (settled.error) throw new HttpError(409, settled.error);
                    const tx = settled.transaction;
                    await recordActivity(claim.owner, claim.walletId, tx);
                    if (tx.status !== 'succeeded')
                        throw new HttpError(403, tx.reason ?? 'Test payment refused.');
                } else {
                    if (!config.modes?.includes('permissive'))
                        throw new HttpError(
                            403,
                            'This paywall only accepts Kivel test wallet tokens.',
                        );
                    const authorization = object(payload.authorization);
                    if (
                        typeof payload.signature !== 'string' ||
                        !/^0x[0-9a-f]{130}$/i.test(payload.signature) ||
                        !['from', 'to'].every(
                            (key) =>
                                typeof authorization[key] === 'string' &&
                                /^0x[0-9a-f]{40}$/i.test(authorization[key] as string),
                        ) ||
                        !['value', 'validAfter', 'validBefore'].every(
                            (key) =>
                                typeof authorization[key] === 'string' &&
                                /^\d{1,30}$/.test(authorization[key] as string),
                        ) ||
                        typeof authorization.nonce !== 'string' ||
                        !/^0x[0-9a-f]{64}$/i.test(authorization.nonce)
                    )
                        throw new HttpError(
                            400,
                            'Malformed x402 v1 authorization. Permissive mode checks structure only.',
                        );
                }
                const result = {
                    success: true,
                    testMode: true,
                    transaction: `0x${randomBytes(32).toString('hex')}`,
                    network: 'base-sepolia',
                };
                await log(resource.id, request, config.response!.status, {
                    paymentStatus: 'succeeded',
                });
                return reply
                    .header(
                        'X-PAYMENT-RESPONSE',
                        Buffer.from(JSON.stringify(result)).toString('base64'),
                    )
                    .type('application/json')
                    .code(config.response!.status)
                    .send(JSON.stringify(config.response!.body));
            } catch (error) {
                const status = error instanceof HttpError ? error.statusCode : 400;
                const reason =
                    error instanceof HttpError ? error.message : 'Malformed X-PAYMENT JSON.';
                await log(resource.id, request, status, { paymentStatus: 'refused', reason });
                return reply
                    .code(status)
                    .send({ error: 'test_payment_refused', reason, testMode: true });
            }
        });
    function publicAttempt({ key: _, hash: _h, deliveryStarted: _d, ...attempt }: Attempt) {
        return attempt;
    }
    function checkoutSecret(resource: ResourceInfo) {
        if (!configuration(resource.payload)?.webhookUrl) return undefined;
        const stored = stateOf(resource.payload).webhookSecret;
        if (!stored)
            throw new HttpError(409, 'Re-create this checkout to restore its webhook secret.');
        try {
            return configured().encryption.decrypt(stored, resource.id);
        } catch {
            throw new HttpError(
                409,
                'Re-create this checkout. Its webhook secret cannot be decrypted with the current server key.',
            );
        }
    }
    async function checkoutAttempt(
        resource: ResourceInfo,
        key: string,
        requestHash: string,
        outcome: CheckoutOutcome,
        last4?: string,
        verify = false,
    ) {
        const webhookSecret = checkoutSecret(resource);
        const result = await mutate(
            resource.id,
            resource.ownerId!,
            'checkout',
            (_config, state) => {
                let attempt = state.attempts.find((item) => item.key === key);
                if (attempt && attempt.hash !== requestHash)
                    throw new HttpError(
                        409,
                        'This idempotency key belongs to a different checkout attempt.',
                    );
                if (!attempt) {
                    attempt = {
                        id: randomUUID(),
                        key,
                        hash: requestHash,
                        at: now(),
                        outcome,
                        ...(last4 ? { last4 } : {}),
                    };
                    state.attempts.push(attempt);
                }
                if (verify && attempt.outcome === 'requires_verification') {
                    attempt.outcome = 'succeeded';
                    attempt.verified = true;
                }
                const deliver =
                    attempt.outcome !== 'requires_verification' && !attempt.deliveryStarted;
                if (deliver) {
                    attempt.eventId = randomUUID();
                    attempt.deliveryStarted = true;
                }
                return { attempt, deliver };
            },
        );
        if (result.deliver) {
            const config = configuration(resource.payload)!;
            if (config.webhookUrl && webhookSecret) {
                const body = JSON.stringify({
                    id: result.attempt.eventId,
                    type:
                        result.attempt.outcome === 'succeeded'
                            ? 'payment.succeeded'
                            : 'payment.failed',
                    created: Math.floor(Date.now() / 1000),
                    testMode: true,
                    data: {
                        payment: {
                            id: result.attempt.id,
                            checkoutId: resource.id,
                            amount: cents(config.amount, 'Amount'),
                            currency: config.currency,
                            item: config.item,
                            outcome: result.attempt.outcome,
                            ...(result.attempt.last4 ? { last4: result.attempt.last4 } : {}),
                        },
                    },
                });
                const timestamp = String(Math.floor(Date.now() / 1000));
                const signature = createHmac('sha256', webhookSecret)
                    .update(`${timestamp}.${body}`)
                    .digest('hex');
                const task = delivery
                    .deliver(resource.id, config.webhookUrl, {
                        id: result.attempt.eventId!,
                        method: 'POST',
                        query: '',
                        headers: {
                            'content-type': 'application/json',
                            'x-kivel-signature': `t=${timestamp},v1=${signature}`,
                            'x-kivel-test-mode': 'true',
                        },
                        body: Buffer.from(body),
                        utf8: true,
                    })
                    .catch((error: unknown) => {
                        app.log.error({ err: error }, 'Test checkout webhook delivery failed');
                    });
                pending.add(task);
                void task.finally(() => pending.delete(task));
                await task;
            }
        }
        return result.attempt;
    }
    async function publicCheckout(id: string) {
        const resource = await resources.peek(id, 'mock');
        if (!resource || configuration(resource.payload)?.kind !== 'checkout')
            throw new HttpError(404, 'Test checkout unavailable.');
        return resource;
    }
    function confirmation(resource: ResourceInfo, attempt: Attempt) {
        return signed(
            {
                key: attempt.key,
                hash: attempt.hash,
                version: configuration(resource.payload)!.version,
                expiresAt: Math.min(Date.now() + 300000, Date.parse(resource.expiresAt)),
            },
            `checkout-confirm:${resource.id}`,
        );
    }
    app.post<{ Params: { id: string } }>(
        '/api/test-checkouts/:id/complete',
        { bodyLimit: 4096 },
        async (request, reply) => {
            const { resource, owner } = await owned(request, request.params.id, 'checkout', true);
            await rate(`checkout:${owner}`);
            const input = object(request.body);
            if (Object.keys(input).some((key) => !['card', 'idempotencyKey'].includes(key)))
                throw new HttpError(
                    400,
                    'Provide a fake test card and idempotencyKey. Use wallet_pay for test wallets.',
                );
            const card = object(input.card);
            if (Object.keys(card).some((key) => !['number', 'expiry', 'cvc'].includes(key)))
                throw new HttpError(400, 'Unknown test card field.');
            const key = text(input.idempotencyKey, 'Idempotency key', 100);
            let outcome: CheckoutOutcome;
            try {
                outcome = testCardOutcome(text(card.number, 'Test card number', 30));
            } catch {
                throw new HttpError(
                    400,
                    'Provide a Luhn-valid fake test card number. Never use real payment details.',
                );
            }
            if (card.expiry !== undefined) {
                const match = /^(\d{2})\/(\d{2}|\d{4})$/.exec(String(card.expiry));
                if (!match || Number(match[1]) < 1 || Number(match[1]) > 12)
                    throw new HttpError(400, 'Use MM/YY or MM/YYYY test expiry.');
                const year = Number(match[2]) + (match[2]!.length === 2 ? 2000 : 0);
                if (Date.UTC(year, Number(match[1]), 1) <= Date.now()) outcome = 'expired';
            }
            if (card.cvc !== undefined && !/^\d{3,4}$/.test(String(card.cvc)))
                throw new HttpError(400, 'Use a three or four digit fake CVC.');
            const last4 = String(card.number).replace(/[ -]/g, '').slice(-4);
            const attempt = await checkoutAttempt(
                resource,
                `api:${key}`,
                hash({ outcome, last4 }),
                outcome,
                last4,
            );
            await log(resource.id, request, 200, { outcome: attempt.outcome, last4 });
            return reply.header('Cache-Control', 'no-store').send({
                testMode: true,
                ...publicAttempt(attempt),
                ...(attempt.outcome === 'requires_verification'
                    ? { confirmationToken: confirmation(resource, attempt) }
                    : {}),
            });
        },
    );
    app.post<{ Params: { id: string } }>('/api/test-checkouts/:id/confirm', async (request) => {
        const { resource } = await owned(request, request.params.id, 'checkout', true);
        const token = text(object(request.body).confirmationToken, 'Confirmation token', 4096);
        const claim = unsigned<{ key: string; hash: string; expiresAt: number; version: string }>(
            token,
            `checkout-confirm:${resource.id}`,
        );
        if (
            claim.expiresAt <= Date.now() ||
            claim.version !== configuration(resource.payload)!.version
        )
            throw new HttpError(403, 'Test verification expired. Start a new attempt.');
        const attempt = await checkoutAttempt(
            resource,
            claim.key,
            claim.hash,
            'requires_verification',
            undefined,
            true,
        );
        await log(resource.id, request, 200, { outcome: attempt.outcome });
        return { testMode: true, ...publicAttempt(attempt) };
    });
    app.get<{ Params: { id: string } }>('/checkout/:id', async (request, reply) => {
        await rate(`public:${request.ip}`);
        const resource = await publicCheckout(request.params.id),
            config = configuration(resource.payload)!;
        const key = randomUUID();
        const token = signed(
            {
                key,
                version: config.version,
                expiresAt: Math.min(Date.now() + 300000, Date.parse(resource.expiresAt)),
            },
            `checkout-page:${resource.id}`,
        );
        await log(resource.id, request, 200, { page: 'outcomes' });
        return html(
            reply,
            config.item!,
            `<h1>${escape(config.item!)}</h1><p>${escape(config.description ?? '')}</p><h2>${config.currency} ${config.amount!.toFixed(2)} <small>test units</small></h2><p>Choose a test outcome. No card details are collected.</p><form method="post"><input type="hidden" name="token" value="${escape(token)}">${checkoutOutcomes.map((outcome) => `<button name="outcome" value="${outcome}">${{ succeeded: 'Payment succeeds', declined: 'Card declined', insufficient_funds: 'Insufficient funds', requires_verification: 'Needs verification', expired: 'Card expired' }[outcome]}</button>`).join('')}</form>${config.cancelUrl ? leaving(config.cancelUrl, 'Cancel this test') : ''}`,
        );
    });
    function leaving(location: string, label: string) {
        return `<p>You are leaving Kivel for <strong>${escape(new URL(location).origin)}</strong>.</p><p><a href="${escape(location)}" rel="noreferrer">${escape(label)}</a></p>`;
    }
    app.register(async (hosted) => {
        hosted.addContentTypeParser(
            'application/x-www-form-urlencoded',
            { parseAs: 'string' },
            (_request, body, done) =>
                done(null, Object.fromEntries(new URLSearchParams(String(body)))),
        );
        hosted.post<{ Params: { id: string } }>(
            '/checkout/:id',
            { bodyLimit: 8192 },
            async (request, reply) => {
                await rate(`public:${request.ip}`);
                const resource = await publicCheckout(request.params.id),
                    config = configuration(resource.payload)!;
                const input = object(request.body);
                let attempt: Attempt;
                if (typeof input.confirmationToken === 'string') {
                    const claim = unsigned<{
                        key: string;
                        hash: string;
                        expiresAt: number;
                        version: string;
                    }>(input.confirmationToken, `checkout-confirm:${resource.id}`);
                    if (
                        claim.expiresAt <= Date.now() ||
                        claim.version !== configuration(resource.payload)!.version
                    )
                        throw new HttpError(403, 'Test verification expired.');
                    attempt = await checkoutAttempt(
                        resource,
                        claim.key,
                        claim.hash,
                        'requires_verification',
                        undefined,
                        true,
                    );
                } else {
                    const claim = unsigned<{ key: string; expiresAt: number; version: string }>(
                        text(input.token, 'Test page token', 4096),
                        `checkout-page:${resource.id}`,
                    );
                    if (
                        claim.expiresAt <= Date.now() ||
                        claim.version !== configuration(resource.payload)!.version
                    )
                        throw new HttpError(403, 'Test page expired. Reload and try again.');
                    if (!checkoutOutcomes.includes(input.outcome as CheckoutOutcome))
                        throw new HttpError(400, 'Choose a test outcome.');
                    attempt = await checkoutAttempt(
                        resource,
                        `page:${claim.key}`,
                        hash(input.outcome),
                        input.outcome as CheckoutOutcome,
                    );
                }
                await log(resource.id, request, 200, { outcome: attempt.outcome });
                if (attempt.outcome === 'requires_verification')
                    return html(
                        reply,
                        'Confirm test payment',
                        `<h1>Confirm this test payment</h1><p>This simulates an extra verification step. Nothing is charged.</p><form method="post"><input type="hidden" name="confirmationToken" value="${escape(confirmation(resource, attempt))}"><button>Confirm test payment</button></form>`,
                    );
                return html(
                    reply,
                    'Test payment result',
                    `<h1>${attempt.outcome === 'succeeded' ? 'Test payment succeeded' : 'Test payment failed'}</h1>${attempt.outcome === 'succeeded' ? '' : `<p>${{ declined: 'The test card was declined.', insufficient_funds: 'The test balance is insufficient.', expired: 'The test card is expired.', requires_verification: 'The test payment needs verification.' }[attempt.outcome]}</p>`}<p>${escape(config.item!)} · ${config.currency} ${config.amount!.toFixed(2)} test units</p>${(attempt.outcome === 'succeeded' ? config.successUrl : config.cancelUrl) ? leaving((attempt.outcome === 'succeeded' ? config.successUrl : config.cancelUrl)!, 'Continue') : ''}<p><a href="/checkout/${resource.id}">Run another test</a></p>`,
                );
            },
        );
    });
}
