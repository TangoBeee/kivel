export const RATE_WINDOW_MS = 60_000;
export const REQUESTS_PER_MINUTE = 120;
export const CREATIONS_PER_MINUTE = 10;

interface Window {
    count: number;
    expiresAt: number;
}

export interface RateLimitRepository {
    consume(key: string, limit: number, windowMs?: number): number | Promise<number>;
    deleteExpired(): void | Promise<void>;
}

export class RateLimiter implements RateLimitRepository {
    private readonly windows = new Map<string, Window>();

    constructor(
        private readonly now: () => number = Date.now,
        private readonly maxKeys = 10_000,
    ) {}

    deleteExpired(): void {
        const now = this.now();
        for (const [key, window] of this.windows) {
            if (window.expiresAt <= now) this.windows.delete(key);
        }
    }

    /** Returns a Retry-After duration, or zero when the request is allowed. */
    consume(key: string, limit: number, windowMs = RATE_WINDOW_MS): number {
        const now = this.now();
        let window = this.windows.get(key);
        if (window && window.expiresAt <= now) {
            this.windows.delete(key);
            window = undefined;
        }
        if (!window) {
            if (this.windows.size >= this.maxKeys) {
                this.deleteExpired();
                // Still full: forget the oldest window rather than refusing every new client.
                if (this.windows.size >= this.maxKeys)
                    this.windows.delete(this.windows.keys().next().value!);
            }
            window = { count: 0, expiresAt: now + windowMs };
            this.windows.set(key, window);
        }
        if (window.count >= limit) {
            return Math.max(1, Math.ceil((window.expiresAt - now) / 1000));
        }
        window.count++;
        return 0;
    }
}
