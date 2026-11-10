'use client';

import { useEffect, useEffectEvent, useState } from 'react';

export function useLiveStream(
    topics: string,
    refresh: (signal: AbortSignal) => Promise<void>,
    paused: boolean,
) {
    const onRefresh = useEffectEvent(refresh);
    const [live, setLive] = useState(false);

    useEffect(() => {
        if (paused) return;
        const controller = new AbortController();
        let connected = false;
        let loading = false;
        let changed = false;
        async function pull() {
            if (controller.signal.aborted) return;
            if (loading) {
                changed = true;
                return;
            }
            loading = true;
            try {
                await onRefresh(controller.signal);
            } finally {
                loading = false;
                if (changed) {
                    changed = false;
                    void pull();
                }
            }
        }
        const source = new EventSource(`/api/stream?topics=${encodeURIComponent(topics)}`);
        source.addEventListener('ready', () => {
            connected = true;
            setLive(true);
            void pull();
        });
        source.addEventListener('change', () => void pull());
        source.onerror = () => {
            connected = false;
            setLive(false);
        };
        const fallback = setInterval(() => {
            if (!connected) void pull();
        }, 5000);
        return () => {
            source.close();
            controller.abort();
            clearInterval(fallback);
        };
    }, [topics, paused]);

    return !paused && live;
}
