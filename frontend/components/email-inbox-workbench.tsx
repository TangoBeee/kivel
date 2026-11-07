'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertDialog, Button, Select, TextArea, TextField } from '@radix-ui/themes';
import { api, ApiError, resourceHeaders } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { EmailDrafts } from './email-drafts';
import { EmailInboxRules } from './email-inbox-rules';
import { CopyButton } from './copy-button';
import { Icon } from './icons';
import { ToolHeader } from './tool-header';

interface EmailInbox {
    id: string;
    address: string;
    managementToken?: string;
    expiresAt: string | null;
    persistent?: boolean;
    status?: 'active' | 'paused';
}
interface EmailMessage {
    id: string;
    receivedAt: string;
    from: string;
    to: string;
    cc?: string[];
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: { url: string; kind: 'verification' | 'other' }[];
    attachments: { id?: string; filename: string; mimeType: string; size: number }[];
    direction?: 'inbound' | 'outbound';
    deliveryStatus?: 'pending' | 'sent';
}

interface ThreadSummary {
    id: string;
    subject: string;
    from: string;
    lastAt: string;
    messageCount: number;
}

const KEY = 'socket-email-inbox';
const remember = (inbox: EmailInbox | null) => {
    try {
        if (inbox) sessionStorage.setItem(KEY, JSON.stringify(inbox));
        else sessionStorage.removeItem(KEY);
    } catch {}
};
const restore = (): EmailInbox | null => {
    try {
        const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
        return value && (value.expiresAt === null || Date.parse(value.expiresAt) > Date.now())
            ? value
            : null;
    } catch {
        return null;
    }
};

