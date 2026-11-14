'use client';

import Link from 'next/link';
import { plans } from '@kivel.io/tools/plans';
import { siteOrigin } from '../lib/site';
import { legacyAccountLink } from '../lib/app-routes';
import { useEffect, useState } from 'react';
import { AlertDialog, Button, Select, TextArea, TextField } from '@radix-ui/themes';
import { api, ApiError, resourceHeaders } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { EmailInboxAccess } from './email-inbox-access';
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
    read?: boolean;
    labels?: string[];
}

interface ThreadSummary {
    id: string;
    subject: string;
    from: string;
    lastAt: string;
    messageCount: number;
    unread?: boolean;
    hasCode?: boolean;
    hasLink?: boolean;
    hasAttachment?: boolean;
    labels?: string[];
}

interface Delivery {
    messageId: string;
    pending: boolean;
    attempts: { at: string; status?: number; error?: string }[];
}
function EmailTags({
    code,
    link,
    file,
    unread,
    labels,
}: {
    code?: boolean;
    link?: boolean;
    file?: boolean;
    unread?: boolean;
    labels?: string[];
}) {
    const values = [unread && 'Unread', code && 'Code', link && 'Link', file && 'Attachment'];
    return (
        <span className="email-tags">
            {values.map(
                (value) =>
                    value && (
                        <span key={value} className="email-tag">
                            {value}
                        </span>
                    ),
            )}
            {labels?.map((label) => (
                <span key={label} className="email-tag">
                    {label}
                </span>
            ))}
        </span>
    );
}

function emailPreview(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const blocked = template.content.querySelectorAll(
        'script, style, meta, base, link, svg, math, iframe, object, embed, video, audio, template',
    );
    blocked.forEach((node) => node.remove());
    const allowed =
        /^(p|div|span|br|hr|strong|b|em|i|u|h[1-6]|pre|code|blockquote|ul|ol|li|table|thead|tbody|tr|th|td)$/;
    const output = document.createElement('div');
    for (const node of template.content.querySelectorAll('*')) {
        for (const attribute of Array.from(node.attributes)) node.removeAttribute(attribute.name);
        if (!allowed.test(node.localName)) node.replaceWith(...node.childNodes);
    }
    output.append(template.content);
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">${output.innerHTML}`;
}

