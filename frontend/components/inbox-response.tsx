'use client';

import { useState } from 'react';
import { Button } from '@radix-ui/themes';
import { api, resourceHeaders } from '../lib/api';
import type { Inbox, InboxResponse } from '../lib/api';

const types = ['application/json', 'text/plain', 'application/xml', 'text/xml'];

/** Lets an inbox answer senders like the real service would, instead of the default receipt. */
export function InboxResponseSettings({
    inbox,
    onSaved,
    onError,
}: {
    inbox: Inbox;
    onSaved(response: InboxResponse | undefined): void;
    onError(message: string): void;
}) {
    const current = inbox.response;
    const [status, setStatus] = useState(String(current?.status ?? 200));
    const [contentType, setContentType] = useState(current?.contentType ?? 'application/json');
    const [body, setBody] = useState(current?.body ?? '{"ok":true}');
    const [delay, setDelay] = useState(String(current?.delayMs ?? 0));
    const [busy, setBusy] = useState(false);
    const summary = current
        ? `${current.status} ${current.contentType}${current.delayMs ? ` after ${current.delayMs} ms` : ''}`
        : '200 JSON receipt (default)';
    async function save(reset: boolean) {
        setBusy(true);
        onError('');
        try {
            const headers = { ...resourceHeaders(inbox.inspectionToken) };
            if (reset) {
                await api(`/api/inboxes/${inbox.id}/response`, { method: 'DELETE', headers });
                onSaved(undefined);
                return;
            }
            const saved = await (
                await api(`/api/inboxes/${inbox.id}/response`, {
                    method: 'PUT',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: Number(status),
                        contentType,
                        body,
                        delayMs: Number(delay),
                    }),
                })
            ).json();
            onSaved(saved.response);
        } catch (failure) {
            onError(failure instanceof Error ? failure.message : 'Unable to save the response.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <details className="connection-details inbox-response">
            <summary>
                Response to senders: <strong>{summary}</strong>
            </summary>
            <form
                className="connection-content inbox-response-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save(false);
                }}
            >
                <p>
                    Answer like the real service would, to test retries, timeouts and error
                    handling. Every request is still captured.
                </p>
                <div className="inbox-response-row">
                    <label>
                        Status
                        <input
                            type="number"
                            min={200}
                            max={599}
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                        />
                    </label>
                    <label>
                        Content type
                        <select
                            value={contentType}
                            onChange={(event) => setContentType(event.target.value)}
                        >
                            {types.map((type) => (
                                <option key={type}>{type}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Delay (ms)
                        <input
                            type="number"
                            min={0}
                            max={5000}
                            step={100}
                            value={delay}
                            onChange={(event) => setDelay(event.target.value)}
                        />
                    </label>
                </div>
                <label>
                    Body
                    <textarea
                        rows={4}
                        maxLength={16384}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                    />
                </label>
                <div className="button-row">
                    <Button size="2" color="green" type="submit" disabled={busy}>
                        Save response
                    </Button>
                    {current && (
                        <Button
                            size="2"
                            variant="surface"
                            color="gray"
                            type="button"
                            disabled={busy}
                            onClick={() => void save(true)}
                        >
                            Restore default
                        </Button>
                    )}
                </div>
            </form>
        </details>
    );
}
