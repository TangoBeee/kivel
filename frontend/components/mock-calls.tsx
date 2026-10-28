'use client';

import { useEffect, useState } from 'react';
import { api, resourceHeaders } from '../lib/api';

interface MockCall {
    at: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    contentType?: string;
    bodySize: number;
    bodyPreview?: string;
}

/** Live list of what callers sent to a mock and what it answered. */
export function MockCalls({ id, token }: { id: string; token: string }) {
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
    return (
        <section className="mock-calls" aria-label="Recent calls">
            <div className="mock-calls-heading">
                <strong>Recent calls</strong>
                <span>{calls.length ? `${calls.length} of the last 100` : 'Listening…'}</span>
            </div>
            {recent.length ? (
                <ul>
                    {recent.map((call, index) => (
                        <li key={`${call.at}-${index}`}>
                            <button
                                type="button"
                                aria-expanded={open === index}
                                onClick={() => setOpen(open === index ? null : index)}
                            >
                                <code className="mock-call-method">{call.method}</code>
                                <code className="mock-call-path">{call.path}</code>
                                <span
                                    className={`mock-call-status ${call.status >= 400 ? 'is-error' : ''}`}
                                >
                                    {call.status}
                                </span>
                                <span className="mock-call-meta">
                                    {call.durationMs} ms · {new Date(call.at).toLocaleTimeString()}
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
                    ))}
                </ul>
            ) : (
                <p>Call your mock and each request appears here within a few seconds.</p>
            )}
        </section>
    );
}
