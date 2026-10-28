import { HttpError } from './access.js';
import type { CapturedRequest, InboxRepository } from './inboxes.js';

export const WAIT_DEFAULT_SECONDS = 25;
// The proxy gives upstream responses 35 seconds, so a wait must answer before that.
export const WAIT_MAX_SECONDS = 30;

/** Caps long-poll waits so they cannot pile up per caller or across the server. */
export class Waiters {
    private total = 0;
    private readonly perKey = new Map<string, number>();

    constructor(
        private readonly maxTotal = 200,
        private readonly maxPerKey = 5,
    ) {}

    async run<T>(key: string, work: () => Promise<T>): Promise<T> {
        const used = this.perKey.get(key) ?? 0;
        if (this.total >= this.maxTotal || used >= this.maxPerKey)
            throw new HttpError(429, 'Too many waits in progress. Try again shortly.', 2);
        this.total++;
        this.perKey.set(key, used + 1);
        try {
            return await work();
        } finally {
            this.total--;
            const left = (this.perKey.get(key) ?? 1) - 1;
            if (left) this.perKey.set(key, left);
            else this.perKey.delete(key);
        }
    }
}

export function waitSeconds(value: unknown): number {
    if (value === undefined || value === '') return WAIT_DEFAULT_SECONDS;
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > WAIT_MAX_SECONDS)
        throw new HttpError(400, `timeoutSeconds must be between 1 and ${WAIT_MAX_SECONDS}.`);
    return seconds;
}

const pause = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                resolve();
            },
            { once: true },
        );
    });

export type WaitResult =
    { status: 'gone' } | { status: 'ready'; requests: CapturedRequest[] } | { status: 'timeout' };

/**
 * Resolves with captured requests newer than `after` (a request ID), or every request when `after`
 * is omitted, as soon as at least one exists. Checks the cheap request count before reading bodies.
 */
export async function waitForRequests(
    inboxes: InboxRepository,
    input: { id: string; token: string; ownerId?: string; after?: string },
    timeoutMs: number,
    signal?: AbortSignal,
    intervalMs = 500,
): Promise<WaitResult> {
    const deadline = Date.now() + timeoutMs;
    let seen = -1;
    for (;;) {
        const info = await inboxes.info(input.id, input.token, input.ownerId);
        if (!info) return { status: 'gone' };
        if (info.requestCount !== seen) {
            seen = info.requestCount;
            const requests =
                (await inboxes.listRequests(input.id, input.token, input.ownerId)) ?? [];
            const index = input.after ? requests.findIndex(({ id }) => id === input.after) : -1;
            const fresh = requests.slice(index + 1);
            if (fresh.length) return { status: 'ready', requests: fresh };
        }
        if (signal?.aborted || Date.now() + intervalMs > deadline) return { status: 'timeout' };
        await pause(intervalMs, signal);
    }
}
