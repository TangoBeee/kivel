'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { api, resourceHeaders } from '../lib/api';
import type { Inbox } from '../lib/api';
import { useViewer } from '../lib/viewer';

interface Delivery {
    requestId: string;
    at: string;
    attempts: number;
    status?: number;
    error?: string;
    durationMs: number;
}

/** Pro and Team: relay every captured webhook to the user's own endpoint, with a delivery log. */
export function InboxForwardSettings({
    inbox,
    onSaved,
    onError,
}: {
    inbox: Inbox;
    onSaved(url: string | undefined): void;
    onError(message: string): void;
}) {
    const viewer = useViewer();
    const paid = viewer.status === 'user' && (viewer.plan === 'pro' || viewer.plan === 'team');
    const [url, setUrl] = useState(inbox.forwardUrl ?? '');
    const [busy, setBusy] = useState(false);
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    useEffect(() => {
        if (!inbox.forwardUrl) return;
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const value = await (
                    await api(`/api/inboxes/${inbox.id}/deliveries`, {
                        headers: resourceHeaders(inbox.inspectionToken),
                    })
                ).json();
                if (live) setDeliveries(value.deliveries);
            } catch {}
            if (live) timer = setTimeout(load, 5000);
        }
        void load();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [inbox.id, inbox.inspectionToken, inbox.forwardUrl]);
    async function save(stop: boolean) {
        setBusy(true);
        onError('');
        try {
            const headers = resourceHeaders(inbox.inspectionToken);
            if (stop) {
                await api(`/api/inboxes/${inbox.id}/forward`, { method: 'DELETE', headers });
                onSaved(undefined);
                return;
            }
            const saved = await (
                await api(`/api/inboxes/${inbox.id}/forward`, {
                    method: 'PUT',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                })
            ).json();
            onSaved(saved.forwardUrl);
        } catch (failure) {
            onError(failure instanceof Error ? failure.message : 'Unable to save forwarding.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="inbox-settings-pane">
            {paid ? (
                <form
                    className="inbox-response-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save(false);
                    }}
                >
                    <p>
                        Every captured request is also sent to this public URL, with retries after
                        server errors. Text bodies only. To reach localhost, use{' '}
                        <code>socket-help listen --forward</code> instead.
                    </p>
                    <label>
                        Endpoint URL
                        <input
                            type="url"
                            required
                            placeholder="https://api.example.com/webhooks/events"
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                        />
                    </label>
                    <div className="button-row">
                        <Button size="2" color="green" type="submit" disabled={busy}>
                            {inbox.forwardUrl ? 'Update' : 'Start forwarding'}
                        </Button>
                        {inbox.forwardUrl && (
                            <Button
                                size="2"
                                variant="surface"
                                color="gray"
                                type="button"
                                disabled={busy}
                                onClick={() => void save(true)}
                            >
                                Stop
                            </Button>
                        )}
                    </div>
                    {inbox.forwardUrl && (
                        <ul className="delivery-log">
                            {deliveries.length ? (
                                [...deliveries].reverse().map((delivery) => (
                                    <li key={`${delivery.requestId}-${delivery.at}`}>
                                        <span
                                            className={
                                                delivery.status && delivery.status < 400
                                                    ? 'is-ok'
                                                    : 'is-error'
                                            }
                                        >
                                            {delivery.status ?? 'failed'}
                                        </span>
                                        <span>
                                            {delivery.error ??
                                                `${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'} · ${delivery.durationMs} ms`}
                                        </span>
                                        <time>{new Date(delivery.at).toLocaleTimeString()}</time>
                                    </li>
                                ))
                            ) : (
                                <li>No deliveries yet.</li>
                            )}
                        </ul>
                    )}
                </form>
            ) : (
                <div className="upsell">
                    <p>
                        Relay every webhook to your own server as it arrives, with retries and a
                        delivery log. Other webhook tools charge more for this; on socket.help it’s
                        part of Pro.
                    </p>
                    <Link className="button button-primary button-small" href="/plans/">
                        Get Pro for $2 a month
                    </Link>
                </div>
            )}
        </div>
    );
}
