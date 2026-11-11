import { Buffer } from 'node:buffer';
import { setTimeout as pause } from 'node:timers/promises';
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
    let delay = 200;
    async function backoff(seconds = 0) {
        await pause(Math.max(delay, seconds * 1000), undefined, { signal }).catch(() => {});
        delay = Math.min(delay * 2, 10000);
    }
    async function retry(error: unknown) {
        if (signal?.aborted) return;
        if (error instanceof KivelError && error.status === 429) {
            await backoff(error.retryAfter ?? 2);
        } else if (
            error instanceof TypeError ||
            (error instanceof DOMException &&
                ['AbortError', 'NetworkError', 'TimeoutError'].includes(error.name))
        ) {
            await backoff();
        } else {
            throw error;
        }
    }
    while (!options.all && !signal?.aborted) {
        try {
            after = (await client.inspectInbox(inboxId, options.token)).requests.at(-1)?.id;
            delay = 200;
            break;
        } catch (error) {
            await retry(error);
        }
    }
    if (signal?.aborted) return;
    write({ event: 'listening', inboxId, forward: options.forward ?? null });

    async function report(requests: CapturedRequest[]) {
        for (const request of requests) {
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

    let cursor: string | undefined;
    while (!signal?.aborted) {
        try {
            for await (const change of client.stream([`webhook:${inboxId}`], {
                ...(options.token ? { token: options.token } : {}),
                ...(cursor ? { lastEventId: cursor } : {}),
                ...(signal ? { signal } : {}),
            })) {
                const { requests } = await client.waitForRequests(inboxId, {
                    ...(options.token ? { token: options.token } : {}),
                    ...(after ? { after } : {}),
                    timeoutSeconds: 1,
                });
                await report(requests);
                cursor = change.cursor;
                delay = 200;
            }
            await backoff();
        } catch (error) {
            if (signal?.aborted) return;
            if (error instanceof KivelError && [404, 501, 503].includes(error.status)) break;
            await retry(error);
        }
    }

    while (!signal?.aborted) {
        try {
            const batch = await client.waitForRequests(inboxId, {
                ...(options.token ? { token: options.token } : {}),
                ...(after ? { after } : {}),
            });
            await report(batch.requests);
            delay = 200;
        } catch (error) {
            if (signal?.aborted) return;
            await retry(error);
        }
    }
}
