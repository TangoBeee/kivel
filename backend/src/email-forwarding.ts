import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EmailMessageRepository } from './email.js';
import type { IdentityRepository } from './identity.js';
import { effectivePlan } from './identity.js';
import type { ResourceRepository } from './resources.js';
import type { ForwardSend } from './forwarding.js';

export interface EmailForwardAttempt {
    at: string;
    status?: number;
    error?: string;
}

export interface EmailForwardState {
    url: string;
    ownerId: string;
    dueAt: number | null;
    lease?: string;
    attempts: EmailForwardAttempt[];
}

export function startEmailForwarding(
    app: FastifyInstance,
    messages: EmailMessageRepository,
    resources: ResourceRepository,
    identities: IdentityRepository,
    send: ForwardSend,
    masterKey = randomBytes(32).toString('hex'),
    retryDelays = [2000, 10000],
) {
    let stopped = false;
    let running: Promise<void> | undefined;
    const shutdown = new AbortController();
    const secret = (id: string) =>
        createHmac('sha256', masterKey).update(`email-forwarding:${id}`).digest('base64url');

    async function deliver() {
        const now = Date.now();
        const lease = randomUUID();
        const job = await messages.claimForward(now, lease);
        if (!job || stopped) return;
        const { resourceId, message, state } = job;
        const inbox = await resources.read(resourceId, 'email', '', state.ownerId);
        const owner = await identities.account(state.ownerId);
        const at = new Date().toISOString();
        let outcome: EmailForwardAttempt;
        let retry = false;
        if (
            !inbox ||
            inbox.ownerId !== state.ownerId ||
            !owner ||
            effectivePlan(owner) === 'free' ||
            inbox?.payload.forwardingUrl !== state.url
        ) {
            outcome = { at, error: 'Forwarding disabled or the destination changed.' };
        } else {
            const body = JSON.stringify({
                type: 'email.received',
                inboxId: resourceId,
                message: {
                    ...message,
                    read: undefined,
                    labels: undefined,
                },
            });
            const timestamp = String(Math.floor(Date.now() / 1000));
            try {
                const result = await send(
                    state.url,
                    AbortSignal.any([shutdown.signal, AbortSignal.timeout(5000)]),
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-kivel-email-id': message.id,
                            'x-kivel-timestamp': timestamp,
                            'x-kivel-signature':
                                'sha256=' +
                                createHmac('sha256', secret(resourceId))
                                    .update(`${timestamp}.${body}`)
                                    .digest('hex'),
                        },
                        requestBody: body,
                    },
                );
                outcome = { at, status: result.status };
                retry = result.status === 429 || result.status >= 500;
            } catch {
                if (stopped) return;
                outcome = { at, error: 'Webhook delivery failed.' };
                retry = true;
            }
        }
        const delay = retry ? retryDelays[state.attempts.length] : undefined;
        await messages.finishForward(resourceId, message.id, lease, {
            url: state.url,
            ownerId: state.ownerId,
            dueAt: delay === undefined ? null : Date.now() + delay,
            attempts: [...state.attempts, outcome],
        });
    }
    const kick = () => {
        if (stopped || running) return;
        running = deliver()
            .catch((error) => app.log.error({ err: error }, 'Email forwarding failed.'))
            .finally(() => {
                running = undefined;
            });
    };
    const timer = setInterval(kick, 500);
    timer.unref();
    app.addHook('onClose', async () => {
        stopped = true;
        clearInterval(timer);
        shutdown.abort();
        await running;
    });
    return { kick, secret };
}
