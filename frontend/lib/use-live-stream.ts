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
        let reconnectDelay = 1000;
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
        function reconnect(retryAfter = 0) {
            if (signal.aborted) return;
            clearTimeout(retry);
            retry = setTimeout(connect, Math.max(reconnectDelay, retryAfter * 1000));
            reconnectDelay = Math.min(reconnectDelay * 2, 30000);
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
                    reconnect(failure instanceof ApiError ? failure.retryAfter : undefined);
                    return;
                }
            }
            if (signal.aborted) return;
            const connection = new EventSource(`/api/stream?${query}`);
            source = connection;
            connection.addEventListener('ready', () => {
                if (source !== connection || signal.aborted) return;
                reconnectDelay = 1000;
                connected = true;
                setLive(true);
                void pull();
            });
            connection.addEventListener('change', () => void pull());
            connection.onerror = () => {
                if (source !== connection || signal.aborted) return;
                connection.close();
                source = undefined;
                connected = false;
                setLive(false);
                reconnect();
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
