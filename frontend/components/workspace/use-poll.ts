'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

/**
 * Reads a JSON endpoint now and every `intervalMs`, backing off when the server asks to
 * (Retry-After). Stops when the component unmounts or the tab is hidden.
 */
export function usePoll<T>(path: string, intervalMs: number, pick: (body: unknown) => T) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            let delay = intervalMs;
            if (document.visibilityState === 'visible') {
                try {
                    const body = await (await api(path, { signal: controller.signal })).json();
                    if (controller.signal.aborted) return;
                    setData(pick(body));
                    setError(false);
                } catch (failure) {
                    if (controller.signal.aborted) return;
                    setError(true);
                    if (failure instanceof ApiError)
                        delay = Math.max(delay, failure.retryAfter * 1000);
                }
            }
            timer = setTimeout(load, delay);
        }
        void load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
        // `pick` is expected to be a stable, pure mapper.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, intervalMs]);
    return { data, error };
}
