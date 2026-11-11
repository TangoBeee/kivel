'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, resourceHeaders } from '../lib/api';
import { appLink, workspaceHref } from '../lib/app-routes';
import { CopyButton } from './copy-button';
import { downloadBlob } from './result-preview';

interface Captured {
    id: string;
    method: string;
    path: string;
    rawQuery?: string;
    headers: Record<string, string | string[]>;
    body: string;
    bodyEncoding: 'utf8' | 'base64';
    bodySize: number;
    timestamp: string;
}
interface Inbox {
    id: string;
    inspectionToken: string;
    webhookUrl: string;
    expiresAt: string;
}
// Shared with the homepage demo so a visitor keeps one URL across both pages.
const STORE = 'kivel:home-inbox';
function saved(): Inbox | null {
    try {
        const value = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Inbox | null;
        return value && Date.parse(value.expiresAt) > Date.now() + 60_000 ? value : null;
    } catch {
        return null;
    }
}
const now = () => Math.floor(Date.now() / 1000);
// Shapes copied from each provider's documented event payloads, with obviously sample IDs.
const samples = {
    Stripe: {
        headers: { 'Stripe-Signature': `t=${now()},v1=sample` },
        body: {
            id: 'evt_sample_1PqR2s',
            object: 'event',
            type: 'payment_intent.succeeded',
            created: now(),
            livemode: false,
            data: {
                object: {
                    id: 'pi_sample_3MtwBw',
                    object: 'payment_intent',
                    amount: 4999,
                    currency: 'usd',
                    status: 'succeeded',
                    receipt_email: 'jordan.reyes@example.com',
                },
            },
        },
    },
    GitHub: {
        headers: {
            'X-GitHub-Event': 'push',
            'X-GitHub-Delivery': '72d3162e-cc78-11e3-81ab-4c9367dc0958',
            'X-Hub-Signature-256': 'sha256=sample',
        },
        body: {
            ref: 'refs/heads/main',
            before: '6113728f27ae82c7b1a177c8d03f9e96e0adf246',
            after: '0000000000000000000000000000000000000000',
            repository: { full_name: 'octo-org/payments-api', private: true },
            pusher: { name: 'mona', email: 'mona@example.com' },
            head_commit: {
                message: 'Handle refunded payment intents',
                timestamp: new Date().toISOString(),
            },
        },
    },
    Shopify: {
        headers: {
            'X-Shopify-Topic': 'orders/create',
            'X-Shopify-Shop-Domain': 'sample-store.myshopify.com',
            'X-Shopify-Hmac-Sha256': 'sample',
        },
        body: {
            id: 820982911946154500,
            email: 'casey.nguyen@example.com',
            total_price: '128.40',
            currency: 'USD',
            financial_status: 'paid',
            line_items: [{ title: 'Merino crew sweater', quantity: 2, price: '64.20' }],
        },
    },
    Slack: {
        headers: { 'X-Slack-Signature': 'v0=sample', 'X-Slack-Request-Timestamp': String(now()) },
        body: {
            type: 'event_callback',
            team_id: 'T0SAMPLE',
            event: {
                type: 'app_mention',
                user: 'U0SAMPLE',
                text: '<@U0BOT> deploy status?',
                channel: 'C0SAMPLE',
            },
        },
    },
} as const;

// The event name a provider puts in a header or the body, so rows are recognisable at a glance.
function eventName(request: Captured) {
    const header = (name: string) => {
        const value = request.headers[name];
        return Array.isArray(value) ? value[0] : value;
    };
    const fromHeader =
        header('x-github-event') ?? header('x-shopify-topic') ?? header('x-event-type');
    if (fromHeader) return fromHeader;
    try {
        const body = JSON.parse(request.body) as { type?: unknown; event?: { type?: unknown } };
        const type = typeof body.type === 'string' ? body.type : body.event?.type;
        return typeof type === 'string' ? type : undefined;
    } catch {
        return undefined;
    }
}
function decode(request: Captured) {
    if (request.bodyEncoding === 'base64') return `(${request.bodySize} bytes of binary data)`;
    try {
        return JSON.stringify(JSON.parse(request.body), null, 2);
    } catch {
        return request.body || '(empty body)';
    }
}
function remaining(expiresAt: string) {
    const minutes = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000));
    return minutes >= 60 ? 'about 1 hour' : `${minutes} min`;
}

