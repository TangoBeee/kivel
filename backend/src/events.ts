import { setTimeout as pause } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from './access.js';
import type { Access } from './access.js';
import type { InboxRepository } from './inboxes.js';
import type { EmailMessageRepository } from './email.js';
import type { registerEmail } from './email.js';
import type { ApprovalRepository } from './approvals.js';
import { isUuid } from './security.js';
import { waitSeconds } from './waiting.js';
import type { Waiters } from './waiting.js';

interface Source {
    kind: 'webhook' | 'email' | 'approval' | 'job' | 'sms';
    id: string;
    token?: string;
    after?: string;
}
interface Context {
    app: FastifyInstance;
    access: Access;
    inboxes: InboxRepository;
    emails: EmailMessageRepository;
    email: ReturnType<typeof registerEmail>;
    approvals: ApprovalRepository;
    waiters: Waiters;
    phones: ReturnType<typeof import('./phone/routes.js').registerPhones>;
    jobs: ReturnType<typeof import('./scheduled-jobs.js').registerScheduledJobs>;
}
function sources(input: unknown): Source[] {
    if (!Array.isArray(input) || !input.length || input.length > 10)
        throw new HttpError(
            400,
            'Provide 1–10 sources: kind (webhook, email, approval or job), id, and optional token/after.',
        );
    const unique = new Set<string>();
    return input.map((value) => {
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            !['webhook', 'email', 'approval', 'job', 'sms'].includes(value.kind) ||
            typeof value.id !== 'string' ||
            !isUuid(value.id) ||
            (value.token !== undefined &&
                (typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token))) ||
            (value.after !== undefined &&
                (typeof value.after !== 'string' ||
                    value.after.length > 100 ||
                    (value.kind !== 'sms' && !isUuid(value.after))))
        )
            throw new HttpError(
                400,
                'Invalid event source. SMS becomes available after the phone provider is configured.',
            );
        const key = `${value.kind}:${value.id}`;
        if (unique.has(key)) throw new HttpError(400, 'Each event source must be listed once.');
        unique.add(key);
        return value as Source;
    });
}
function newer<T extends { id: string }>(
    items: T[],
    after?: string,
    filter: (item: T) => boolean = () => true,
) {
    const index = after ? items.findIndex((item) => item.id === after) : -1;
    if (after && index === -1)
        throw new HttpError(
            400,
            'The event cursor is not in this resource. Inspect it and use its last message/request ID.',
        );
    return items
        .slice(index + 1)
        .filter(filter)
        .slice(0, 10);
}
export function registerEvents({
    app,
    access,
    inboxes,
    emails,
    email,
    approvals,
    waiters,
    jobs,
    phones,
}: Context) {
    const pending = new Set<AbortController>();
    app.addHook('preClose', async () => {
        for (const controller of pending) controller.abort();
    });
    app.post('/api/events/wait', async (request, reply) => {
        const actor = await access.scope(request, 'resources:read');
        const body = request.body as { sources?: unknown; timeoutSeconds?: unknown } | null;
        const inputs = sources(body?.sources);
        const deadline = Date.now() + waitSeconds(body?.timeoutSeconds) * 1000;
        const controller = new AbortController(),
            abort = () => controller.abort();
        pending.add(controller);
        request.raw.once('aborted', abort);
        reply.raw.once('close', abort);
        async function poll() {
            const ready: Record<string, unknown>[] = [];
            for (const source of inputs) {
                if (source.kind === 'webhook') {
                    const list = await inboxes.listRequests(
                        source.id,
                        source.token ?? '',
                        actor.identity?.account.id,
                    );
                    if (!list)
                        throw new HttpError(404, 'Webhook inbox unavailable or access denied.');
                    const requests = newer(list, source.after);
                    if (requests.length)
                        ready.push({
                            kind: source.kind,
                            id: source.id,
                            cursor: requests.at(-1)!.id,
                            requests,
                        });
                } else if (source.kind === 'email') {
                    const resource = await email.owned(request, source.id, source.token ?? '');
                    if (resource.row?.pausedAt)
                        throw new HttpError(
                            409,
                            'An email source is paused. Restore the subscription before waiting.',
                        );
                    const messages = newer(
                        await emails.list(source.id),
                        source.after,
                        (message) => message.direction !== 'outbound',
                    );
                    if (messages.length)
                        ready.push({
                            kind: source.kind,
                            id: source.id,
                            cursor: messages.at(-1)!.id,
                            messages,
                        });
                } else if (source.kind === 'sms') {
                    const messages = newer(
                        await phones.read(request, source.id, true),
                        source.after,
                    );
                    if (messages.length)
                        ready.push({
                            kind: 'sms',
                            id: source.id,
                            cursor: messages.at(-1)!.id,
                            messages,
                        });
                } else if (source.kind === 'job') {
                    const job = await jobs.owned(request, source.id);
                    const deliveries = newer(job.events, source.after);
                    if (deliveries.length)
                        ready.push({
                            kind: 'job',
                            id: job.id,
                            cursor: deliveries.at(-1)!.id,
                            deliveries,
                        });
                } else {
                    if (!actor.identity)
                        throw new HttpError(401, 'Human approval events require a workspace key.');
                    const approval = await approvals.get(actor.identity.account.id, source.id);
                    if (!approval)
                        throw new HttpError(404, 'Approval unavailable or access denied.');
                    if (approval.status !== 'pending' && source.after !== approval.id) {
                        const {
                            accountId: _account,
                            keyId: _key,
                            answeredBy: _user,
                            ...answer
                        } = approval;
                        ready.push({
                            kind: source.kind,
                            id: source.id,
                            cursor: approval.id,
                            approval: answer,
                        });
                    }
                }
            }
            return ready;
        }
        try {
            return await waiters.run(actor.quotaKey, async () => {
                for (;;) {
                    const events = await poll();
                    if (events.length) return { timedOut: false, events };
                    if (controller.signal.aborted || Date.now() + 500 > deadline)
                        return { timedOut: true, events: [] };
                    try {
                        await pause(500, undefined, { signal: controller.signal });
                    } catch {
                        return { timedOut: true, events: [] };
                    }
                }
            });
        } finally {
            pending.delete(controller);
            request.raw.removeListener('aborted', abort);
            reply.raw.removeListener('close', abort);
        }
    });
}
