'use client';

import { useEffect, useState } from 'react';
import { api, resourceHeaders } from '../lib/api';

interface MockCall {
    at: string;
    method: string;
    path: string;
    query?: { connectionId?: string };
    status: number;
    durationMs: number;
    contentType?: string;
    bodySize: number;
    bodyPreview?: string;
}

/** Live list of what callers sent to a mock and what it answered. */
export function MockCalls({
    id,
    token,
    websocket = false,
}: {
    id: string;
    token: string;
    websocket?: boolean;
}) {
    const [calls, setCalls] = useState<MockCall[]>([]);
    const [open, setOpen] = useState<number | null>(null);
    useEffect(() => {
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const value = await (
                    await api(`/api/mocks/${id}/calls`, { headers: resourceHeaders(token) })
                ).json();
                if (live) setCalls(value.calls);
            } catch {}
            if (live && document.visibilityState === 'visible') timer = setTimeout(load, 3000);
            else if (live) timer = setTimeout(load, 15000);
        }
        void load();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [id, token]);
    const recent = [...calls].reverse();
    const wsEvent: Record<string, string> = {
        'WS connect': 'Connected',
        'WS receive': 'Received',
        'WS send': 'Sent',
        'WS close': 'Closed',
    };
    return (
        <section className="mock-calls" aria-label={websocket ? 'Recent traffic' : 'Recent calls'}>
            <div className="mock-calls-heading">
                <strong>{websocket ? 'Recent traffic' : 'Recent calls'}</strong>
                <span>{calls.length ? `${calls.length} of the last 100` : 'Listening…'}</span>
            </div>
            {recent.length ? (
                <ul>
                    {recent.map((call, index) => {
                        const connection =
                            websocket && typeof call.query?.connectionId === 'string'
                                ? call.query.connectionId
                                : undefined;
                        const failed =
                            call.method === 'WS close'
                                ? ![1000, 1001].includes(call.status)
                                : call.status >= 400;
                        const frame = call.method === 'WS receive' || call.method === 'WS send';
                        return (
                            <li key={`${call.at}-${index}`}>
                                <button
                                    type="button"
                                    aria-expanded={open === index}
                                    onClick={() => setOpen(open === index ? null : index)}
                                >
                                    <span className="mock-call-method">
                                        {wsEvent[call.method] ?? call.method}
                                    </span>
                                    <code className="mock-call-path" title={connection}>
                                        {connection?.slice(0, 8) ?? call.path}
                                    </code>
                                    <span
                                        className={`mock-call-status ${failed ? 'is-error' : ''}`}
                                    >
                                        {frame ? `${call.bodySize} B` : call.status}
                                    </span>
                                    <span className="mock-call-meta">
                                        {call.durationMs} ms ·{' '}
                                        {new Date(call.at).toLocaleTimeString()}
                                    </span>
                                </button>
                                {open === index && (
                                    <pre>
                                        {call.bodyPreview ??
                                            (call.bodySize
                                                ? `${call.bodySize} bytes (binary)`
                                                : 'No body')}
                                    </pre>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p>
                    {websocket
                        ? 'Connect a client to see its messages and close code here.'
                        : 'Call your mock and each request appears here within a few seconds.'}
                </p>
            )}
        </section>
    );
}
