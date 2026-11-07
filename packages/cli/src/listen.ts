import { Buffer } from 'node:buffer';
import { KivelError } from '@kivel.io/sdk';
import type { CapturedRequest, Kivel } from '@kivel.io/sdk';

export interface ListenOptions {
    token?: string;
    forward?: string;
    all?: boolean;
}

// Hop-by-hop and proxy headers describe the trip to Kivel, not the original sender.
const dropped =
    /^(host|content-length|connection|keep-alive|transfer-encoding|upgrade|te|trailer|proxy-.*|x-forwarded-.*|x-real-ip|cf-.*|cdn-loop|true-client-ip|x-access-token|authorization)$/i;

export function forwardTarget(base: string, inboxId: string, request: CapturedRequest) {
    const url = new URL(base);
    const suffix = request.path.replace(new RegExp(`^/hooks/${inboxId}`), '');
    url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}` || '/';
    for (const [key, value] of Object.entries(request.query))
        for (const item of Array.isArray(value) ? value : [value])
            url.searchParams.append(key, item);
    return url;
}

export function forwardHeaders(request: CapturedRequest) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers))
        if (!dropped.test(key))
            for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
    return headers;
}

/** Streams new requests as JSON lines and optionally replays each one to a local server. */
export async function listen(
    client: Kivel,
    inboxId: string,
    options: ListenOptions,
    write: (line: object) => void,
    signal?: AbortSignal,
) {
    if (options.forward) new URL(options.forward);
    let after: string | undefined;
    if (!options.all) {
        const existing = (await client.inspectInbox(inboxId, options.token)) as {
            requests: CapturedRequest[];
        };
        after = existing.requests.at(-1)?.id;
    }
    write({ event: 'listening', inboxId, forward: options.forward ?? null });
    while (!signal?.aborted) {
        let batch;
        try {
            batch = await client.waitForRequests(inboxId, {
                ...(options.token ? { token: options.token } : {}),
                ...(after ? { after } : {}),
            });
        } catch (error) {
            if (error instanceof KivelError && error.status === 429) {
                await new Promise((resolve) => setTimeout(resolve, (error.retryAfter ?? 2) * 1000));
                continue;
            }
            throw error;
        }
        for (const request of batch.requests) {
            after = request.id;
            write({ event: 'request', request });
            if (!options.forward) continue;
            const started = Date.now();
            try {
                const body =
                    request.method === 'GET' || request.method === 'HEAD'
                        ? undefined
                        : Buffer.from(request.body, request.bodyEncoding);
                const response = await fetch(forwardTarget(options.forward, inboxId, request), {
                    method: request.method,
                    headers: forwardHeaders(request),
                    ...(body ? { body } : {}),
                    redirect: 'manual',
                    signal: AbortSignal.timeout(10000),
                });
                await response.arrayBuffer();
                write({
                    event: 'forwarded',
                    requestId: request.id,
                    status: response.status,
                    durationMs: Date.now() - started,
                });
            } catch (error) {
                write({
                    event: 'forward-failed',
                    requestId: request.id,
                    error: error instanceof Error ? error.message : 'Forwarding failed.',
                });
            }
        }
    }
}
