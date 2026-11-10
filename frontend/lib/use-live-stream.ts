'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { api, ApiError, resourceHeaders } from './api';

export function useLiveStream(
    topics: string,
    refresh: (signal: AbortSignal) => Promise<number | void>,
    paused: boolean,
    token?: string,
) {
    const onRefresh = useEffectEvent(refresh);
    const [live, setLive] = useState(false);

    useEffect(() => {
        setLive(false);
        if (paused || !topics) return;
        const controller = new AbortController();
        const { signal } = controller;
        let source: EventSource | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        let connected = false;
        let loading = false;
        let changed = false;
        let refreshAfter = 0;
        async function pull() {
            if (signal.aborted || Date.now() < refreshAfter) return;
            if (loading) {
                changed = true;
                return;
            }
            loading = true;
            try {
                const delay = await onRefresh(signal);
                if (delay && delay > 5000 && !signal.aborted) {
                    refreshAfter = Date.now() + delay;
                    refreshTimer = setTimeout(() => {
                        refreshAfter = 0;
                        void pull();
                    }, delay);
                }
            } finally {
                loading = false;
                if (changed) {
                    changed = false;
                    void pull();
                }
            }
        }
        async function connect() {
            const query = new URLSearchParams({ topics });
            if (token) {
                try {
                    const { ticket } = await (
                        await api('/api/stream/ticket', {
                            method: 'POST',
                            headers: {
                                ...resourceHeaders(token),
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ topics }),
                            signal,
                        })
                    ).json();
                    query.set('ticket', ticket);
                } catch (failure) {
                    const delay =
                        failure instanceof ApiError
                            ? Math.max(5000, failure.retryAfter * 1000)
                            : 5000;
                    if (!signal.aborted) retry = setTimeout(connect, delay);
                    return;
                }
            }
            if (signal.aborted) return;
            const connection = new EventSource(`/api/stream?${query}`);
            source = connection;
            connection.addEventListener('ready', () => {
                connected = true;
                setLive(true);
                void pull();
            });
            connection.addEventListener('change', () => void pull());
            connection.onerror = () => {
                connected = false;
                setLive(false);
                if (token) {
                    connection.close();
                    retry = setTimeout(connect, 5000);
                }
            };
        }
        void pull();
        if (typeof EventSource !== 'undefined') void connect();
        const fallback = setInterval(() => {
            if (!connected) void pull();
        }, 5000);
        return () => {
            controller.abort();
            source?.close();
            clearTimeout(retry);
            clearTimeout(refreshTimer);
            clearInterval(fallback);
        };
    }, [topics, paused, token]);

    return !paused && live;
}
