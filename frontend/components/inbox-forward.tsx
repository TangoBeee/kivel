'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { api, resourceHeaders } from '../lib/api';
import { siteOrigin } from '../lib/site';
import type { Inbox } from '../lib/api';
import type { WebhookDelivery } from '@kivel.io/sdk';
import { useViewer } from '../lib/viewer';

export function InboxForwardSettings({
    inbox,
    onSaved,
    onError,
}: {
    inbox: Inbox;
    onSaved(url: string | undefined, filter?: Inbox['forwardFilter']): void;
    onError(message: string): void;
}) {
    const viewer = useViewer();
    const paid = viewer.status === 'user' && (viewer.plan === 'pro' || viewer.plan === 'team');
    const [url, setUrl] = useState(inbox.forwardUrl ?? '');
    const [method, setMethod] = useState(inbox.forwardFilter?.method ?? '');
    const [path, setPath] = useState(inbox.forwardFilter?.path ?? '');
    const [busy, setBusy] = useState(false);
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
    useEffect(() => {
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
                    body: JSON.stringify({
                        url,
                        method: method.trim() || undefined,
                        path: path.trim() || undefined,
                    }),
                })
            ).json();
            onSaved(saved.forwardUrl, saved.forwardFilter);
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
                        Relay captured requests to a public URL. Leave the filters empty to forward
                        everything. To forward to localhost, use <code>kivel listen --forward</code>
                        .
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
                    <label>
                        HTTP method (optional)
                        <input
                            placeholder="POST"
                            maxLength={20}
                            value={method}
                            onChange={(event) => setMethod(event.target.value)}
                        />
                    </label>
                    <label>
                        Exact path (optional)
                        <input
                            placeholder="/billing"
                            maxLength={512}
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
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
                </form>
            ) : (
                <div className="upsell">
                    <p>
                        Relay every webhook to your own server as it arrives, with retries and a
                        delivery log on Pro.
                    </p>
                    <Link
                        className="button button-primary button-small"
                        href={`${siteOrigin}/pricing/`}
                    >
                        See Pro pricing
                    </Link>
                </div>
            )}
            {(inbox.forwardUrl || deliveries.length > 0) && (
                <ul className="delivery-log">
                    {deliveries.length ? (
                        [...deliveries].reverse().map((delivery) => (
                            <li key={delivery.replayId ?? `${delivery.requestId}-${delivery.at}`}>
                                <span
                                    className={
                                        delivery.status && delivery.status < 400
                                            ? 'is-ok'
                                            : 'is-error'
                                    }
                                >
                                    {delivery.pending ? 'Sending' : (delivery.status ?? 'Failed')}
                                </span>
                                <span>
                                    {delivery.replayId ? 'Replay' : 'Forward'} ·{' '}
                                    {delivery.error ??
                                        `${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'} · ${delivery.durationMs} ms`}
                                    {delivery.responses?.length ? (
                                        <small className="delivery-attempts">
                                            {delivery.responses
                                                .map(
                                                    (attempt) =>
                                                        attempt.status ?? attempt.error ?? 'Failed',
                                                )
                                                .join(' · ')}
                                        </small>
                                    ) : null}
                                </span>
                                <time>{new Date(delivery.at).toLocaleTimeString()}</time>
                            </li>
                        ))
                    ) : (
                        <li>No deliveries yet.</li>
                    )}
                </ul>
            )}
        </div>
    );
}