export function EmailInboxWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [inbox, setInbox] = useState<EmailInbox | null>(null);
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [detail, setDetail] = useState<{ id: string; messages: EmailMessage[] } | null>(null);
    const [mailVersion, setMailVersion] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [showHtml, setShowHtml] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [activeDays, setActiveDays] = useState('3');
    const [localPart, setLocalPart] = useState('');
    const [existing, setExisting] = useState<EmailInbox[]>([]);
    const [forwardingUrl, setForwardingUrl] = useState('');
    const [forwardNotice, setForwardNotice] = useState('');
    const [requireApproval, setRequireApproval] = useState(false);
    const [sendingEnabled, setSendingEnabled] = useState(false);
    const [draft, setDraft] = useState({ to: '', subject: '', text: '' });
    const [draftKey, setDraftKey] = useState('');
    const [sendNotice, setSendNotice] = useState('');
    const paid = viewer.status === 'user' && ['pro', 'team'].includes(viewer.plan);
    const canManage = viewer.status === 'user' && ['owner', 'admin'].includes(viewer.role);

    async function create() {
        setBusy(true);
        setError('');
        try {
            const created: EmailInbox = await (
                await api('/api/email-inboxes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        paid
                            ? localPart
                                ? { localPart }
                                : {}
                            : { activeDays: Number(activeDays) },
                    ),
                })
            ).json();
            remember(created);
            setThreads([]);
            setThreadId(null);
            setDetail(null);
            setHasMore(false);
            setShowAll(false);
            setSelected(null);
            setInbox(created);
            setExisting((items) => [...items, created]);
        } catch (failure) {
            setError(
                failure instanceof ApiError && failure.status === 503
                    ? 'Email inboxes are being set up on this server. Please check back soon.'
                    : failure instanceof Error
                      ? failure.message
                      : 'Unable to create an inbox.',
            );
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        setInbox(null);
        setThreads([]);
        setThreadId(null);
        setDetail(null);
        setHasMore(false);
        setShowAll(false);
        setSelected(null);
        setExisting([]);
        if (viewer.status !== 'user') return;
        let live = true;
        void api('/api/email-inboxes')
            .then((response) => response.json())
            .then((data) => {
                if (!live) return;
                setExisting(data.inboxes);
                const saved = restore();
                const requested = new URLSearchParams(location.search).get('resource');
                setInbox(
                    data.inboxes.find((item: EmailInbox) => item.id === requested) ??
                        data.inboxes.find((item: EmailInbox) => item.id === saved?.id) ??
                        data.inboxes[0] ??
                        null,
                );
            })
            .catch((failure) => {
                if (live)
                    setError(
                        failure instanceof Error ? failure.message : 'Unable to load inboxes.',
                    );
            });
        return () => {
            live = false;
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);

    async function clearMessages() {
        if (!inbox) return;
        setBusy(true);
        setError('');
        try {
            await api(`/api/email-inboxes/${inbox.id}/messages`, { method: 'DELETE' });
            setThreads([]);
            setThreadId(null);
            setDetail(null);
            setSelected(null);
            setHasMore(false);
            setShowAll(false);
            setMailVersion((version) => version + 1);
            setInbox({ ...inbox });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to clear messages.');
        } finally {
            setBusy(false);
        }
    }
    async function sendDraft() {
        if (!inbox) return;
        const key = draftKey || crypto.randomUUID();
        setDraftKey(key);
        setBusy(true);
        setError('');
        setSendNotice('');
        try {
            await api(
                `/api/email-inboxes/${inbox.id}/send`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
                    body: JSON.stringify({
                        to: draft.to
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        subject: draft.subject,
                        text: draft.text,
                    }),
                },
                30000,
            );
            setSendNotice(
                'Accepted by the mail relay. Delivery can still fail; check the recipient inbox.',
            );
            setDraft({ to: '', subject: '', text: '' });
            setDraftKey('');
            setMailVersion((version) => version + 1);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Unable to send. Retry the same draft to preserve its retry key.',
            );
        } finally {
            setBusy(false);
        }
    }

    async function saveForwarding() {
        if (!inbox) return;
        setBusy(true);
        setForwardNotice('');
        try {
            await api(`/api/email-inboxes/${inbox.id}/forwarding`, {
                method: 'PUT',
                headers: {
                    ...resourceHeaders(inbox.managementToken ?? ''),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: forwardingUrl.trim() || null }),
            });
            setForwardNotice(
                forwardingUrl.trim()
                    ? 'Forwarding saved. Delivery status is available in the API.'
                    : 'Forwarding disabled.',
            );
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save forwarding.');
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!inbox || inbox.status === 'paused') return;
        const controller = new AbortController();
        void api(`/api/email-inboxes/${inbox.id}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((data) => {
                setForwardingUrl(data.forwardingUrl ?? '');
                setSendingEnabled(data.sendingEnabled === true);
            })
            .catch(() => {});
        const headers = resourceHeaders(inbox.managementToken ?? '');
        void (async () => {
            let lastId: string | undefined;
            try {
                while (!controller.signal.aborted) {
                    const query = new URLSearchParams({ timeoutSeconds: '25' });
                    if (lastId) query.set('after', lastId);
                    const batch = await (
                        await api(
                            `/api/email-inboxes/${inbox.id}/wait?${query}`,
                            { headers, signal: controller.signal },
                            35000,
                        )
                    ).json();
                    if (batch.messages.length) lastId = batch.messages.at(-1).id;
                    setMailVersion((version) => version + 1);
                }
            } catch (failure) {
                if (controller.signal.aborted) return;
                if (failure instanceof ApiError && failure.status === 404) {
                    remember(null);
                    setInbox(null);
                    setError('That inbox expired. Create a new one.');
                } else setError('Lost the connection. Refresh to keep listening.');
            }
        })();
        return () => controller.abort();
    }, [inbox]);

    const inboxId = inbox?.id;
    const active = inbox?.status !== 'paused';
    useEffect(() => {
        if (!inboxId || !active) return;
        const controller = new AbortController();
        const path = `/api/email-inboxes/${inboxId}/threads?limit=50`;
        void (async () => {
            const readPage = async (cursor?: string) =>
                (
                    await api(path + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), {
                        signal: controller.signal,
                    })
                ).json() as Promise<{ threads: ThreadSummary[]; nextCursor: string | null }>;
            try {
                const first = await readPage();
                const older = showAll && first.nextCursor ? await readPage(first.nextCursor) : null;
                if (controller.signal.aborted) return;
                setThreads(older ? [...first.threads, ...older.threads] : first.threads);
                setHasMore(Boolean(first.nextCursor && !showAll));
            } catch (failure) {
                if (!controller.signal.aborted)
                    setError(
                        failure instanceof Error ? failure.message : 'Unable to load threads.',
                    );
            }
        })();
        return () => controller.abort();
    }, [inboxId, active, mailVersion, showAll]);

    const thread = threads.find((item) => item.id === threadId) ?? threads[0];
    const activeThread = thread?.id;
    const lastAt = thread?.lastAt;
    useEffect(() => {
        if (!inboxId || !activeThread) return;
        const controller = new AbortController();
        void api(`/api/email-inboxes/${inboxId}/threads/${activeThread}`, {
            signal: controller.signal,
        })
            .then((response) => response.json())
            .then(setDetail)
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            });
        return () => controller.abort();
    }, [inboxId, activeThread, lastAt]);

    const messages = detail?.id === activeThread ? (detail?.messages ?? []) : [];
    const current = messages.find((message) => message.id === selected) ?? messages.at(-1);
    const minutes = inbox?.expiresAt
        ? Math.max(0, Math.round((Date.parse(inbox.expiresAt) - Date.now()) / 60000))
        : 0;

    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                title="An inbox your agent can read."
                description="An owned address for any sign-up, verification or application test flow. Read messages, codes and links in one place."
            >
                {inbox && (
                    <Link className="text-link" href="/account/#resources">
                        Manage inboxes
                    </Link>
                )}
                {inbox && (paid || !existing.some((item) => item.status === 'active')) && (
                    <Button
                        size="2"
                        variant="surface"
                        color="gray"
                        disabled={busy}
                        onClick={() => {
                            setInbox(null);
                            setError('');
                        }}
                    >
                        <Icon name="plus" size={14} /> New address
                    </Button>
                )}
            </ToolHeader>
            {error && (
                <div className="alert" role="alert">
                    <span>{error}</span>
                </div>
            )}
            {viewer.status === 'guest' && (
                <div className="dashboard-empty">
                    <h2>Sign in to own an address.</h2>
                    <p>
                        Free includes one random inbox for 1–7 days. Pro includes 10 addresses that
                        stay active while subscribed, with optional custom names.
                    </p>
                    <Link className="button" href="/account/#register">
                        Create a free account
                    </Link>
                </div>
            )}
            {viewer.status === 'loading' && <p role="status">Loading your workspace…</p>}
            {viewer.status === 'user' && (
                <>
                    {existing.length > 0 && (
                        <div className="button-row">
                            <label htmlFor="email-address-select">Your inboxes</label>
                            <Select.Root
                                value={inbox?.id ?? ''}
                                onValueChange={(id) => {
                                    const selected = existing.find((item) => item.id === id);
                                    setThreads([]);
                                    setDetail(null);
                                    setThreadId(null);
                                    setSelected(null);
                                    setHasMore(false);
                                    setShowAll(false);
                                    setInbox(selected ?? null);
                                    setError('');
                                }}
                            >
                                <Select.Trigger
                                    id="email-address-select"
                                    placeholder="Choose an inbox"
                                />
                                <Select.Content>
                                    {existing.map((item) => (
                                        <Select.Item key={item.id} value={item.id}>
                                            {item.address}
                                            {item.status === 'paused' ? ' · Paused' : ''}
                                        </Select.Item>
                                    ))}
                                </Select.Content>
                            </Select.Root>
                        </div>
                    )}
                    {!inbox && (
                        <form
                            className="email-create-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void create();
                            }}
                        >
                            <h2>Create an agent address</h2>
                            {paid ? (
                                <label>
                                    Custom name <span className="muted">(optional)</span>
                                    <TextField.Root
                                        value={localPart}
                                        placeholder="qa-bot-42"
                                        aria-label="Custom address name"
                                        pattern="[a-z0-9-]{3,48}"
                                        onChange={(event) => setLocalPart(event.target.value)}
                                    />
                                    <small>
                                        @socketspace.xyz · Leave blank for a random address.
                                    </small>
                                </label>
                            ) : (
                                <label htmlFor="email-active-days">
                                    Active for
                                    <Select.Root value={activeDays} onValueChange={setActiveDays}>
                                        <Select.Trigger id="email-active-days" />
                                        <Select.Content>
                                            {Array.from({ length: 7 }, (_, index) => (
                                                <Select.Item
                                                    key={index + 1}
                                                    value={String(index + 1)}
                                                >
                                                    {index + 1} day{index ? 's' : ''}
                                                </Select.Item>
                                            ))}
                                        </Select.Content>
                                    </Select.Root>
                                </label>
                            )}
                            <p className="muted">
                                {paid
                                    ? 'This address stays active while your subscription is active. Deleted addresses are never reassigned.'
                                    : 'One active inbox per workspace. Upgrade before expiry to keep the same address and choose custom names.'}{' '}
                                {!paid && <Link href="/plans/">View Pro</Link>}
                            </p>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Creating…' : 'Create address'}
                            </Button>
                        </form>
                    )}
                </>
            )}
            {inbox && (
                <>
                    <div className="endpoint-bar">
                        <span className="endpoint-label">YOUR ADDRESS</span>
                        <code className="endpoint-url">{inbox.address}</code>
                        <CopyButton text={inbox.address} label="Copy address" />
                        <span className="expiry">
                            <Icon name="clock" size={13} />{' '}
                            {inbox.expiresAt === null
                                ? 'Active while subscribed'
                                : minutes >= 120
                                  ? `${Math.round(minutes / 60)}h left`
                                  : `${minutes}m left`}
                        </span>
                    </div>
                    {inbox.status === 'paused' && (
                        <p className="alert">
                            This address is paused.{' '}
                            <Link href="/plans/">Restore your subscription</Link> to receive mail
                            before the grace period ends.
                        </p>
                    )}
                    {sendingEnabled && !requireApproval && inbox.status !== 'paused' && (
                        <details className="connection-details">
                            <summary>Send an email</summary>
                            <form
                                className="email-create-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void sendDraft();
                                }}
                            >
                                <label>
                                    To
                                    <TextField.Root
                                        type="text"
                                        required
                                        value={draft.to}
                                        placeholder="recipient@example.com"
                                        onChange={(event) => {
                                            setDraft({ ...draft, to: event.target.value });
                                            setDraftKey('');
                                        }}
                                    />
                                    <small>
                                        Separate recipients with commas. Free allows 3; Pro and Team
                                        allow 10.
                                    </small>
                                </label>
                                <label>
                                    Subject
                                    <TextField.Root
                                        required
                                        maxLength={998}
                                        value={draft.subject}
                                        onChange={(event) => {
                                            setDraft({ ...draft, subject: event.target.value });
                                            setDraftKey('');
                                        }}
                                    />
                                </label>
                                <label>
                                    Message
                                    <TextArea
                                        required
                                        value={draft.text}
                                        onChange={(event) => {
                                            setDraft({ ...draft, text: event.target.value });
                                            setDraftKey('');
                                        }}
                                    />
                                </label>
                                <p className="muted">
                                    An agent attribution and unsubscribe link are added
                                    automatically. Daily allowances count each recipient delivery. A
                                    failed or uncertain send keeps the same retry key.
                                </p>
                                <Button type="submit" disabled={busy}>
                                    {busy ? 'Sending…' : 'Send email'}
                                </Button>
                                {sendNotice && <p role="status">{sendNotice}</p>}
                            </form>
                        </details>
                    )}
                    <EmailDrafts
                        key={`drafts-${inbox.id}`}
                        id={inbox.id}
                        canWrite={viewer.status === 'user' && viewer.role !== 'viewer'}
                        canSend={sendingEnabled && inbox.status !== 'paused'}
                        requireApproval={requireApproval}
                        canResubmit={canManage}
                        replyTo={current?.direction !== 'outbound' ? current?.id : undefined}
                    />
                    <EmailInboxRules
                        key={`rules-${inbox.id}`}
                        id={inbox.id}
                        canEdit={canManage}
                        onApprovalChange={setRequireApproval}
                    />
                    <div className="email-layout">
                        <aside className="email-list" aria-label="Email threads">
                            <div className="email-list-heading">
                                <span className="status-dot" />{' '}
                                {threads.length ? 'Email threads' : 'Waiting for mail…'}
                                {threads.length > 0 && (
                                    <AlertDialog.Root>
                                        <AlertDialog.Trigger>
                                            <Button
                                                variant="ghost"
                                                size="1"
                                                color="gray"
                                                disabled={busy}
                                            >
                                                Clear messages
                                            </Button>
                                        </AlertDialog.Trigger>
                                        <AlertDialog.Content>
                                            <AlertDialog.Title>
                                                Delete all stored messages?
                                            </AlertDialog.Title>
                                            <AlertDialog.Description>
                                                This permanently removes this inbox’s message
                                                content and frees its storage. The address stays
                                                active. Restart event cursors after clearing it.
                                            </AlertDialog.Description>
                                            <div className="dialog-actions">
                                                <AlertDialog.Cancel>
                                                    <Button variant="soft">Keep messages</Button>
                                                </AlertDialog.Cancel>
                                                <AlertDialog.Action>
                                                    <Button
                                                        color="red"
                                                        onClick={() => {
                                                            void clearMessages();
                                                        }}
                                                    >
                                                        Delete messages
                                                    </Button>
                                                </AlertDialog.Action>
                                            </div>
                                        </AlertDialog.Content>
                                    </AlertDialog.Root>
                                )}
                            </div>
                            {threads.length ? (
                                threads.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={activeThread === item.id}
                                        onClick={() => {
                                            setThreadId(item.id);
                                            setSelected(null);
                                            setShowHtml(false);
                                        }}
                                    >
                                        <strong>{item.subject || '(no subject)'}</strong>
                                        <span>{item.from}</span>
                                        <time>
                                            {item.messageCount}{' '}
                                            {item.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                                            {new Date(item.lastAt).toLocaleDateString()}
                                        </time>
                                    </button>
                                ))
                            ) : (
                                <p>
                                    Use this address for a workflow you are authorized to run. Mail
                                    usually arrives within a few seconds.
                                </p>
                            )}
                            {hasMore && (
                                <Button
                                    type="button"
                                    variant="soft"
                                    size="2"
                                    disabled={busy}
                                    onClick={() => setShowAll(true)}
                                >
                                    Load more threads
                                </Button>
                            )}
                        </aside>
                        <section className="email-detail" aria-label="Selected thread">
                            {current ? (
                                <>
                                    {messages.length > 1 && (
                                        <label className="email-thread-messages">
                                            Message in thread
                                            <Select.Root
                                                value={current.id}
                                                onValueChange={(id) => {
                                                    setSelected(id);
                                                    setShowHtml(false);
                                                }}
                                            >
                                                <Select.Trigger aria-label="Message in thread" />
                                                <Select.Content>
                                                    {messages.map((message, index) => (
                                                        <Select.Item
                                                            key={message.id}
                                                            value={message.id}
                                                        >
                                                            {index + 1}. {message.from} ·{' '}
                                                            {new Date(
                                                                message.receivedAt,
                                                            ).toLocaleString()}
                                                        </Select.Item>
                                                    ))}
                                                </Select.Content>
                                            </Select.Root>
                                        </label>
                                    )}
                                    <h2>{current.subject || '(no subject)'}</h2>
                                    <p className="email-from">
                                        {current.from} ·{' '}
                                        {new Date(current.receivedAt).toLocaleString()}
                                    </p>
                                    {current.to && (
                                        <p className="email-from">
                                            To {current.to}
                                            {current.cc?.length
                                                ? ` · Cc ${current.cc.join(', ')}`
                                                : ''}
                                        </p>
                                    )}
                                    {(current.codes.length > 0 ||
                                        current.links.some(
                                            (link) => link.kind === 'verification',
                                        )) && (
                                        <div className="email-extracted">
                                            {current.codes.map((code) => (
                                                <div key={code} className="email-code">
                                                    <span>Code</span>
                                                    <strong>{code}</strong>
                                                    <CopyButton
                                                        text={code}
                                                        label="Copy code"
                                                        compact
                                                    />
                                                </div>
                                            ))}
                                            {current.links
                                                .filter((link) => link.kind === 'verification')
                                                .slice(0, 3)
                                                .map((link) => (
                                                    <div key={link.url} className="email-link">
                                                        <span>Verification link</span>
                                                        <code>{link.url}</code>
                                                        <a
                                                            className="button button-small"
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer nofollow"
                                                        >
                                                            Open
                                                        </a>
                                                        <CopyButton
                                                            text={link.url}
                                                            label="Copy link"
                                                            compact
                                                        />
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                    {current.html && (
                                        <div className="button-row">
                                            <Button
                                                size="1"
                                                variant="surface"
                                                color="gray"
                                                onClick={() => setShowHtml(!showHtml)}
                                            >
                                                {showHtml ? 'Show text' : 'Show HTML'}
                                            </Button>
                                        </div>
                                    )}
                                    {showHtml && current.html ? (
                                        <iframe
                                            className="email-html"
                                            title="Email HTML"
                                            sandbox=""
                                            referrerPolicy="no-referrer"
                                            srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${current.html}`}
                                        />
                                    ) : (
                                        <pre className="email-text">
                                            {current.text || '(empty body)'}
                                        </pre>
                                    )}
                                    {current.attachments.length > 0 && (
                                        <div className="email-from">
                                            <h3>Attachments</h3>
                                            <p>
                                                Untrusted files. Download only if you expect them.
                                            </p>
                                            {current.attachments.map((item, index) => (
                                                <p key={item.id ?? index}>
                                                    {item.filename || 'Unnamed file'} (
                                                    {item.size.toLocaleString()} B)
                                                    {item.id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="1"
                                                            aria-label={`Download ${item.filename || 'attachment'}`}
                                                            onClick={() => {
                                                                void api(
                                                                    `/api/email-inboxes/${inbox!.id}/messages/${current.id}/attachments/${item.id}`,
                                                                )
                                                                    .then((response) =>
                                                                        response.json(),
                                                                    )
                                                                    .then((link) => {
                                                                        window.location.assign(
                                                                            link.downloadUrl,
                                                                        );
                                                                    })
                                                                    .catch((failure) =>
                                                                        setError(failure.message),
                                                                    );
                                                            }}
                                                        >
                                                            Download
                                                        </Button>
                                                    )}
                                                    {!item.id && ' · Metadata only'}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="detail-empty">
                                    <Icon name="mail" size={30} />
                                    <h3>Nothing yet.</h3>
                                    <p>Messages appear here the moment they arrive.</p>
                                </div>
                            )}
                        </section>
                    </div>
                    <details className="connection-details">
                        <summary>Forward mail to a webhook · Pro</summary>
                        {!paid ? (
                            <p className="connection-content">
                                <Link href="/plans/">Upgrade to Pro</Link> to forward received
                                messages. Forwarding pauses when the paid plan ends.
                            </p>
                        ) : (
                            <form
                                className="connection-content"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void saveForwarding();
                                }}
                            >
                                <label>
                                    Webhook URL
                                    <TextField.Root
                                        type="url"
                                        value={forwardingUrl}
                                        placeholder="https://your-app.com/hooks/email"
                                        onChange={(event) => setForwardingUrl(event.target.value)}
                                    />
                                </label>
                                <p>
                                    Received messages stay in this inbox. Forwarding makes one
                                    delivery attempt; an empty URL disables it.
                                </p>
                                <Button type="submit" disabled={busy}>
                                    Save forwarding
                                </Button>
                                {forwardNotice && <p role="status">{forwardNotice}</p>}
                            </form>
                        )}
                    </details>
                    <details className="connection-details">
                        <summary>Use it from code or an agent</summary>
                        <div className="connection-content">
                            <p>Wait for the next message and read its code:</p>
                            <div className="code-row">
                                <code>{`curl -H 'Authorization: Bearer YOUR_WORKSPACE_API_KEY' \\\n  '${typeof location === 'undefined' ? 'https://socket.help' : location.origin}/api/email-inboxes/${inbox.id}/wait'`}</code>
                                <CopyButton
                                    text={`curl -H 'Authorization: Bearer YOUR_WORKSPACE_API_KEY' '${typeof location === 'undefined' ? 'https://socket.help' : location.origin}/api/email-inboxes/${inbox.id}/wait'`}
                                    label="Copy command"
                                    compact
                                />
                            </div>
                            <p>
                                Agents use <code>create_email_inbox</code> and{' '}
                                <code>wait_for_email</code> over MCP.{' '}
                                <Link href="/connect/">Connect your agent →</Link>
                            </p>
                        </div>
                    </details>
                </>
            )}
        </div>
    );
}
