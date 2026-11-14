'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Select, TextArea, TextField } from '@radix-ui/themes';
import { api } from '../lib/api';

export interface DraftContent {
    to: string[];
    cc?: string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
}

interface Draft {
    id: string;
    subject: string;
    status: string;
    sendAt: string | null;
    answerUrl?: string;
    approvalExpiresAt?: string;
    events: { error?: string }[];
}

const addresses = (value: string) =>
    value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
const empty = { to: [], subject: '', text: '' };
const labels: Record<string, string> = {
    draft: 'Draft',
    awaitingApproval: 'Awaiting approval',
    scheduled: 'Scheduled',
    completed: 'Sent',
    failed: 'Delivery failed',
    rejected: 'Rejected',
    expired: 'Approval expired',
};

export function EmailDraftFields({
    value,
    onChange,
}: {
    value: DraftContent;
    onChange: (value: DraftContent) => void;
}) {
    return (
        <>
            <label>
                To
                <TextField.Root
                    required
                    defaultValue={value.to.join(', ')}
                    placeholder="recipient@example.com"
                    onChange={(event) => onChange({ ...value, to: addresses(event.target.value) })}
                />
            </label>
            <label>
                Cc (optional)
                <TextField.Root
                    defaultValue={value.cc?.join(', ')}
                    onChange={(event) => onChange({ ...value, cc: addresses(event.target.value) })}
                />
            </label>
            <label>
                Subject
                <TextField.Root
                    required
                    maxLength={998}
                    value={value.subject}
                    onChange={(event) => onChange({ ...value, subject: event.target.value })}
                />
            </label>
            <label>
                Plain text
                <TextArea
                    rows={5}
                    value={value.text ?? ''}
                    required={!value.html}
                    onChange={(event) => onChange({ ...value, text: event.target.value })}
                />
            </label>
            <label>
                HTML source (optional)
                <TextArea
                    rows={4}
                    value={value.html ?? ''}
                    onChange={(event) => onChange({ ...value, html: event.target.value })}
                />
            </label>
        </>
    );
}

export function EmailDraftContent({ value }: { value: DraftContent }) {
    return (
        <div className="email-draft-content">
            <p>
                <strong>To</strong> {value.to.join(', ')}
            </p>
            {value.cc?.length ? (
                <p>
                    <strong>Cc</strong> {value.cc.join(', ')}
                </p>
            ) : null}
            <p>
                <strong>Subject</strong> {value.subject}
            </p>
            {value.replyTo && (
                <p>
                    <strong>In reply to</strong> {value.replyTo}
                </p>
            )}
            {value.text && <pre>{value.text}</pre>}
            {value.html && (
                <>
                    <p>
                        <strong>HTML source</strong>
                    </p>
                    <pre>{value.html}</pre>
                </>
            )}
        </div>
    );
}

