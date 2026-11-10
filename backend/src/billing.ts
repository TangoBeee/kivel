import { randomBytes } from 'node:crypto';
import { paidPlans } from '@kivel.io/tools/billing-plans';
import type { RecoveryRepository } from './recovery-store.js';
import DodoPayments from 'dodopayments';
import type { Subscription } from 'dodopayments/resources/subscriptions';
import type { Pool, PoolClient } from 'pg';
import type { FastifyInstance } from 'fastify';
import { transaction } from './database.js';
import { Access, HttpError } from './access.js';
import type { AccountPlan } from '@kivel.io/tools/plans';
import { plans } from '@kivel.io/tools/plans';
export interface BillingConfig {
    apiKey: string;
    webhookSecret: string;
    proProduct: string;
    teamProduct: string;
    legacyProducts?: Readonly<Record<string, Exclude<AccountPlan, 'free'>>>;
    phoneAddonId?: string;
    phoneAddonEnabled?: boolean;
    environment: 'test_mode' | 'live_mode';
}
export interface SubscriptionState {
    id: string;
    customerId: string;
    accountId: string;
    plan: AccountPlan;
    validUntil: string | null;
    phoneNumbers?: number;
}
export function subscriptionState(
    subscription: Subscription,
    products: Pick<BillingConfig, 'proProduct' | 'teamProduct' | 'legacyProducts' | 'phoneAddonId'>,
    warn: (message: string) => void = console.warn,
): SubscriptionState {
    const plan =
        subscription.product_id === products.proProduct
            ? 'pro'
            : subscription.product_id === products.teamProduct
              ? 'team'
              : products.legacyProducts &&
                  Object.hasOwn(products.legacyProducts, subscription.product_id)
                ? products.legacyProducts[subscription.product_id]!
                : 'free';
    const end = Date.parse(subscription.next_billing_date);
    const active =
        subscription.status === 'active' &&
        subscription.quantity === 1 &&
        !subscription.on_demand &&
        subscription.trial_period_days === 0 &&
        subscription.recurring_pre_tax_amount > 0 &&
        Number.isFinite(end) &&
        end > Date.now();
    let phoneNumbers = 0;
    for (const addon of subscription.addons) {
        if (!products.phoneAddonId || addon.addon_id !== products.phoneAddonId) {
            warn(`Unrecognized subscription add-on: ${addon.addon_id}; base plan retained.`);
        } else if (!Number.isInteger(addon.quantity) || addon.quantity < 0) {
            warn(`Invalid phone add-on quantity on subscription ${subscription.subscription_id}.`);
        } else {
            phoneNumbers += addon.quantity;
        }
    }
    if (phoneNumbers > 10)
        warn(`Phone allowance capped at 10 on subscription ${subscription.subscription_id}.`);
    return {
        id: subscription.subscription_id,
        customerId: subscription.customer.customer_id,
        accountId:
            typeof subscription.metadata.accountId === 'string'
                ? subscription.metadata.accountId
                : '',
        plan: active ? plan : 'free',
        validUntil: active && plan !== 'free' ? new Date(end).toISOString() : null,
        phoneNumbers: active && plan !== 'free' ? Math.min(phoneNumbers, 10) : 0,
    };
}
/** 10% off, for the first 12 monthly payments, claimable for 30 days. */
const COOKIE_COUPON_BASIS_POINTS = 1000;
const COOKIE_COUPON_CYCLES = 12;
const COOKIE_COUPON_DAYS = 30;
/** An unpaid checkout link is handed out again for 30 minutes, then replaced with a fresh one. */
const CHECKOUT_REUSE_MS = 30 * 60 * 1000;

