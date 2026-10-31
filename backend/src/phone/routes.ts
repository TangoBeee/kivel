import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../access.js';
import type { Access } from '../access.js';
import type { Waiters } from '../waiting.js';
import { waitSeconds } from '../waiting.js';
import { entitlement, PlanError } from '../entitlements.js';
import { isUuid } from '../security.js';
import { extractFromEmail } from '../email.js';
import type { PhoneProvider } from './provider.js';
import { PhonePurchaseRejected } from './provider.js';
import { newPhone } from './store.js';
import type { PhoneStore, PhoneNumber, PhoneSession } from './store.js';
export interface PhoneAllowance {
    count: number;
    validUntil: string | null;
}
export type PhoneEntitlements = (owner: string) => Promise<PhoneAllowance>;
export function registerPhones(
    app: FastifyInstance,
    access: Access,
    store: PhoneStore,
    waiters: Waiters,
    allowance: PhoneEntitlements,
    provider?: PhoneProvider,
    enabled = Boolean(provider),
) {
    let closed = false,
        running = false;
    let activeTick: Promise<void> | undefined;
    const pending = new Set<AbortController>();
    const active = (value: PhoneAllowance) =>
        value.count > 0 && value.validUntil && Date.parse(value.validUntil) > Date.now();
    async function reconcile(owner: string, session: PhoneSession, remote = true) {
        const allowed = await allowance(owner),
            all = (await session.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        let slots = active(allowed) ? allowed.count : 0;
        for (const phone of all) {
            if (['released', 'failed'].includes(phone.state)) continue;
            const entitled = slots > 0;
            if (entitled) slots--;
            if (!remote && ['ordering', 'pending', 'releasing'].includes(phone.state)) continue;
            try {
                if (phone.state === 'ordering') {
                    const order = await provider!.findOrder(phone.id);
                    if (order) {
                        if (order.number !== phone.number)
                            throw new HttpError(
                                502,
                                'Phone order does not match its reserved number.',
                            );
                        phone.orderId = order.id;
                        phone.state = order.status === 'failure' ? 'failed' : 'pending';
                        await session.save(phone);
                        if (phone.state === 'failed') continue;
                    } else {
                        if (Date.now() - Date.parse(phone.createdAt) >= 15 * 60000) {
                            phone.state = 'failed';
                            await session.save(phone);
                            app.log.warn(
                                { phoneId: phone.id },
                                'Phone order absent after 15 minutes; slot freed.',
                            );
                        }
                        continue;
                    }
                }
                if (phone.state === 'pending' && phone.orderId) {
                    const order = await provider!.order(phone.orderId);
                    if (order.number !== phone.number)
                        throw new HttpError(502, 'Phone order does not match its reserved number.');
                    if (order.status === 'failure') {
                        phone.state = 'failed';
                        await session.save(phone);
                        continue;
                    }
                    if (order.status !== 'success') continue;
                    phone.providerId = (await provider!.numberId(phone.number)) ?? null;
                    if (!phone.providerId) continue;
                    phone.state = 'active';
                    await session.save(phone);
                }
                if (phone.state === 'releasing') {
                    if (phone.providerId) await provider!.release(phone.providerId);
                    phone.state = 'released';
                    await session.save(phone);
                    continue;
                }
                if (entitled) {
                    phone.state = 'active';
                    phone.pausedAt = null;
                    await session.save(phone);
                    continue;
                }
                phone.state = 'paused';
                phone.pausedAt ??=
                    allowed.validUntil && Date.parse(allowed.validUntil) <= Date.now()
                        ? allowed.validUntil
                        : new Date().toISOString();
                if (Date.parse(phone.pausedAt) + 7 * 86400000 <= Date.now()) {
                    phone.state = 'releasing';
                    await session.save(phone);
                    if (remote) {
                        if (phone.providerId) await provider!.release(phone.providerId);
                        phone.state = 'released';
                    }
                }
                await session.save(phone);
            } catch (error) {
                app.log.error(
                    { phoneId: phone.id, err: error },
                    'Phone reconciliation failed; continuing with other numbers.',
                );
            }
        }
    }
    async function owned(request: FastifyRequest, id: string, write = false) {
        const identity = await access.require(
            request,
            write ? 'resources:write' : 'resources:read',
        );
        if (!isUuid(id)) throw new HttpError(400, 'Use a phone resource UUID.');
        return store.withOwner(identity.account.id, async (session) => {
            await reconcile(identity.account.id, session, false);
            const phone = (await session.list()).find((item) => item.id === id);
            if (!phone || ['released', 'failed'].includes(phone.state))
                throw new HttpError(404, 'Phone number unavailable or access denied.');
            return phone;
        });
    }
    app.get('/api/phone-numbers', async (request) => {
        const identity = await access.require(request, 'resources:read');
        return store.withOwner(identity.account.id, async (session) => {
            await reconcile(identity.account.id, session, false);
            return {
                enabled: Boolean(provider && enabled),
                numbers: (await session.list()).filter(
                    (item) => !['released', 'failed'].includes(item.state),
                ),
                allowance: await allowance(identity.account.id),
            };
        });
    });
    app.get<{ Querystring: { areaCode?: string } }>(
        '/api/phone-numbers/available',
        async (request) => {
            const actor = await access.scope(request, 'resources:write');
            entitlement(actor.identity, { minimumPlan: 'pro' }, access.origin);
            if (!provider || !enabled)
                throw new HttpError(
                    503,
                    'Phone purchasing is disabled until the operator configures Telnyx and the paid add-on.',
                );
            const plan = await allowance(actor.identity!.account.id);
            if (!active(plan)) {
                const error = new PlanError('pro', access.origin);
                error.message =
                    'An active phone add-on is required. Ask your human to configure it in billing; do not retry purchasing.';
                throw error;
            }
            return { numbers: await provider.available(request.query.areaCode) };
        },
    );
    app.post('/api/phone-numbers', async (request, reply) => {
        const actor = await access.scope(request, 'resources:write');
        entitlement(actor.identity, { minimumPlan: 'pro' }, access.origin);
        if (!provider || !enabled)
            throw new HttpError(
                503,
                'Phone purchasing is disabled until Telnyx and the paid add-on are configured.',
            );
        const body = request.body as { number?: unknown } | null,
            key = request.headers['idempotency-key'];
        if (
            typeof body?.number !== 'string' ||
            !/^\+1[2-9]\d{9}$/.test(body.number) ||
            typeof key !== 'string' ||
            !/^[A-Za-z0-9_-]{16,100}$/.test(key)
        )
            throw new HttpError(400, 'Provide a US E.164 number and a unique Idempotency-Key.');
        await access.rate(request, true);
        return store.withOwner(actor.identity!.account.id, async (session) => {
            const allowed = await allowance(actor.identity!.account.id);
            if (!active(allowed)) {
                const error = new PlanError('pro', access.origin);
                error.message =
                    'An active phone add-on is required. Ask your human to manage billing; do not retry without purchasing it.';
                throw error;
            }
            const all = await session.list(),
                existing = all.find((item) => item.key === key);
            if (existing) {
                if (existing.number !== body.number)
                    throw new HttpError(409, 'This purchase key belongs to a different number.');
                await reconcile(actor.identity!.account.id, session);
                return { number: (await session.list()).find((item) => item.id === existing.id) };
            }
            if (
                all.filter((item) => !['released', 'failed'].includes(item.state)).length >=
                allowed.count
            )
                throw new HttpError(
                    409,
                    'All paid number slots are occupied, including pending orders.',
                );
            if (await store.find(body.number! as string))
                throw new HttpError(
                    409,
                    'This number has already been allocated and cannot be reassigned here.',
                );
            const offers = await provider!.available((body.number as string).slice(2, 5));
            if (!offers.some((offer) => offer.number === body.number))
                throw new HttpError(
                    409,
                    'That number is no longer in the current US inventory. Search again.',
                );
            const phone = newPhone(actor.identity!.account.id, body.number as string, key);
            await session.save(phone);
            try {
                const order = await provider!.purchase(phone.number, phone.id);
                if (order.number !== phone.number) throw new Error('Order mismatch');
                phone.orderId = order.id;
                phone.state = order.status === 'failure' ? 'failed' : 'pending';
                await session.save(phone);
            } catch (error) {
                if (error instanceof PhonePurchaseRejected) {
                    phone.state = 'failed';
                    await session.save(phone);
                    throw error;
                }
                throw new HttpError(
                    502,
                    'Purchase outcome is uncertain. Reuse this key to inspect the existing order; never start another purchase until it is reconciled.',
                );
            }
            return reply.code(202).send({ number: phone });
        });
    });
    app.delete<{ Params: { id: string } }>('/api/phone-numbers/:id', async (request, reply) => {
        if (!provider)
            throw new HttpError(503, 'Restore phone provider credentials to release numbers.');
        const phone = await owned(request, request.params.id, true);
        return store.withOwner(phone.ownerId, async (session) => {
            const current = (await session.list()).find((item) => item.id === phone.id)!;
            if (!current.providerId)
                throw new HttpError(
                    409,
                    'The order must finish before release. Keep the purchase reference and contact support.',
                );
            current.state = 'releasing';
            await session.save(current);
            await provider!.release(current.providerId);
            current.state = 'released';
            await session.save(current);
            return reply.code(204).send();
        });
    });
    const read = async (request: FastifyRequest, id: string, requireActive = false) => {
        const phone = await owned(request, id);
        if (requireActive && phone.state !== 'active')
            throw new HttpError(
                409,
                'This phone number is pending or paused. Restore its add-on before receiving SMS.',
            );
        return store.withOwner(phone.ownerId, (session) => session.sms(phone.id));
    };
    app.get<{ Params: { id: string } }>('/api/phone-numbers/:id/sms', async (request) => ({
        messages: (await read(request, request.params.id)).map((message) => ({
            ...message,
            codes: extractFromEmail('SMS code', message.text).codes,
        })),
    }));
    app.get<{ Params: { id: string }; Querystring: { after?: string; timeoutSeconds?: string } }>(
        '/api/phone-numbers/:id/wait',
        async (request, reply) => {
            const actor = await access.scope(request, 'resources:read'),
                deadline = Date.now() + waitSeconds(request.query.timeoutSeconds) * 1000,
                controller = new AbortController(),
                abort = () => controller.abort();
            pending.add(controller);
            request.raw.once('aborted', abort);
            reply.raw.once('close', abort);
            try {
                return await waiters.run(actor.quotaKey, async () => {
                    for (;;) {
                        const list = await read(request, request.params.id, true),
                            index = request.query.after
                                ? list.findIndex((message) => message.id === request.query.after)
                                : -1;
                        if (request.query.after && index < 0)
                            throw new HttpError(
                                400,
                                'SMS cursor is unavailable. Inspect current messages before waiting again.',
                            );
                        const fresh = list.slice(index + 1);
                        if (fresh.length)
                            return {
                                timedOut: false,
                                messages: fresh.map((message) => ({
                                    ...message,
                                    codes: extractFromEmail('SMS code', message.text).codes,
                                })),
                            };
                        if (controller.signal.aborted || Date.now() + 500 > deadline)
                            return { timedOut: true, messages: [] };
                        await sleep(500, undefined, { signal: controller.signal }).catch(() => {});
                    }
                });
            } finally {
                pending.delete(controller);
                request.raw.removeListener('aborted', abort);
                reply.raw.removeListener('close', abort);
            }
        },
    );
    app.register(async (hooks) => {
        hooks.removeAllContentTypeParsers();
        hooks.addContentTypeParser(
            '*',
            { parseAs: 'buffer', bodyLimit: 65536 },
            (_request, body, done) => done(null, body),
        );
        hooks.post('/hooks/telnyx', async (request, reply) => {
            if (!provider || !enabled)
                throw new HttpError(503, 'Phone webhooks are not configured.');
            const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
            if (!provider.verify(request.headers, raw))
                throw new HttpError(401, 'Invalid phone webhook signature.');
            let sms;
            try {
                sms = provider.inbound(raw);
            } catch {
                throw new HttpError(400, 'Invalid phone webhook event.');
            }
            if (!sms) return reply.code(202).send({ ignored: true });
            const phone = await store.find(sms.to);
            if (phone)
                await store.withOwner(phone.ownerId, async (session) => {
                    await reconcile(phone.ownerId, session, false);
                    const current = (await session.list()).find((item) => item.id === phone.id);
                    if (current?.state === 'active') await session.record(phone.id, sms);
                });
            return reply.code(202).send({ received: true });
        });
    });
    const tick = async () => {
        if (running || closed || !provider) return;
        running = true;
        try {
            for (const owner of await store.owners()) {
                if (closed) break;
                await store
                    .withOwner(owner, (session) => reconcile(owner, session))
                    .catch(() =>
                        app.log.error(
                            'Phone lifecycle reconciliation failed; inspect provider orders.',
                        ),
                    );
            }
            await store.cleanup();
        } finally {
            running = false;
        }
    };
    const timer = setInterval(() => {
        activeTick = tick().catch(() => app.log.error('Phone lifecycle tick failed.'));
    }, 60000).unref();
    app.addHook('preClose', async () => {
        closed = true;
        clearInterval(timer);
        for (const controller of pending) controller.abort();
        await activeTick;
    });
    return { owned, read, tick };
}

declare module 'fastify' {
    interface FastifyInstance {
        runPhoneLifecycle(): Promise<void>;
    }
}
