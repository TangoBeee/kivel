import type { InboxDelivery, InboxRepository } from './inboxes.js';
import { publicRequest } from './public-network.js';
import { METHODS } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type ForwardSend = (
    url: string,
    signal: AbortSignal,
    options: {
        method: string;
        headers: Record<string, string>;
        requestBody?: string;
        requestBytes?: Uint8Array;
    },
) => Promise<{ status: number }>;

export interface ForwardRequest {
    id: string;
    method: string;
    query: string;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
    utf8: boolean;
}

const methods = new Set(METHODS.filter((method) => method !== 'CONNECT'));
// Hop-by-hop, proxy and credential headers belong to the trip to Kivel, not to the sender.
const dropped =
    /^(host|content-length|connection|keep-alive|transfer-encoding|upgrade|te|trailer|accept-encoding|proxy-.*|x-forwarded-.*|x-real-ip|cf-.*|cdn-loop|true-client-ip|user-agent)$|authorization|cookie|token|api[-_]?key|secret|password/i;

/** Relays captured webhooks to an inbox's forwarding URL, retrying server errors. */
export class Forwarder {
    private inflight = 0;

    constructor(
        private readonly inboxes: Pick<InboxRepository, 'recordDelivery'>,
        private readonly send: ForwardSend = (url, signal, options) =>
            publicRequest(url, signal, { ...options, body: false }),
        private readonly delays = [0, 2000, 10000],
        private readonly maxInflight = 16,
        private readonly relaySecret: string = randomUUID(),
    ) {}

    relayed(headers: ForwardRequest['headers'], body: Buffer): boolean {
        const marker = headers['x-kivel-relay'];
        const id = headers['x-kivel-request-id'];
        if (
            typeof marker !== 'string' ||
            typeof id !== 'string' ||
            !/^\d{10}\.[0-9a-f]{64}$/.test(marker)
        )
            return false;
        const [seconds, signature] = marker.split('.') as [string, string];
        return (
            Math.abs(Date.now() - Number(seconds) * 1000) <= 300_000 &&
            timingSafeEqual(Buffer.from(signature, 'hex'), this.signRelay(seconds, id, body))
        );
    }

    private signRelay(seconds: string, id: string, body: Buffer) {
        return createHmac('sha256', this.relaySecret)
            .update(`webhook-relay:${seconds}:${id}:`)
            .update(body)
            .digest();
    }

    deliver(
        inboxId: string,
        target: string,
        request: ForwardRequest,
        replay?: InboxDelivery,
    ): Promise<void> {
        const started = Date.now();
        const responses: { status?: number; error?: string }[] = [];
        const record = (outcome: Partial<InboxDelivery>, attempts: number) =>
            this.inboxes.recordDelivery(inboxId, {
                requestId: request.id,
                at: replay?.at ?? new Date().toISOString(),
                attempts,
                durationMs: Date.now() - started,
                ...(replay?.replayId ? { replayId: replay.replayId } : {}),
                ...(responses.length ? { responses } : {}),
                ...outcome,
            });
        const method = request.method;
        if (!methods.has(method))
            return Promise.resolve(record({ error: `${request.method} cannot be forwarded.` }, 0));
        if (this.inflight >= this.maxInflight)
            return Promise.resolve(record({ error: 'Forwarding is busy; skipped.' }, 0));
        this.inflight++;
        const headers: Record<string, string> = {};
        const connection =
            request.headers.connection?.toString().toLowerCase().split(/ *, */) ?? [];
        for (const [name, value] of Object.entries(request.headers))
            if (
                value !== undefined &&
                value !== '[REDACTED]' &&
                !dropped.test(name) &&
                !connection.includes(name.toLowerCase())
            )
                headers[name] = Array.isArray(value) ? value.join(', ') : value;
        headers['x-kivel-request-id'] = request.id;
        if (replay?.replayId) headers['x-kivel-replay-id'] = replay.replayId;
        const seconds = String(Math.floor(Date.now() / 1000));
        headers['x-kivel-relay'] =
            `${seconds}.${this.signRelay(seconds, request.id, request.body).toString('hex')}`;
        if (request.body.length) headers['content-length'] = String(request.body.length);
        const url = request.query
            ? `${target}${target.includes('?') ? '&' : '?'}${request.query}`
            : target;
        const body = !request.body.length
            ? {}
            : request.utf8
              ? { requestBody: request.body.toString('utf8') }
              : { requestBytes: request.body };
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
                            ...body,
                        });
                        last = { status: response.status };
                        responses.push(last);
                        // Client errors are the receiver's answer; only retry outages and throttling.
                        if (response.status < 500 && response.status !== 429) break;
                    } catch (error) {
                        last = {
                            error: error instanceof Error ? error.message : 'Delivery failed.',
                        };
                        responses.push(last);
                    }
                }
                await record(last, attempts);
            } finally {
                this.inflight--;
            }
        })();
    }
}
