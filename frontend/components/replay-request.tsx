'use client';

import { useEffect, useState } from 'react';
import { AlertDialog, Button } from '@radix-ui/themes';
import { api, resourceHeaders } from '../lib/api';
import type { CapturedRequest, Inbox } from '../lib/api';
import type { WebhookDelivery } from '@kivel.io/sdk';

export function ReplayRequest({ inbox, request }: { inbox: Inbox; request: CapturedRequest }) {
    const [url, setUrl] = useState(inbox.forwardUrl ?? '');
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [delivery, setDelivery] = useState<WebhookDelivery>();
    const [error, setError] = useState('');
    const [pendingKey, setPendingKey] = useState('');
    const pending = delivery?.pending;

    useEffect(() => {
        const id = delivery?.replayId;
        if (!pending || !id) return;
        const controller = new AbortController();
        let timer = setTimeout(check, 2000);
        async function check() {
            try {
                const result = (await (
                    await api(`/api/inboxes/${inbox.id}/deliveries`, {
                        headers: resourceHeaders(inbox.inspectionToken),
                        signal: controller.signal,
                    })
                ).json()) as { deliveries: WebhookDelivery[] };
                const updated = result.deliveries.find(({ replayId }) => replayId === id);
                if (updated && !controller.signal.aborted) setDelivery(updated);
                if (updated && !updated.pending) return;
            } catch {}
            if (!controller.signal.aborted) timer = setTimeout(check, 2000);
        }
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [inbox.id, inbox.inspectionToken, delivery?.replayId, pending]);

    async function replay() {
        setBusy(true);
        setError('');
        const key = pendingKey || crypto.randomUUID();
        setPendingKey(key);
        try {
            const response = await api(`/api/inboxes/${inbox.id}/replays`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
                body: JSON.stringify({ requestId: request.id, url }),
            });
            setDelivery(await response.json());
            setPendingKey('');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to replay this request.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <form
                className="replay-request"
                onSubmit={(event) => {
                    event.preventDefault();
                    setConfirm(true);
                }}
            >
                <label>
                    Replay this {request.method} to
                    <input
                        type="url"
                        required
                        maxLength={2048}
                        placeholder="https://staging.example.com/webhooks"
                        value={url}
                        disabled={pending || busy}
                        onChange={(event) => {
                            setUrl(event.target.value);
                            setPendingKey('');
                        }}
                    />
                </label>
                <Button size="2" variant="surface" type="submit" disabled={busy || pending}>
                    {busy || pending ? 'Sending…' : pendingKey ? 'Check replay' : 'Replay'}
                </Button>
                {error && (
                    <span className="replay-error" role="status">
                        {error}
                    </span>
                )}
                {delivery && !error && (
                    <span
                        className={
                            delivery.error || (delivery.status ?? 0) >= 400
                                ? 'replay-error'
                                : 'replay-ok'
                        }
                        role="status"
                    >
                        {delivery.error ??
                            (delivery.pending
                                ? 'Sending request.'
                                : `HTTP ${delivery.status} · ${delivery.attempts} ${delivery.attempts === 1 ? 'attempt' : 'attempts'}`)}
                    </span>
                )}
            </form>
            <AlertDialog.Root open={confirm} onOpenChange={setConfirm}>
                <AlertDialog.Content>
                    <AlertDialog.Title>Replay this request?</AlertDialog.Title>
                    <AlertDialog.Description>
                        Kivel will send the original {request.method} body to{' '}
                        <strong className="webhook-break">{url}</strong>. Credentials and proxy
                        headers are removed. Original signatures are kept and may have expired.
                    </AlertDialog.Description>
                    <div className="button-row">
                        <AlertDialog.Cancel>
                            <Button variant="soft" color="gray">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                            <Button onClick={() => void replay()}>Replay request</Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );
}
