import type { InboxDelivery, InboxRepository } from './inboxes.js';
import { publicRequest } from './public-network.js';

type Method = 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ForwardSend = (
    url: string,
    signal: AbortSignal,
    options: { method: Method; headers: Record<string, string>; requestBody?: string },
) => Promise<{ status: number }>;

export interface ForwardRequest {
    id: string;
    method: string;
    query: string;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
    utf8: boolean;
}

const methods: Method[] = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
// Hop-by-hop, proxy and credential headers belong to the trip to Kivel, not to the sender.
const dropped =
    /^(host|content-length|connection|keep-alive|transfer-encoding|upgrade|te|trailer|accept-encoding|cookie|authorization|proxy-.*|x-forwarded-.*|x-real-ip|cf-.*|cdn-loop|true-client-ip|x-access-token|x-resource-token|user-agent)$/i;

/** Relays captured webhooks to an inbox's forwarding URL, retrying server errors. */
export class Forwarder {
    private inflight = 0;

    constructor(
        private readonly inboxes: Pick<InboxRepository, 'recordDelivery'>,
        private readonly send: ForwardSend = (url, signal, options) =>
            publicRequest(url, signal, { ...options, body: false }),
        private readonly delays = [0, 2000, 10000],
        private readonly maxInflight = 16,
    ) {}

    deliver(inboxId: string, target: string, request: ForwardRequest): Promise<void> {
        const started = Date.now();
        const record = (outcome: Partial<InboxDelivery>, attempts: number) =>
            this.inboxes.recordDelivery(inboxId, {
                requestId: request.id,
                at: new Date().toISOString(),
                attempts,
                durationMs: Date.now() - started,
                ...outcome,
            });
        const method = request.method as Method;
        if (!methods.includes(method))
            return Promise.resolve(record({ error: `${request.method} cannot be forwarded.` }, 0));
        if (request.body.length && !request.utf8)
            return Promise.resolve(record({ error: 'Binary bodies are not forwarded.' }, 0));
        if (this.inflight >= this.maxInflight)
            return Promise.resolve(record({ error: 'Forwarding is busy; skipped.' }, 0));
        this.inflight++;
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(request.headers))
            if (value !== undefined && !dropped.test(name))
                headers[name] = Array.isArray(value) ? value.join(', ') : value;
        headers['x-kivel-request-id'] = request.id;
        const url = request.query
            ? `${target}${target.includes('?') ? '&' : '?'}${request.query}`
            : target;
        const body = request.body.length ? request.body.toString('utf8') : undefined;
        return (async () => {
            let last: Partial<InboxDelivery> = {};
            let attempts = 0;
            try {
                for (const delay of this.delays) {
                    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
                    attempts++;
                    try {
                        const response = await this.send(url, AbortSignal.timeout(10000), {
                            method,
                            headers,
                            ...(body !== undefined ? { requestBody: body } : {}),
                        });
                        last = { status: response.status };
                        // Client errors are the receiver's answer; only retry outages and throttling.
                        if (response.status < 500 && response.status !== 429) break;
                    } catch (error) {
                        last = {
                            error: error instanceof Error ? error.message : 'Delivery failed.',
                        };
                    }
                }
                await record(last, attempts);
            } finally {
                this.inflight--;
            }
        })();
    }
}