const KEY = 'kivel-email-inbox';
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
    const [searchText, setSearchText] = useState('');
    const [filter, setFilter] = useState('all');
    const [searchSubject, setSearchSubject] = useState('');
    const [searchPage, setSearchPage] = useState<{
        inboxId: string;
        subject: string;
        filter: string;
        messages: EmailMessage[];
        nextCursor: string | null;
    }>();
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [searchSelected, setSearchSelected] = useState<string>();
    const [threadId, setThreadId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [detail, setDetail] = useState<{ id: string; messages: EmailMessage[] } | null>(null);
    const [mailVersion, setMailVersion] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [previewMessage, setPreviewMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [activeDays, setActiveDays] = useState('3');
    const [localPart, setLocalPart] = useState('');
    const [existing, setExisting] = useState<EmailInbox[]>([]);
    const [forwardingUrl, setForwardingUrl] = useState('');
    const [forwardNotice, setForwardNotice] = useState('');
    const [forwardSecret, setForwardSecret] = useState('');
    const [deliveries, setDeliveries] = useState<Delivery[]>();
    const [forwardLoading, setForwardLoading] = useState(false);
    const [triageError, setTriageError] = useState('');
    const canWrite = viewer.status === 'user' && viewer.role !== 'viewer';
    const [requireApproval, setRequireApproval] = useState(false);
    const [sendingEnabled, setSendingEnabled] = useState(false);
    const [draft, setDraft] = useState({
        to: '',
        subject: '',
        text: '',
        replyTo: undefined as string | undefined,
    });
    const [composeOpen, setComposeOpen] = useState(false);
    const [draftKey, setDraftKey] = useState('');
    const [sendNotice, setSendNotice] = useState('');
    const allowance =
        plans[
            viewer.status !== 'user'
                ? 'anonymous'
                : viewer.plan === 'pro' || viewer.plan === 'team'
                  ? viewer.plan
                  : 'free'
        ];
    const activeCount = existing.filter((item) => item.status === 'active').length;
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
                const query = new URLSearchParams(location.search);
                const requested = query.get('inbox') ?? query.get('id') ?? query.get('resource');
                if (requested) setThreadId(query.get('thread'));
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
                        replyTo: draft.replyTo,
                    }),
                },
                30000,
            );
            setSendNotice(
                'Accepted by the mail relay. Delivery can still fail; check the recipient inbox.',
            );
            setDraft({ to: '', subject: '', text: '', replyTo: undefined });
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
            const response = await api(`/api/email-inboxes/${inbox.id}/forwarding`, {
                method: 'PUT',
                headers: {
                    ...resourceHeaders(inbox.managementToken ?? ''),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: forwardingUrl.trim() || null }),
            });
            setForwardSecret((await response.json()).signingSecret ?? '');
            setForwardNotice(forwardingUrl.trim() ? 'Forwarding saved.' : 'Forwarding disabled.');
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
    }, [inboxId, activeThread, lastAt, mailVersion]);

    const messages = detail?.id === activeThread ? (detail?.messages ?? []) : [];
    useEffect(() => {
        setSearchText('');
        setFilter('all');
        setSearchSubject('');
        setSearchSelected(undefined);
        setSearchPage(undefined);
    }, [inboxId]);
    useEffect(() => {
        if (!inboxId || (!searchSubject && filter === 'all')) {
            setSearching(false);
            setSearchPage(undefined);
            return;
        }
        const controller = new AbortController();
        setSearching(true);
        setSearchError('');
        const params = searchParams();
        void api(`/api/email-inboxes/${inboxId}/messages?${params}`, { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => {
                if (!controller.signal.aborted)
                    setSearchPage({ ...value, inboxId, subject: searchSubject, filter });
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setSearchError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setSearching(false);
            });
        return () => controller.abort();
    }, [inboxId, searchSubject, filter, mailVersion]);
    const results =
        searchPage?.inboxId === inboxId &&
        searchPage?.subject === searchSubject &&
        searchPage?.filter === filter
            ? searchPage
            : undefined;
    const searchingMessages = Boolean(searchSubject) || filter !== 'all';
    function searchParams() {
        const params = new URLSearchParams({ limit: '50' });
        if (searchSubject) params.set('subject', searchSubject);
        if (filter !== 'all') params.set(filter, 'true');
        return params;
    }
    async function moreSearchResults() {
        if (!results?.nextCursor || searching) return;
        setSearching(true);
        setSearchError('');
        const params = searchParams();
        params.set('cursor', results.nextCursor);
        try {
            const page = await (
                await api(`/api/email-inboxes/${results.inboxId}/messages?${params}`)
            ).json();
            setSearchPage((current) =>
                current === results
                    ? {
                          ...current,
                          messages: [...current.messages, ...page.messages],
                          nextCursor: page.nextCursor,
                      }
                    : current,
            );
        } catch (failure) {
            setSearchError(
                failure instanceof Error ? failure.message : 'Unable to load more email.',
            );
        } finally {
            setSearching(false);
        }
    }
    const current = searchingMessages
        ? (results?.messages.find((message) => message.id === searchSelected) ??
          results?.messages[0])
        : (messages.find((message) => message.id === selected) ?? messages.at(-1));
    useEffect(() => {
        setForwardSecret('');
        setForwardNotice('');
        setDeliveries(undefined);
        setDraft({ to: '', subject: '', text: '', replyTo: undefined });
        setComposeOpen(false);
        setDraftKey('');
        setTriageError('');
        setSendNotice('');
        setPreviewMessage('');
    }, [inboxId]);

    async function updateMessage(
        message: EmailMessage,
        update: { read?: boolean; labels?: string[] },
    ) {
        if (!inbox) return;
        setTriageError('');
        try {
            await api(`/api/email-inboxes/${inbox.id}/messages/${message.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(update),
            });
            setMailVersion((version) => version + 1);
        } catch (failure) {
            setTriageError(
                failure instanceof Error ? failure.message : 'Unable to update message.',
            );
        }
    }

    async function loadDeliveries() {
        if (!inbox) return;
        setForwardLoading(true);
        try {
            const response = await api(`/api/email-inboxes/${inbox.id}/deliveries`);
            setDeliveries((await response.json()).deliveries);
        } catch (failure) {
            setForwardNotice(
                failure instanceof Error ? failure.message : 'Unable to load delivery history.',
            );
        } finally {
            setForwardLoading(false);
        }
    }

    const minutes = inbox?.expiresAt
        ? Math.max(0, Math.round((Date.parse(inbox.expiresAt) - Date.now()) / 60000))
        : 0;

    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                title="An inbox your agent can read."
                description="Receive messages, extract codes and links, and reply from a workspace inbox."
            >
                {inbox && (
                    <Link className="text-link" href={legacyAccountLink('/account/#resources')}>
                        Manage inboxes
                    </Link>
                )}
            </ToolHeader>
            {error && (
                <div className="alert" role="alert">
                    <span>{error}</span>
                </div>
            )}
            {viewer.status === 'guest' && (
                <div className="dashboard-empty">
                    <h2>Sign in to create an inbox</h2>
                    <p>
                        Create an inbox to receive messages, extract codes and reply from your
                        workspace.
                    </p>
                    <Link className="button" href={legacyAccountLink('/account/#register')}>
                        Create a free account
                    </Link>
                </div>
            )}
            {viewer.status === 'loading' && (
                <div className="email-skeleton" role="status" aria-label="Loading email inboxes">
                    <span />
                    <span />
                    <span />
                </div>
            )}
            {viewer.status === 'user' && (
                <>
                    {existing.length > 0 && (
                        <div className="button-row email-inbox-controls">
                            <label htmlFor="email-address-select">Inbox</label>
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
                            {inbox && canWrite && activeCount < allowance.emailInboxes && (
                                <Button
                                    size="2"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setInbox(null);
                                        setError('');
                                    }}
                                >
                                    <Icon name="plus" size={14} /> New inbox
                                </Button>
                            )}
                        </div>
                    )}
                    {canWrite && !inbox && (
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
                                        pattern="[a-z0-9\-]{3,48}"
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
                                    : 'Upgrade before expiry to keep the same address and choose a custom name.'}{' '}
                                {!paid && <Link href={`${siteOrigin}/pricing/`}>View Pro</Link>}
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
                    {inbox.status === 'paused' && (
                        <p className="alert">
                            This address is paused.{' '}
                            <Link href={`${siteOrigin}/pricing/`}>Restore your subscription</Link>{' '}
                            to receive mail before the grace period ends.
                        </p>
                    )}
                    <div className="email-layout">
                        <aside className="email-list" aria-label="Email threads">
                            <div className="email-address-card">
                                <span>Agent inbox</span>
                                <div>
                                    <code>{inbox.address}</code>
                                    <CopyButton text={inbox.address} label="Copy address" compact />
                                </div>
                                <small>
                                    {inbox.expiresAt === null
                                        ? 'Active while subscribed'
                                        : minutes >= 120
                                          ? `${Math.round(minutes / 60)} hours left`
                                          : `${minutes} minutes left`}
                                    {inbox.status === 'paused' && ' · Paused'}
                                </small>
                            </div>
                            <div className="email-inbox-meter">
                                <span>
                                    {activeCount} of {allowance.emailInboxes} inboxes in use
                                </span>
                                <progress
                                    aria-label="Email inbox allowance"
                                    value={activeCount}
                                    max={allowance.emailInboxes}
                                />
                            </div>
                            <div
                                className="email-filter-row"
                                role="group"
                                aria-label="Filter messages"
                            >
                                {[
                                    ['all', 'All'],
                                    ['hasCode', 'Codes'],
                                    ['hasLink', 'Links'],
                                    ['hasAttachment', 'Attachments'],
                                ].map(([value, title]) => (
                                    <Button
                                        type="button"
                                        key={value}
                                        size="1"
                                        variant={filter === value ? 'solid' : 'surface'}
                                        aria-pressed={filter === value}
                                        onClick={() => {
                                            setFilter(value!);
                                            setSearchSelected(undefined);
                                            setPreviewMessage('');
                                        }}
                                    >
                                        {title}
                                    </Button>
                                ))}
                            </div>
                            <div className="email-list-heading">
                                <span className="status-dot" />{' '}
                                {threads.length ? 'Email threads' : 'Waiting for mail…'}
                                {canWrite && threads.length > 0 && (
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
                            <form
                                className="email-subject-search"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    setSearchSelected(undefined);
                                    setSearchSubject(searchText.trim());
                                    setPreviewMessage('');
                                }}
                            >
                                <TextField.Root
                                    aria-label="Search email subjects"
                                    placeholder="Search subjects"
                                    maxLength={254}
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                                <Button type="submit" variant="soft">
                                    Search
                                </Button>
                                {searchSubject && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setSearchText('');
                                            setSearchSubject('');
                                            setPreviewMessage('');
                                        }}
                                    >
                                        Clear search
                                    </Button>
                                )}
                            </form>
                            {searchingMessages ? (
                                searchError ? (
                                    <p role="alert">{searchError}</p>
                                ) : searching ? (
                                    <p role="status">Searching email</p>
                                ) : results?.messages.length ? (
                                    results.messages.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            aria-pressed={current?.id === item.id}
                                            onClick={() => {
                                                setSearchSelected(item.id);
                                                setPreviewMessage('');
                                            }}
                                        >
                                            <strong>{item.subject || 'No subject'}</strong>
                                            <span>{item.from}</span>
                                            <EmailTags
                                                code={Boolean(item.codes.length)}
                                                link={Boolean(item.links.length)}
                                                file={Boolean(item.attachments.length)}
                                                unread={item.direction !== 'outbound' && !item.read}
                                                labels={item.labels}
                                            />
                                        </button>
                                    ))
                                ) : (
                                    <p>No messages match these filters.</p>
                                )
                            ) : threads.length ? (
                                threads.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-pressed={activeThread === item.id}
                                        onClick={() => {
                                            setThreadId(item.id);
                                            setSelected(null);
                                            setPreviewMessage('');
                                        }}
                                    >
                                        <strong>{item.subject || '(no subject)'}</strong>
                                        <span>{item.from}</span>
                                        <time>
                                            {item.messageCount}{' '}
                                            {item.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                                            {new Date(item.lastAt).toLocaleDateString()}
                                        </time>
                                        <EmailTags
                                            code={item.hasCode}
                                            link={item.hasLink}
                                            file={item.hasAttachment}
                                            unread={item.unread}
                                            labels={item.labels}
                                        />
                                    </button>
                                ))
                            ) : (
                                <p>
                                    Use this address for a workflow you are authorized to run. Mail
                                    usually arrives within a few seconds.
                                </p>
                            )}
                            {results?.nextCursor && (
                                <Button
                                    type="button"
                                    variant="soft"
                                    size="2"
                                    disabled={searching}
                                    onClick={() => void moreSearchResults()}
                                >
                                    Load more results
                                </Button>
                            )}
                            {!searchSubject && hasMore && (
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
                                    {!searchingMessages && messages.length > 1 && (
                                        <label className="email-thread-messages">
                                            Message in thread
                                            <Select.Root
                                                value={current.id}
                                                onValueChange={(id) => {
                                                    setSelected(id);
                                                    setPreviewMessage('');
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
                                    <div className="email-message-heading">
                                        <span className="email-sender-mark" aria-hidden="true">
                                            {current.from.trim().charAt(0).toUpperCase() || '@'}
                                        </span>
                                        <div>
                                            <h2>{current.subject || 'No subject'}</h2>
                                            <p className="email-from">
                                                {current.from} ·{' '}
                                                {new Date(current.receivedAt).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    {current.to && (
                                        <p className="email-from">
                                            To {current.to}
                                            {current.cc?.length
                                                ? ` · Cc ${current.cc.join(', ')}`
                                                : ''}
                                        </p>
                                    )}
                                    {canWrite && (
                                        <div className="email-action-row">
                                            <Button
                                                size="1"
                                                variant="soft"
                                                onClick={() =>
                                                    void updateMessage(current, {
                                                        read: !current.read,
                                                    })
                                                }
                                            >
                                                {current.read ? 'Mark unread' : 'Mark read'}
                                            </Button>
                                            {sendingEnabled &&
                                                !requireApproval &&
                                                current.direction !== 'outbound' &&
                                                inbox.status !== 'paused' && (
                                                    <Button
                                                        size="1"
                                                        variant="soft"
                                                        onClick={() => {
                                                            setDraft({
                                                                to: (
                                                                    /<([^<>]+)>\s*$/.exec(
                                                                        current.from,
                                                                    )?.[1] ?? current.from
                                                                ).trim(),
                                                                subject: /^re:/i.test(
                                                                    current.subject,
                                                                )
                                                                    ? current.subject
                                                                    : `Re: ${current.subject}`,
                                                                text: '',
                                                                replyTo: current.id,
                                                            });
                                                            setDraftKey('');
                                                            setComposeOpen(true);
                                                            requestAnimationFrame(() => {
                                                                document
                                                                    .getElementById('email-compose')
                                                                    ?.scrollIntoView({
                                                                        block: 'nearest',
                                                                    });
                                                                document
                                                                    .querySelector<HTMLInputElement>(
                                                                        '#email-compose input',
                                                                    )
                                                                    ?.focus();
                                                            });
                                                        }}
                                                    >
                                                        Reply
                                                    </Button>
                                                )}
                                            <form
                                                key={`${current.id}:${current.labels?.join(',')}`}
                                                onSubmit={(event) => {
                                                    event.preventDefault();
                                                    const labels = String(
                                                        new FormData(event.currentTarget).get(
                                                            'labels',
                                                        ) ?? '',
                                                    )
                                                        .split(',')
                                                        .map((label) => label.trim())
                                                        .filter(Boolean);
                                                    void updateMessage(current, { labels });
                                                }}
                                            >
                                                <TextField.Root
                                                    name="labels"
                                                    aria-label="Message labels"
                                                    placeholder="Labels separated by commas"
                                                    defaultValue={current.labels?.join(', ')}
                                                    maxLength={330}
                                                />
                                                <Button type="submit" size="1" variant="soft">
                                                    Save labels
                                                </Button>
                                            </form>
                                        </div>
                                    )}
                                    {triageError && <p role="alert">{triageError}</p>}
                                    {(current.codes.length > 0 ||
                                        current.links.some(
                                            (link) => link.kind === 'verification',
                                        )) && (
                                        <div className="email-extracted">
                                            {current.codes.map((code) => (
                                                <div key={code} className="email-code">
                                                    <span>Code found</span>
                                                    <strong>
                                                        {/^\d{6}$/.test(code)
                                                            ? code.replace(/^(...)/, '$1 ')
                                                            : code}
                                                    </strong>
                                                    <CopyButton
                                                        text={code.replace(/\s/g, '')}
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
                                                onClick={() =>
                                                    setPreviewMessage(
                                                        previewMessage === current.id
                                                            ? ''
                                                            : current.id,
                                                    )
                                                }
                                            >
                                                {previewMessage === current.id
                                                    ? 'Show text'
                                                    : 'Show HTML'}
                                            </Button>
                                        </div>
                                    )}
                                    {previewMessage === current.id && current.html ? (
                                        <iframe
                                            className="email-html"
                                            title="Email HTML"
                                            sandbox=""
                                            referrerPolicy="no-referrer"
                                            srcDoc={emailPreview(current.html)}
                                        />
                                    ) : (
                                        <pre className="email-text">
                                            {current.text || '(empty body)'}
                                        </pre>
                                    )}
                                    <ol className="email-timeline" aria-label="Message timeline">
                                        <li>
                                            <strong>
                                                {current.direction === 'outbound'
                                                    ? 'Outgoing message'
                                                    : 'Email arrived'}
                                            </strong>
                                            <time dateTime={current.receivedAt}>
                                                {new Date(current.receivedAt).toLocaleTimeString()}
                                            </time>
                                        </li>
                                        {current.codes.length > 0 && (
                                            <li>
                                                <strong>Code extracted</strong>
                                            </li>
                                        )}
                                        {current.links.length > 0 && (
                                            <li>
                                                <strong>Links extracted</strong>
                                            </li>
                                        )}
                                        {current.attachments.length > 0 && (
                                            <li>
                                                <strong>Attachments received</strong>
                                            </li>
                                        )}
                                    </ol>
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
                                    <h3>Waiting for email</h3>
                                    <p>
                                        Send a message to this address. It will appear here with any
                                        codes, links and attachments.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>
                    {canWrite &&
                        sendingEnabled &&
                        !requireApproval &&
                        inbox.status !== 'paused' && (
                            <details
                                className="connection-details"
                                id="email-compose"
                                open={composeOpen}
                                onToggle={(event) => setComposeOpen(event.currentTarget.open)}
                            >
                                <summary>
                                    {draft.replyTo ? 'Reply to email' : 'Send an email'}
                                </summary>
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
                                            Separate up to {allowance.emailRecipients} recipients
                                            with commas.
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
                                        automatically. Daily allowances count each recipient
                                        delivery. A failed or uncertain send keeps the same retry
                                        key.
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
                        canWrite={canWrite}
                        canSend={sendingEnabled && inbox.status !== 'paused'}
                        requireApproval={requireApproval}
                        canResubmit={canManage}
                        replyTo={current && current.direction !== 'outbound' ? current : undefined}
                    />
                    <EmailInboxRules
                        key={`rules-${inbox.id}`}
                        id={inbox.id}
                        canEdit={canManage}
                        onApprovalChange={setRequireApproval}
                    />
                    {canManage && <EmailInboxAccess key={inbox.id} id={inbox.id} />}
                    <details className="connection-details">
                        <summary>Forward mail to a webhook · Pro</summary>
                        {!paid ? (
                            <p className="connection-content">
                                <Link href={`${siteOrigin}/pricing/`}>Upgrade to Pro</Link> to
                                forward received messages. Forwarding pauses when the paid plan
                                ends.
                            </p>
                        ) : (
                            <div className="connection-content email-settings">
                                {canWrite && (
                                    <form
                                        className="email-create-form"
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
                                                onChange={(event) =>
                                                    setForwardingUrl(event.target.value)
                                                }
                                            />
                                        </label>
                                        <p>
                                            Messages stay in this inbox. Kivel signs each delivery
                                            and retries network failures. Clear the URL to disable
                                            forwarding.
                                        </p>
                                        <Button type="submit" disabled={busy}>
                                            Save forwarding
                                        </Button>
                                    </form>
                                )}
                                {forwardNotice && <p role="status">{forwardNotice}</p>}
                                {forwardSecret && (
                                    <div className="code-row">
                                        <code>{forwardSecret}</code>
                                        <CopyButton
                                            text={forwardSecret}
                                            label="Copy signing secret"
                                        />
                                        <Button
                                            type="button"
                                            size="1"
                                            variant="ghost"
                                            onClick={() => setForwardSecret('')}
                                        >
                                            Hide secret
                                        </Button>
                                    </div>
                                )}
                                <Button
                                    type="button"
                                    size="1"
                                    variant="soft"
                                    disabled={forwardLoading}
                                    onClick={() => void loadDeliveries()}
                                >
                                    {forwardLoading
                                        ? 'Loading…'
                                        : deliveries
                                          ? 'Refresh delivery history'
                                          : 'View delivery history'}
                                </Button>
                                {deliveries?.length === 0 && <p>No deliveries yet.</p>}
                                {deliveries?.map((delivery) => (
                                    <details key={delivery.messageId}>
                                        <summary>
                                            {delivery.pending
                                                ? 'Pending'
                                                : (delivery.attempts.at(-1)?.status ??
                                                  'Failed')}{' '}
                                            · {delivery.messageId}
                                        </summary>
                                        <ul>
                                            {delivery.attempts.map((attempt, index) => (
                                                <li key={index}>
                                                    {new Date(attempt.at).toLocaleString()} ·{' '}
                                                    {attempt.status
                                                        ? `HTTP ${attempt.status}`
                                                        : attempt.error}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ))}
                            </div>
                        )}
                    </details>
                    <details className="connection-details">
                        <summary>Use it from code or an agent</summary>
                        <div className="connection-content">
                            <p>Wait for the next message and read its code:</p>
                            <div className="code-row">
                                <code>{`curl -H 'Authorization: Bearer YOUR_WORKSPACE_API_KEY' \\\n  '${siteOrigin}/api/email-inboxes/${inbox.id}/wait'`}</code>
                                <CopyButton
                                    text={`curl -H 'Authorization: Bearer YOUR_WORKSPACE_API_KEY' '${siteOrigin}/api/email-inboxes/${inbox.id}/wait'`}
                                    label="Copy command"
                                    compact
                                />
                            </div>
                            <p>
                                Agents use <code>create_email_inbox</code> and{' '}
                                <code>wait_for_email</code> over MCP.{' '}
                                <Link href={`${siteOrigin}/connect/`}>Connect your agent →</Link>
                            </p>
                        </div>
                    </details>
                </>
            )}
        </div>
    );
}