/** A working webhook URL on the page itself: no account, requests appear as they arrive. */
export function WebhookTester() {
    const [inbox, setInbox] = useState<Inbox | null>(null);
    const [requests, setRequests] = useState<Captured[]>([]);
    const [open, setOpen] = useState<string>();
    const [state, setState] = useState<'idle' | 'creating' | 'error'>('idle');
    const [, tick] = useState(0);

    useEffect(() => setInbox(saved()), []);
    useEffect(() => {
        const timer = setInterval(() => tick((value) => value + 1), 30_000);
        return () => clearInterval(timer);
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
                if (response.status !== 304) {
                    const result: { requests: Captured[] } = await response.json();
                    if (live) setRequests([...result.requests].reverse());
                }
            } catch {
                if (live && Date.parse(inbox!.expiresAt) < Date.now()) {
                    setInbox(null);
                    return;
                }
            }
            if (live) timer = setTimeout(poll, document.hidden ? 6000 : 2000);
        }
        void poll();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [inbox]);

    async function create() {
        setState('creating');
        try {
            const created: Inbox = await (
                await api('/api/inboxes?visibility=public', { method: 'POST' })
            ).json();
            try {
                localStorage.setItem(STORE, JSON.stringify(created));
            } catch {}
            setRequests([]);
            setInbox(created);
            setState('idle');
        } catch {
            setState('error');
        }
    }
    async function send(name: keyof typeof samples) {
        if (!inbox) return;
        const sample = samples[name];
        try {
            await fetch(inbox.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...sample.headers },
                body: JSON.stringify(sample.body),
            });
        } catch {}
    }
    const curl = useMemo(
        () =>
            inbox
                ? `curl -X POST '${inbox.webhookUrl}' -H 'Content-Type: application/json' -d '{"event":"order.created","id":"ord_1042"}'`
                : '',
        [inbox],
    );

    if (!inbox)
        return (
            <section className="webhook-tester" aria-label="Webhook tester">
                <div className="webhook-tester-empty">
                    <p>
                        Get a working webhook URL right now. Paste it into Stripe, GitHub, Shopify,
                        Slack or your own app and every request shows up here with its headers and
                        body. No account needed.
                    </p>
                    <button
                        type="button"
                        className="button button-primary"
                        onClick={create}
                        disabled={state === 'creating'}
                    >
                        {state === 'creating' ? 'Creating your URL…' : 'Create a webhook URL'}
                    </button>
                    {state === 'error' && (
                        <p className="webhook-tester-error" role="alert">
                            Could not create a URL. Try again in a minute.
                        </p>
                    )}
                </div>
            </section>
        );

    return (
        <section className="webhook-tester" aria-label="Webhook tester">
            <div className="webhook-tester-url">
                <code translate="no">{inbox.webhookUrl}</code>
                <CopyButton text={inbox.webhookUrl} label="Copy URL" />
            </div>
            <p className="webhook-tester-meta">
                Accepts any method, path suffix and body. Expires in {remaining(inbox.expiresAt)}.{' '}
                <button type="button" className="text-link" onClick={create}>
                    New URL
                </button>
            </p>
            <div className="webhook-tester-actions">
                <span>Send a sample:</span>
                {(Object.keys(samples) as (keyof typeof samples)[]).map((name) => (
                    <button
                        key={name}
                        type="button"
                        className="button button-small"
                        onClick={() => send(name)}
                    >
                        {name}
                    </button>
                ))}
                <CopyButton text={curl} label="Copy cURL" />
                {requests.length > 0 && (
                    <button
                        type="button"
                        className="button button-small"
                        onClick={() =>
                            downloadBlob(
                                new Blob([JSON.stringify(requests, null, 2)], {
                                    type: 'application/json',
                                }),
                                'webhook-requests.json',
                            )
                        }
                    >
                        Export JSON
                    </button>
                )}
            </div>
            <ol className="webhook-tester-feed" aria-live="polite" aria-label="Captured requests">
                {requests.length === 0 && (
                    <li className="webhook-tester-waiting">Waiting for the first request…</li>
                )}
                {requests.map((request) => {
                    const expanded = open === request.id;
                    const suffix = request.path.replace(`/hooks/${inbox.id}`, '') || '/';
                    return (
                        <li key={request.id}>
                            <button
                                type="button"
                                className="webhook-tester-row"
                                aria-expanded={expanded}
                                onClick={() => setOpen(expanded ? undefined : request.id)}
                            >
                                <span className="webhook-tester-method">{request.method}</span>
                                <code>
                                    {suffix}
                                    {request.rawQuery ? `?${request.rawQuery}` : ''}
                                    {eventName(request) ? `  ${eventName(request)}` : ''}
                                </code>
                                <span>{request.bodySize} B</span>
                                <time dateTime={request.timestamp}>
                                    {new Date(request.timestamp).toLocaleTimeString()}
                                </time>
                            </button>
                            {expanded && (
                                <div className="webhook-tester-detail">
                                    <h4>Headers</h4>
                                    <dl>
                                        {Object.entries(request.headers).map(([name, value]) => (
                                            <div key={name}>
                                                <dt>{name}</dt>
                                                <dd>
                                                    {Array.isArray(value)
                                                        ? value.join(', ')
                                                        : value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <div className="webhook-tester-body-head">
                                        <h4>Body</h4>
                                        <CopyButton
                                            text={decode(request)}
                                            label="Copy body"
                                            compact
                                        />
                                    </div>
                                    <pre>{decode(request)}</pre>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="webhook-tester-meta">
                Need custom responses, signature checks, a longer life or an agent that waits for
                requests?{' '}
                <Link
                    className="text-link"
                    href={appLink(workspaceHref('webhooks', { tool: 'webhooks' }))}
                >
                    Open it in Kivel
                </Link>
                .
            </p>
        </section>
    );
}