export function EmailDraftPreview({ id }: { id: string }) {
    const [value, setValue] = useState<DraftContent>();
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        void api(`/api/email-drafts/${id}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((draft) => setValue(draft.content))
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [id]);
    return value ? (
        <EmailDraftContent value={value} />
    ) : (
        <p role="status">{error || 'Loading draft…'}</p>
    );
}

export function EmailDrafts({
    id,
    replyTo,
    canWrite,
    canSend,
    requireApproval,
    canResubmit,
}: {
    id: string;
    replyTo?: { id: string; from: string; subject: string };
    canWrite: boolean;
    canSend: boolean;
    requireApproval: boolean;
    canResubmit: boolean;
}) {
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [selected, setSelected] = useState<(Draft & { content: DraftContent }) | null>(null);
    const [creating, setCreating] = useState(false);
    const [content, setContent] = useState<DraftContent>(empty);
    const [sendAt, setSendAt] = useState('');
    const [mode, setMode] = useState('review');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const base = `/api/email-inboxes/${id}/drafts`;

    useEffect(() => {
        const controller = new AbortController();
        void api(base, { signal: controller.signal })
            .then((response) => response.json())
            .then((result) => setDrafts(result.drafts))
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [base]);

    useEffect(() => {
        if (selected?.status !== 'awaitingApproval' || !selected.approvalExpiresAt) return;
        const controller = new AbortController();
        const timer = setTimeout(
            () => {
                void api(`/api/email-drafts/${selected.id}`, { signal: controller.signal })
                    .then((response) => response.json())
                    .then((draft) => {
                        if (!controller.signal.aborted) show(draft);
                    })
                    .catch((failure: Error) => {
                        if (!controller.signal.aborted) setError(failure.message);
                    });
            },
            Math.max(0, Date.parse(selected.approvalExpiresAt) - Date.now() + 50),
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [selected?.id, selected?.status, selected?.approvalExpiresAt]);

    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to update the draft.');
        } finally {
            setBusy(false);
        }
    }

    function show(draft: Draft & { content: DraftContent }) {
        setSelected(draft);
        setCreating(false);
        setDrafts((items) =>
            items.some((item) => item.id === draft.id)
                ? items.map((item) => (item.id === draft.id ? draft : item))
                : [draft, ...items],
        );
    }

    return (
        <details className="connection-details">
            <summary>Drafts{drafts.length ? ` (${drafts.length})` : ''}</summary>
            <div className="email-draft-panel">
                {canWrite && (
                    <div className="email-draft-actions">
                        <Button
                            type="button"
                            size="2"
                            variant="soft"
                            disabled={busy}
                            onClick={() => {
                                setContent(empty);
                                setCreating(true);
                                setSelected(null);
                            }}
                        >
                            New draft
                        </Button>
                        {replyTo && (
                            <Button
                                type="button"
                                size="2"
                                variant="soft"
                                disabled={busy}
                                onClick={() => {
                                    setContent({
                                        ...empty,
                                        replyTo: replyTo.id,
                                        to: [
                                            (
                                                /<([^<>]+)>\s*$/.exec(replyTo.from)?.[1] ??
                                                replyTo.from
                                            ).trim(),
                                        ].filter(Boolean),
                                        subject: /^re:/i.test(replyTo.subject)
                                            ? replyTo.subject
                                            : `Re: ${replyTo.subject}`,
                                    });
                                    setCreating(true);
                                    setSelected(null);
                                }}
                            >
                                Draft a reply
                            </Button>
                        )}
                    </div>
                )}
                {!drafts.length && !creating && <p className="muted">No drafts in this inbox.</p>}
                {drafts.length > 0 && (
                    <ul className="email-draft-list">
                        {drafts.map((draft) => (
                            <li key={draft.id}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    color="gray"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            const response = await api(
                                                `/api/email-drafts/${draft.id}`,
                                            );
                                            setSendAt('');
                                            show(await response.json());
                                        })
                                    }
                                >
                                    {draft.subject}
                                </Button>
                                <small>{labels[draft.status] ?? draft.status}</small>
                            </li>
                        ))}
                    </ul>
                )}
                {creating && (
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void run(async () => {
                                const response = await api(base, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(content),
                                });
                                show(await response.json());
                            });
                        }}
                    >
                        <EmailDraftFields value={content} onChange={setContent} />
                        <div className="email-draft-actions">
                            <Button type="submit" disabled={busy}>
                                Save draft
                            </Button>
                            <Button type="button" variant="soft" onClick={() => setCreating(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}
                {selected && (
                    <div className="email-draft-panel">
                        <p className="muted">
                            {labels[selected.status] ?? selected.status}
                            {selected.sendAt
                                ? ` · ${new Date(selected.sendAt).toLocaleString()}`
                                : ''}
                        </p>
                        <EmailDraftContent value={selected.content} />
                        {selected.events.at(-1)?.error && (
                            <p role="status">{selected.events.at(-1)?.error}</p>
                        )}
                        {selected.status === 'awaitingApproval' && selected.answerUrl && (
                            <Link href={selected.answerUrl}>Open approval page</Link>
                        )}
                        {canWrite && canSend && selected.status === 'draft' && (
                            <form
                                className="email-create-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(async () => {
                                        const response = await api(
                                            `/api/email-drafts/${selected.id}/send`,
                                            {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    approval: requireApproval || mode === 'review',
                                                    ...(sendAt
                                                        ? { sendAt: new Date(sendAt).toISOString() }
                                                        : {}),
                                                }),
                                            },
                                        );
                                        show(await response.json());
                                    });
                                }}
                            >
                                <label>
                                    Delivery
                                    <Select.Root
                                        value={requireApproval ? 'review' : mode}
                                        onValueChange={setMode}
                                    >
                                        <Select.Trigger aria-label="Delivery" />
                                        <Select.Content>
                                            <Select.Item value="review">
                                                Request approval
                                            </Select.Item>
                                            {!requireApproval && (
                                                <Select.Item value="direct">
                                                    Send directly
                                                </Select.Item>
                                            )}
                                        </Select.Content>
                                    </Select.Root>
                                </label>
                                <label>
                                    Send at (optional, local time)
                                    <TextField.Root
                                        type="datetime-local"
                                        value={sendAt}
                                        onChange={(event) => setSendAt(event.target.value)}
                                    />
                                </label>
                                <Button type="submit" disabled={busy}>
                                    {requireApproval || mode === 'review'
                                        ? 'Request approval'
                                        : sendAt
                                          ? 'Schedule send'
                                          : 'Send draft'}
                                </Button>
                            </form>
                        )}
                        {canResubmit && ['expired', 'rejected'].includes(selected.status) && (
                            <Button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        const response = await api(
                                            `/api/email-drafts/${selected.id}/send`,
                                            {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    approval: true,
                                                    ...(selected.sendAt &&
                                                    Date.parse(selected.sendAt) > Date.now()
                                                        ? { sendAt: selected.sendAt }
                                                        : {}),
                                                }),
                                            },
                                        );
                                        show(await response.json());
                                    })
                                }
                            >
                                Request approval again
                            </Button>
                        )}
                        {canWrite && (
                            <Button
                                type="button"
                                variant="soft"
                                color="gray"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        await api(`/api/email-drafts/${selected.id}`, {
                                            method: 'DELETE',
                                        });
                                        setDrafts((items) =>
                                            items.filter((item) => item.id !== selected.id),
                                        );
                                        setSelected(null);
                                    })
                                }
                            >
                                Delete draft
                            </Button>
                        )}
                    </div>
                )}
                {error && <p role="alert">{error}</p>}
            </div>
        </details>
    );
}