export class BillingRepository {
    constructor(private pool: Pool) {}
    async subscription(accountId: string) {
        const row = (
            await this.pool.query('SELECT dodo_subscription_id FROM accounts WHERE id=$1', [
                accountId,
            ])
        ).rows[0];
        return row?.dodo_subscription_id as string | null | undefined;
    }
    async phoneAllowance(accountId: string) {
        const row = (
            await this.pool.query(
                'SELECT plan,phone_allowance,plan_valid_until FROM accounts WHERE id=$1',
                [accountId],
            )
        ).rows[0];
        return {
            count: row && row.plan !== 'free' ? Number(row.phone_allowance) : 0,
            validUntil: row?.plan_valid_until ? new Date(row.plan_valid_until).toISOString() : null,
        };
    }
    async customer(accountId: string, create: () => Promise<string>) {
        return transaction(this.pool, async (client) => {
            const row = (
                await client.query(
                    'SELECT dodo_customer_id FROM accounts WHERE id = $1 FOR UPDATE',
                    [accountId],
                )
            ).rows[0];
            if (!row) throw new HttpError(404, 'Workspace not found.');
            if (row.dodo_customer_id) return row.dodo_customer_id as string;
            const id = await create();
            await client.query('UPDATE accounts SET dodo_customer_id = $1 WHERE id = $2', [
                id,
                accountId,
            ]);
            return id;
        });
    }
    async checkout(
        accountId: string,
        plan: string,
        status: (id: string) => Promise<string | null | undefined>,
        create: () => Promise<{ id: string; url: string }>,
    ) {
        return transaction(this.pool, async (client) => {
            const row = (
                await client.query(
                    'SELECT dodo_checkout_id, dodo_checkout_url, dodo_checkout_plan FROM accounts WHERE id = $1 FOR NO KEY UPDATE',
                    [accountId],
                )
            ).rows[0];
            if (!row) throw new HttpError(404, 'Workspace not found.');
            if (row.dodo_checkout_id) {
                const current = await status(row.dodo_checkout_id);
                if (!['failed', 'cancelled'].includes(current ?? '')) {
                    if (row.dodo_checkout_plan !== plan)
                        throw new HttpError(
                            409,
                            'A checkout for another plan is already open. Complete it before changing plans in the billing portal.',
                        );
                    return { url: row.dodo_checkout_url as string };
                }
            }
            const session = await create();
            await client.query(
                'UPDATE accounts SET dodo_checkout_id = $1, dodo_checkout_url = $2, dodo_checkout_plan = $3 WHERE id = $4',
                [session.id, session.url, plan, accountId],
            );
            return { url: session.url };
        });
    }
    /**
     * The cookie easter egg's coupon: one per person, only for a workspace that has never paid.
     * The Dodo discount is created while the person's row is locked, so double clicks get one code.
     */
    async cookieCoupon(
        userId: string,
        accountId: string,
        create: () => Promise<{ code: string; discountId: string; expiresAt: string }>,
    ) {
        return transaction(this.pool, async (client) => {
            await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
            const existing = (
                await client.query(
                    'SELECT code, expires_at FROM cookie_coupons WHERE user_id = $1',
                    [userId],
                )
            ).rows[0];
            if (existing)
                return {
                    code: existing.code as string,
                    expiresAt: (existing.expires_at as Date).toISOString(),
                    created: false,
                };
            const account = (
                await client.query(
                    'SELECT dodo_subscription_id, plan FROM accounts WHERE id = $1',
                    [accountId],
                )
            ).rows[0];
            if (!account) throw new HttpError(404, 'Workspace not found.');
            if (account.dodo_subscription_id || account.plan !== 'free')
                throw new HttpError(
                    409,
                    'The cookie coupon is for workspaces that have not subscribed yet.',
                );
            const coupon = await create();
            await client.query(
                'INSERT INTO cookie_coupons (user_id, account_id, code, discount_id, expires_at) VALUES ($1, $2, $3, $4, $5)',
                [userId, accountId, coupon.code, coupon.discountId, coupon.expiresAt],
            );
            return { code: coupon.code, expiresAt: coupon.expiresAt, created: true };
        });
    }
    /** An unexpired cookie coupon claimed for this workspace, to apply at its first checkout. */
    async couponFor(accountId: string) {
        const row = (
            await this.pool.query(
                'SELECT code FROM cookie_coupons WHERE account_id = $1 AND expires_at > clock_timestamp() ORDER BY created_at LIMIT 1',
                [accountId],
            )
        ).rows[0];
        return row?.code as string | undefined;
    }
    async process(
        eventId: string,
        created: number,
        customerId: string,
        load: () => Promise<SubscriptionState>,
    ) {
        return transaction(this.pool, async (client) => {
            const account = (
                await client.query(
                    'SELECT id, dodo_subscription_id FROM accounts WHERE dodo_customer_id = $1 FOR NO KEY UPDATE',
                    [customerId],
                )
            ).rows[0];
            if (
                !account ||
                (await client.query('SELECT id FROM dodo_events WHERE id = $1', [eventId])).rowCount
            )
                return false;
            const state = await load();
            if (state.accountId !== account.id || state.customerId !== customerId)
                throw new HttpError(400, 'Subscription does not belong to this workspace.');
            // A second subscription must not replace an existing active subscription.
            if (account.dodo_subscription_id && account.dodo_subscription_id !== state.id) {
                await client.query(
                    'INSERT INTO dodo_events (id, created) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [eventId, created],
                );
                return false;
            }
            await client.query(
                'UPDATE accounts SET plan = $1, plan_valid_until = $2, dodo_subscription_id = $3, dodo_event_created = $4, phone_allowance = $6 WHERE id = $5',
                [
                    state.plan,
                    state.validUntil,
                    state.plan === 'free' ? null : state.id,
                    created,
                    account.id,
                    state.phoneNumbers ?? 0,
                ],
            );
            if (state.validUntil)
                await this.extend(
                    client,
                    account.id,
                    new Date(Date.parse(state.validUntil) + 86400000).toISOString(),
                    state.plan,
                );
            await client.query(
                'INSERT INTO dodo_events (id, created) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [eventId, created],
            );
            return true;
        });
    }
    private async extend(
        client: PoolClient,
        accountId: string,
        expiresAt: string,
        plan: AccountPlan,
    ) {
        // Preserve an existing Free address at the moment payment activates the plan.
        const selected = await client.query(
            `WITH chosen AS (
                SELECT a.resource_id FROM email_addresses a JOIN temporary_resources r ON r.id=a.resource_id
                WHERE a.owner_id=$1 AND a.retired_at IS NULL AND r.expires_at > clock_timestamp()
                AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp())
                ORDER BY a.created_at DESC,a.id DESC LIMIT $2
            ) UPDATE email_addresses SET tier='paid',expires_at=NULL,paused_at=NULL
            WHERE resource_id IN (SELECT resource_id FROM chosen) RETURNING resource_id`,
            [accountId, plans[plan].emailInboxes],
        );
        if (selected.rowCount)
            await client.query(
                "UPDATE temporary_resources SET expires_at='9999-12-31T00:00:00Z',persistent=true WHERE id=ANY($1::uuid[])",
                [selected.rows.map((row) => row.resource_id)],
            );
        for (const table of ['inboxes', 'temporary_resources'])
            await client.query(
                `UPDATE ${table} SET expires_at = GREATEST(expires_at, $1) WHERE owner_id = $2 AND persistent AND expires_at > clock_timestamp()${table === 'temporary_resources' ? " AND kind <> 'email'" : ''}`,
                [expiresAt, accountId],
            );
    }
}
export function registerBilling(
    app: FastifyInstance,
    access: Access,
    repository?: BillingRepository,
    config?: BillingConfig,
    providedDodo?: DodoPayments,
    recovery?: RecoveryRepository,
) {
    const enabled = !!repository && !!config;
    const dodo = config
        ? (providedDodo ??
          new DodoPayments({
              bearerToken: config.apiKey,
              webhookKey: config.webhookSecret,
              environment: config.environment,
              maxRetries: 0,
              timeout: 10000,
          }))
        : undefined;
    let cached: { at: number; prices: unknown[] } | undefined;
    async function prices() {
        if (!enabled || !dodo || !config) return [];
        if (cached && Date.now() - cached.at < 60000) return cached.prices;
        const products = await Promise.all([
            dodo.products.retrieve(config.proProduct),
            dodo.products.retrieve(config.teamProduct),
        ]);
        const values = products.map((product, index) => {
            const price = product.price;
            const published = index ? paidPlans.team : paidPlans.pro;
            if (
                !product.is_recurring ||
                price.type !== 'recurring_price' ||
                !Number.isSafeInteger(price.price) ||
                price.price <= 0 ||
                (price.trial_period_days ?? 0) !== 0 ||
                (price.discount_bps ?? price.discount ?? 0) !== 0 ||
                price.purchasing_power_parity ||
                price.payment_frequency_count !== published.intervalCount ||
                price.payment_frequency_interval !== published.interval ||
                price.price !== published.amount ||
                price.currency !== published.currency ||
                product.addons?.length ||
                price.subscription_period_interval !== 'Year' ||
                price.subscription_period_count !== 20
            )
                throw new HttpError(
                    503,
                    'Configure the published USD monthly plan prices with a 20-year duration, without trials, discounts, add-ons or usage meters.',
                );
            return {
                plan: index ? 'team' : 'pro',
                amount: price.price,
                currency: price.currency.toLowerCase(),
                interval: price.payment_frequency_interval.toLowerCase(),
                intervalCount: price.payment_frequency_count,
            };
        });
        if (values[0]!.currency !== values[1]!.currency)
            throw new HttpError(503, 'Plan products must use the same currency.');
        cached = { at: Date.now(), prices: values };
        return values;
    }
    app.get('/api/billing', async () => ({ provider: 'dodo', enabled, prices: await prices() }));
    app.post('/api/billing/checkout', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner')
            throw new HttpError(403, 'Only the workspace owner can manage billing.');
        if (!enabled || !dodo || !config || !repository)
            throw new HttpError(503, 'Paid subscriptions are not configured yet.');
        const email = recovery ? await recovery.status(identity.userId) : undefined;
        if (!email?.verifiedAt)
            throw new HttpError(
                409,
                'Verify your recovery email in Account security before subscribing.',
            );
        const plan = (request.body as { plan?: unknown } | null)?.plan;
        if (plan !== 'pro' && plan !== 'team') throw new HttpError(400, 'Choose Pro or Team.');
        await prices();
        const customer = await repository.customer(
            identity.account.id,
            async () =>
                (
                    await dodo.customers.create({
                        name: identity.account.name,
                        email: email.email!,
                        metadata: { accountId: identity.account.id },
                    })
                ).customer_id,
        );
        async function subscriptions() {
            const signal = AbortSignal.timeout(10000);
            let total = 0;
            for (let page = 1; page <= 5; page++) {
                const existing = await dodo!.subscriptions.list(
                    { customer_id: customer, page_size: 100, page_number: page },
                    { signal },
                );
                if (
                    existing.items.some(
                        (value) => !['cancelled', 'failed', 'expired'].includes(value.status),
                    )
                )
                    throw new HttpError(
                        409,
                        'A subscription already exists. Manage it in the billing portal.',
                    );
                if (!existing.items.length) return total;
                total += existing.items.length;
            }
            throw new HttpError(
                409,
                'Subscription history needs review before another checkout can be opened.',
            );
        }
        return repository.checkout(
            identity.account.id,
            plan,
            async (id) => {
                const historical = await subscriptions();
                const session = await dodo.checkoutSessions.retrieve(id);
                const status = session.payment_status;
                // Dodo expires checkout links that were never paid, so an old unpaid one is replaced.
                if (!status && Date.now() - Date.parse(session.created_at) > CHECKOUT_REUSE_MS)
                    return 'cancelled';
                return status === 'succeeded' && historical ? 'cancelled' : status;
            },
            async () => {
                const historical = await subscriptions();
                // A cookie coupon only ever applies to a workspace's very first subscription.
                const coupon = historical
                    ? undefined
                    : await repository.couponFor(identity.account.id);
                const session = await dodo.checkoutSessions.create({
                    ...(coupon ? { discount_codes: [coupon] } : {}),
                    product_cart: [
                        {
                            product_id: plan === 'pro' ? config.proProduct : config.teamProduct,
                            quantity: 1,
                        },
                    ],
                    customer: { customer_id: customer },
                    metadata: { accountId: identity.account.id },
                    subscription_data: { trial_period_days: 0 },
                    feature_flags: {
                        allow_discount_code: true,
                        allow_editing_addons: false,
                        always_create_new_customer: false,
                        allow_customer_editing_email: false,
                    },
                    return_url: access.appUrl(
                        '/usage/?billing=returned',
                        '/account/?billing=returned',
                    ),
                    cancel_url: access.appUrl(
                        '/usage/?billing=cancelled',
                        '/account/?billing=cancelled',
                    ),
                });
                if (!session.checkout_url)
                    throw new HttpError(503, 'Checkout did not return a payment link.');
                return { id: session.session_id, url: session.checkout_url };
            },
        );
    });
    // Twenty cookies on the homepage earn 10% off. The clicks are counted in the browser, so every
    // rule that matters is enforced here: signed in, workspace owner, never subscribed, once each.
    app.post('/api/coupons/cookie', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner')
            throw new HttpError(403, 'Ask your workspace owner to claim the cookie coupon.');
        if (!enabled || !dodo || !config || !repository)
            throw new HttpError(503, 'The cookie coupon opens when paid plans do.');
        const expiresAt = new Date(Date.now() + COOKIE_COUPON_DAYS * 86400000).toISOString();
        const coupon = await repository.cookieCoupon(
            identity.userId,
            identity.account.id,
            async () => {
                const code = `COOKIE${randomBytes(4).toString('hex').toUpperCase()}`;
                const discount = await dodo.discounts.create({
                    code,
                    name: 'Cookie coupon',
                    type: 'percentage',
                    amount: COOKIE_COUPON_BASIS_POINTS,
                    usage_limit: 1,
                    per_customer_usage_limit: 1,
                    customer_eligibility: 'first_time',
                    restricted_to: [config.proProduct, config.teamProduct],
                    subscription_cycles: COOKIE_COUPON_CYCLES,
                    expires_at: expiresAt,
                    metadata: { accountId: identity.account.id, userId: identity.userId },
                });
                return { code: discount.code ?? code, discountId: discount.discount_id, expiresAt };
            },
        );
        return {
            ...coupon,
            percent: COOKIE_COUPON_BASIS_POINTS / 100,
            months: COOKIE_COUPON_CYCLES,
        };
    });
    app.post('/api/billing/phone-addon', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner')
            throw new HttpError(403, 'Only the workspace owner can change paid add-ons.');
        if (!enabled || !dodo || !config.phoneAddonEnabled || !config.phoneAddonId)
            throw new HttpError(503, 'Phone add-on sales are not enabled.');
        const input = request.body as { quantity?: unknown; confirm?: unknown } | null;
        if (
            !input ||
            !Number.isInteger(input.quantity) ||
            Number(input.quantity) < 0 ||
            Number(input.quantity) > 10 ||
            input.confirm !== true
        )
            throw new HttpError(400, 'Confirm a phone add-on quantity between 0 and 10.');
        const retryKey = request.headers['idempotency-key'];
        if (typeof retryKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(retryKey))
            throw new HttpError(
                400,
                'Provide a unique Idempotency-Key and retain it for this billing change.',
            );
        const id = await repository.subscription(identity.account.id);
        if (!id) throw new HttpError(409, 'Subscribe to Pro or Team before adding phone numbers.');
        const subscription = await dodo.subscriptions.retrieve(id);
        const state = subscriptionState(subscription, config, (message) => app.log.warn(message));
        if (state.accountId !== identity.account.id || state.plan === 'free')
            throw new HttpError(409, 'An active workspace subscription is required.');
        return dodo.subscriptions.changePlan(
            id,
            {
                product_id: subscription.product_id,
                quantity: 1,
                addons: [
                    ...subscription.addons
                        .filter((addon) => addon.addon_id !== config.phoneAddonId)
                        .map((addon) => ({ addon_id: addon.addon_id, quantity: addon.quantity })),
                    ...(Number(input.quantity)
                        ? [{ addon_id: config.phoneAddonId, quantity: Number(input.quantity) }]
                        : []),
                ],
                proration_billing_mode: 'prorated_immediately',
                effective_at: 'immediately',
                on_payment_failure: 'prevent_change',
                collect_via_payment_link: true,
                return_url: access.appUrl('/phone/'),
            },
            { idempotencyKey: `${identity.account.id}-${retryKey}` },
        );
    });
    app.post('/api/billing/portal', async (request) => {
        const identity = await access.require(request, 'account:read', true);
        if (identity.role !== 'owner')
            throw new HttpError(403, 'Only the workspace owner can manage billing.');
        if (!enabled || !dodo || !identity.account.customerId)
            throw new HttpError(503, 'Billing portal is not available.');
        return {
            url: (
                await dodo.customers.customerPortal.create(identity.account.customerId, {
                    send_email: false,
                    return_url: access.appUrl('/usage/', '/account/'),
                })
            ).link,
        };
    });
    app.register(async (webhooks) => {
        webhooks.removeAllContentTypeParsers();
        webhooks.addContentTypeParser(
            'application/json',
            { parseAs: 'buffer' },
            (_request, body, done) => done(null, body),
        );
        webhooks.post('/billing/webhook', async (request, reply) => {
            if (!enabled || !dodo || !config || !repository)
                throw new HttpError(503, 'Billing is not configured.');
            if (!Buffer.isBuffer(request.body))
                throw new HttpError(400, 'Invalid webhook signature.');
            const headers: Record<string, string> = {};
            for (const key of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
                const value = request.headers[key];
                if (typeof value !== 'string' || !value || value.length > 1024)
                    throw new HttpError(400, 'Invalid webhook signature.');
                headers[key] = value;
            }
            let event;
            try {
                event = dodo.webhooks.unwrap(request.body.toString('utf8'), {
                    headers,
                    key: config.webhookSecret,
                });
            } catch {
                throw new HttpError(400, 'Invalid webhook signature.');
            }
            if (
                !event ||
                typeof event.type !== 'string' ||
                !event.data ||
                typeof event.data !== 'object'
            )
                throw new HttpError(400, 'Invalid webhook event.');
            if (event.type.startsWith('subscription.')) {
                const data = event.data;
                if (
                    !('subscription_id' in data) ||
                    typeof data.subscription_id !== 'string' ||
                    !('customer' in data) ||
                    typeof data.customer?.customer_id !== 'string'
                )
                    throw new HttpError(400, 'Invalid subscription event.');
                const subscriptionId = data.subscription_id;
                await repository.process(
                    headers['webhook-id']!,
                    Number(headers['webhook-timestamp']),
                    data.customer.customer_id,
                    async () => {
                        const current = await dodo.subscriptions.retrieve(subscriptionId);
                        const state = subscriptionState(current, config, (message) =>
                            app.log.warn(message),
                        );
                        if (!state.accountId) {
                            const customer = await dodo.customers.retrieve(
                                current.customer.customer_id,
                            );
                            state.accountId =
                                typeof customer.metadata?.accountId === 'string'
                                    ? customer.metadata.accountId
                                    : '';
                        }
                        return state;
                    },
                );
            }
            return reply.send({ received: true });
        });
    });
}
