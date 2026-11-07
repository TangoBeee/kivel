'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Check, Copy, PaperPlaneTilt } from '@phosphor-icons/react';
import { api, resourceHeaders } from '../../lib/api';

interface Captured {
    id: string;
    method: string;
    query: Record<string, string>;
    body: string;
    timestamp: string;
    headers: Record<string, string>;
}
interface Inbox {
    id: string;
    inspectionToken: string;
    webhookUrl: string;
    expiresAt: string;
}

const STORE = 'socket-help:home-inbox';
const saved = (): Inbox | null => {
    try {
        const value = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Inbox | null;
        return value && Date.parse(value.expiresAt) > Date.now() + 60000 ? value : null;
    } catch {
        return null;
    }
};

const pretty = (body: string) => {
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
        return body || 'No body';
    }
};
// The headers an agent usually checks first; the full set is in the inbox.
const SHOWN_HEADERS = ['content-type', 'user-agent', 'stripe-signature', 'x-github-event'];

const preview = (body: string) => {
    try {
        return JSON.stringify(JSON.parse(body));
    } catch {
        return body || 'No body';
    }
};

/** A real, anonymous webhook inbox: create it, send it something, watch it arrive. */
export function LiveWebhook() {
    const [inbox, setInbox] = useState<Inbox | null>(null);
    const [requests, setRequests] = useState<Captured[]>([]);
    const [state, setState] = useState<'idle' | 'creating' | 'ready' | 'error'>('idle');
    const [copied, setCopied] = useState(false);
    const [sending, setSending] = useState(false);

    async function create() {
        setState('creating');
        try {
            const created: Inbox = await (
                await api('/api/inboxes?visibility=public', { method: 'POST' })
            ).json();
            try {
                localStorage.setItem(STORE, JSON.stringify(created));
            } catch {}
            setInbox(created);
            setState('ready');
        } catch {
            setState('error');
        }
    }

    // Nothing is created until the visitor asks; one inbox is then reused in this browser
    // (across reloads and tabs) until it expires.
    useEffect(() => {
        const existing = saved();
        if (existing) {
            setInbox(existing);
            setState('ready');
        }
    }, []);

    useEffect(() => {
        if (!inbox) return;
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            try {
                const response = await api(`/api/inboxes/${inbox!.id}/requests`, {
                    headers: resourceHeaders(inbox!.inspectionToken),
                });
                const result: { requests: Captured[] } = await response.json();
                if (!live) return;
                setRequests(result.requests.slice(-3).reverse());
            } catch {}
            if (live) timer = setTimeout(poll, document.hidden ? 6000 : 2000);
        }
        void poll();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [inbox]);

    async function send() {
        if (!inbox) return;
        setSending(true);
        try {
            await fetch(`${inbox.webhookUrl}?source=Kivel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'order.created', id: 'demo-001', test: true }),
            });
        } catch {}
        setSending(false);
    }
    const curl = inbox ? `curl -X POST ${inbox.webhookUrl} -d '{"hello":"agent"}'` : '';

    return (
        <div className="home-live">
            <div className="home-live-head">
                <span>Webhook inbox</span>
                <span className="home-live-status">
                    {inbox ? 'Live, deletes itself in 1 hour' : 'Real, not a recording'}
                </span>
            </div>
            {!inbox ? (
                <div className="home-live-empty">
                    <p>
                        A working webhook URL, the same one an agent gets over MCP. No account
                        needed. Works with GitHub, Shopify, Slack, Twilio, Stripe and your own apps.
                    </p>
                    {state === 'creating' ? (
                        <span
                            className="home-live-skeleton"
                            role="status"
                            aria-label="Creating a live URL…"
                        />
                    ) : (
                        <button
                            type="button"
                            className="home-button home-button-light"
                            onClick={create}
                        >
                            Create a live URL
                        </button>
                    )}
                    {state === 'error' && (
                        <p className="home-live-error" role="alert">
                            Could not create an inbox. Try again in a minute.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="home-live-url">
                        <code translate="no">{inbox.webhookUrl}</code>
                        <button
                            type="button"
                            aria-label="Copy cURL command"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(curl);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1800);
                                } catch {}
                            }}
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                    <div className="home-live-actions">
                        <button
                            type="button"
                            className="home-button home-button-light"
                            onClick={send}
                            disabled={sending}
                        >
                            <PaperPlaneTilt size={16} weight="bold" />
                            Send a test request
                        </button>
                        <span>or curl it from your terminal</span>
                    </div>
                    <ol
                        className="home-live-feed"
                        aria-live="polite"
                        aria-label="Captured requests"
                    >
                        {requests.length === 0 ? (
                            <li className="home-live-waiting">
                                <ArrowsClockwise size={16} className="home-spin" />
                                Waiting for the first request…
                            </li>
                        ) : (
                            requests.map((request) => (
                                <li key={request.id}>
                                    <span className="home-method">{request.method}</span>
                                    <code>{preview(request.body)}</code>
                                    <time dateTime={request.timestamp}>
                                        {new Date(request.timestamp).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                        })}
                                    </time>
                                </li>
                            ))
                        )}
                    </ol>
                    {requests[0] && (
                        <div className="home-live-detail">
                            <dl>
                                {SHOWN_HEADERS.filter((name) => requests[0]!.headers[name]).map(
                                    (name) => (
                                        <div key={name}>
                                            <dt>{name}</dt>
                                            <dd>{requests[0]!.headers[name]}</dd>
                                        </div>
                                    ),
                                )}
                            </dl>
                            <pre>{pretty(requests[0].body)}</pre>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
