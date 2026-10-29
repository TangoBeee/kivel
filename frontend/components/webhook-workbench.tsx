'use client';

import Link from 'next/link';
import { formatJson } from '@socket-help/tools/engine';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { AlertDialog, Button, Checkbox, IconButton, Tabs } from '@radix-ui/themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { CopyButton } from './copy-button';
import { ToolHeader } from './tool-header';
import { api, ApiError, remember, restore, resourceHeaders } from '../lib/api';
import type { CapturedRequest, Inbox } from '../lib/api';
import { AppSelect, SelectOption } from './app-select';
import { filterRequests } from '../lib/request-filter';
import { useViewer } from '../lib/viewer';
import { InboxResponseSettings } from './inbox-response';
import { InboxForwardSettings } from './inbox-forward';
import { ReplayRequest } from './replay-request';
import type { RequestSearchScope } from '../lib/request-filter';

function timeLeft(seconds: number) {
    const days = Math.floor(seconds / 86400),
        hours = Math.floor((seconds % 86400) / 3600),
        minutes = Math.floor((seconds % 3600) / 60);
    if (days) return `${days}d ${hours}h left`;
    if (hours) return `${hours}h ${minutes}m left`;
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s left`;
}

async function openInbox(id: string, token: string, signal?: AbortSignal): Promise<Inbox> {
    const info = await (
        await api(`/api/inboxes/${id}`, { headers: resourceHeaders(token), signal })
    ).json();
    return { ...info, id, inspectionToken: token, webhookUrl: `${location.origin}/hooks/${id}` };
}

function download(contents: BlobPart, filename: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/octet-stream' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataTable({ values }: { values: Record<string, string | string[]> }) {
    const entries = Object.entries(values);
    return entries.length ? (
        <table className="data-table">
            <tbody>
                {entries.map(([key, value]) => (
                    <tr key={key}>
                        <th scope="row">{key}</th>
                        <td>{Array.isArray(value) ? value.join('\n') : value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    ) : (
        <p className="small muted">No values to display.</p>
    );
}

function Detail({
    request,
    filteredOut = false,
    command = '',
}: {
    request: CapturedRequest | undefined;
    filteredOut?: boolean;
    command?: string;
}) {
    const [tab, setTab] = useState('Body');
    const [pretty, setPretty] = useState(true);
    const displayed = useMemo(() => {
        if (!request) return '';
        if (pretty && request.bodyEncoding === 'utf8') {
            try {
                return formatJson(request.body);
            } catch {}
        }
        return request.body;
    }, [request, pretty]);
    if (!request && !filteredOut && command)
        return (
            <div className="detail-empty detail-first">
                <Icon name="terminal" size={30} />
                <h3>Send your first request.</h3>
                <p>Paste this in a terminal, or point any webhook at your endpoint.</p>
                <div className="code-row">
                    <code>{command}</code>
                    <CopyButton text={command} label="Copy cURL command" compact />
                </div>
            </div>
        );
    if (!request)
        return (
            <div className="detail-empty">
                <Icon name="braces" size={30} />
                <h3>
                    {filteredOut
                        ? 'No requests match these filters.'
                        : 'The details are in the details.'}
                </h3>
                <p>
                    {filteredOut
                        ? 'Clear or change your filters to inspect captured requests.'
                        : 'Send a request to your endpoint, then select it here to see exactly what arrived.'}
                </p>
            </div>
        );
    const tabs = ['Body', 'Headers', 'Query', 'Details'];
    function saveBody() {
        const bytes =
            request!.bodyEncoding === 'base64'
                ? Uint8Array.from(atob(request!.body), (character) => character.charCodeAt(0))
                : new TextEncoder().encode(request!.body);
        download(bytes, `${request!.id}.bin`);
    }
    return (
        <>
            <div className="detail-heading">
                <div>
                    <span className={`method method-${request.method.toLowerCase()}`}>
                        {request.method}
                    </span>
                    <span>{new Date(request.timestamp).toLocaleTimeString()}</span>
                </div>
                <CopyButton text={JSON.stringify(request, null, 2)} label="Copy request" compact />
            </div>
            <Tabs.Root value={tab} onValueChange={setTab}>
                <Tabs.List className="request-tabs" aria-label="Request details">
                    {tabs.map((name) => (
                        <Tabs.Trigger key={name} value={name}>
                            {name}
                            {name === 'Headers' && ` (${Object.keys(request.headers).length})`}
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>
                {tabs.map((name) => (
                    <Tabs.Content key={name} value={name} className="detail-body">
                        {tab === 'Body' && (
                            <>
                                <div className="payload-toolbar">
                                    <span>
                                        {request.bodySize.toLocaleString()} bytes ·{' '}
                                        {request.bodyEncoding === 'base64' ? 'BASE64' : 'UTF-8'}
                                    </span>
                                    <div className="button-row">
                                        {request.bodyEncoding === 'utf8' && (
                                            <label className="compact-toggle">
                                                <Checkbox
                                                    checked={pretty}
                                                    onCheckedChange={(checked) =>
                                                        setPretty(checked === true)
                                                    }
                                                />{' '}
                                                Pretty
                                            </label>
                                        )}
                                        <IconButton
                                            size="2"
                                            variant="surface"
                                            color="gray"
                                            onClick={saveBody}
                                            aria-label="Download request body"
                                        >
                                            <Icon name="download" size={15} />
                                        </IconButton>
                                        <CopyButton text={displayed} label="Copy body" compact />
                                    </div>
                                </div>
                                {request.body ? (
                                    <pre>{displayed}</pre>
                                ) : (
                                    <p className="small muted">This request has no body.</p>
                                )}
                            </>
                        )}
                        {tab === 'Headers' && <DataTable values={request.headers} />}
                        {tab === 'Query' && <DataTable values={request.query} />}
                        {tab === 'Details' && (
                            <DataTable
                                values={{
                                    'Request ID': request.id,
                                    Method: request.method,
                                    Path: request.path,
                                    Received: new Date(request.timestamp).toISOString(),
                                    'Body size': `${request.bodySize} bytes`,
                                    Encoding: request.bodyEncoding,
                                }}
                            />
                        )}
                    </Tabs.Content>
                ))}
            </Tabs.Root>
            <ReplayRequest key={request.id} request={request} />
        </>
    );
}

export default function Webhooks({ toolId = 'webhooks' }: { toolId?: string } = {}) {
    const viewer = useViewer();
    const [inbox, setInbox] = useState<Inbox | null>(null);
    const [visibility, setVisibility] = useState<Visibility>('private');
    const [requests, setRequests] = useState<CapturedRequest[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [live, setLive] = useState(true);
    const [working, setWorking] = useState(false);
    const [requestMethod, setRequestMethod] = useState('all');
    const [searchScope, setSearchScope] = useState<RequestSearchScope>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [clock, setClock] = useState(Date.now());
    const [existingId, setExistingId] = useState('');
    const [existingToken, setExistingToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [confirmation, setConfirmation] = useState<'create' | 'delete' | null>(null);
    const etag = useRef('');
    const inFlight = useRef(false);
    const activeId = useRef<string | null>(null);

    useEffect(() => {
        const requested = new URLSearchParams(location.search).get('resource');
        if (requested && /^[a-f0-9-]{36}$/i.test(requested)) {
            const controller = new AbortController();
            setWorking(true);
            void openInbox(requested, '', controller.signal)
                .then((value) => {
                    if (!controller.signal.aborted) activate(value);
                })
                .catch((failure) => {
                    if (!controller.signal.aborted)
                        setError(
                            failure instanceof Error
                                ? failure.message
                                : 'Unable to open this inbox.',
                        );
                })
                .finally(() => {
                    if (!controller.signal.aborted) setWorking(false);
                });
            return () => controller.abort();
        }
        const value = restore();
        activeId.current = value?.id ?? null;
        setInbox(value);
        if (value) setVisibility(value.visibility ?? 'public');
        // Hand people a working endpoint straight away; crawlers and automation don't need one.
        else if (
            !navigator.webdriver &&
            !/bot|crawl|spider|preview|lighthouse/i.test(navigator.userAgent)
        )
            void createInbox();
        // createInbox only reads state set before this first effect runs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const clear = useCallback(() => {
        activeId.current = null;
        remember(null);
        setInbox(null);
        setRequests([]);
        setSelected(null);
        setRefreshing(false);
        etag.current = '';
    }, []);
    function activate(value: Inbox) {
        setClock(Date.now());
        setShowToken(false);
        activeId.current = value.id;
        remember(value);
        setInbox(value);
        if (value) setVisibility(value.visibility ?? 'public');
        setRequests([]);
        setSelected(null);
        setError('');
        setQuery('');
        setRequestMethod('all');
        setSearchScope('all');
        setLive(true);
        etag.current = '';
    }

    const refresh = useCallback(
        async (signal?: AbortSignal): Promise<number> => {
            if (!inbox || inFlight.current) return 3500;
            inFlight.current = true;
            setRefreshing(true);
            try {
                const response = await api(`/api/inboxes/${inbox.id}/requests`, {
                    headers: {
                        ...resourceHeaders(inbox.inspectionToken),
                        ...(etag.current ? { 'If-None-Match': etag.current } : {}),
                    },
                    signal,
                });
                if (signal?.aborted || activeId.current !== inbox.id) return 3500;
                const accessVersion = response.headers.get('x-access-version');
                const currentVisibility = response.headers.get('x-resource-visibility');
                const expiresAt = response.headers.get('x-resource-expires-at');
                if (
                    accessVersion &&
                    currentVisibility &&
                    expiresAt &&
                    (accessVersion !== inbox.accessVersion || expiresAt !== inbox.expiresAt)
                ) {
                    const updated = {
                        ...inbox,
                        accessVersion,
                        expiresAt,
                        visibility: currentVisibility as Visibility,
                        ...(accessVersion !== inbox.accessVersion
                            ? { accessToken: undefined }
                            : {}),
                    };
                    remember(updated);
                    setInbox(updated);
                    setVisibility(updated.visibility);
                }
                if (response.status !== 304) {
                    const result = await response.json();
                    setRequests(result.requests);
                    etag.current = response.headers.get('etag') ?? '';
                    setSelected((previous) => previous ?? result.requests.at(-1)?.id ?? null);
                }
                setError('');
                return 3500;
            } catch (failure) {
                if (signal?.aborted || activeId.current !== inbox.id) return 3500;
                if (failure instanceof ApiError && failure.status === 404) {
                    clear();
                    setError(
                        'This inbox has expired, was deleted, or its token is no longer valid.',
                    );
                } else if (failure instanceof ApiError && failure.status === 429) {
                    setError('Rate limit reached. Live updates will resume automatically.');
                    return Math.max(5000, failure.retryAfter * 1000);
                } else
                    setError(
                        'Connection interrupted. We’ll retry automatically while live updates are on.',
                    );
                return 10_000;
            } finally {
                inFlight.current = false;
                setRefreshing(false);
            }
        },
        [inbox, clear],
    );

    useEffect(() => {
        if (!inbox) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setClock(now);
            if (Date.parse(inbox.expiresAt) <= now) {
                clear();
                setError('Your inbox has expired. Create a new one whenever you need it.');
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [inbox, clear]);

    useEffect(() => {
        if (!inbox || !live) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            const delay = document.hidden ? 5000 : await refresh(controller.signal);
            if (!controller.signal.aborted) timer = setTimeout(poll, delay);
        }
        void poll();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [inbox, live, refresh]);

    function create() {
        if (inbox) setConfirmation('create');
        else void createInbox();
    }
    async function createInbox() {
        setWorking(true);
        setError('');
        try {
            const created: Inbox = await (
                await api(`/api/inboxes?visibility=${visibility}`, { method: 'POST' })
            ).json();
            const info = await openInbox(created.id, created.inspectionToken).catch(() => created);
            activate({ ...created, ...info, accessToken: created.accessToken });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to create an inbox.');
        } finally {
            setWorking(false);
        }
    }

    async function openExisting(event: React.FormEvent) {
        event.preventDefault();
        setWorking(true);
        setError('');
        const id = existingId.trim();
        const token = existingToken.trim();
        try {
            if (
                !/^[a-f0-9-]{36}$/i.test(id) ||
                (token !== '' && !/^[A-Za-z0-9_-]{43}$/.test(token))
            )
                throw new Error(
                    'Enter a valid inbox ID. A token is required outside your workspace.',
                );
            activate(await openInbox(id, token));
            setExistingToken('');
            setExistingId('');
        } catch (failure) {
            setError(
                failure instanceof ApiError && failure.status === 404
                    ? 'Inbox not found. Check the ID and token, or create a new inbox.'
                    : failure instanceof Error
                      ? failure.message
                      : 'Unable to open this inbox.',
            );
        } finally {
            setWorking(false);
        }
    }

    async function changeSharing(mode: Visibility) {
        setVisibility(mode);
        if (!inbox) return;
        setWorking(true);
        setError('');
        try {
            const sharing = await (
                await api(`/api/inboxes/${inbox.id}/sharing`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...resourceHeaders(inbox.inspectionToken),
                    },
                    body: JSON.stringify({ visibility: mode }),
                })
            ).json();
            const value = { ...inbox, ...sharing, accessToken: sharing.accessToken };
            remember(value);
            setInbox(value);
        } catch (failure) {
            setVisibility(inbox.visibility ?? 'public');
            setError(failure instanceof Error ? failure.message : 'Unable to change sharing.');
        } finally {
            setWorking(false);
        }
    }
    async function remove() {
        if (!inbox) return;
        setWorking(true);
        try {
            await api(`/api/inboxes/${inbox.id}`, {
                method: 'DELETE',
                headers: resourceHeaders(inbox.inspectionToken),
            });
            clear();
            setError('');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to delete this inbox.');
        } finally {
            setWorking(false);
        }
    }

    const remaining = inbox
        ? Math.max(0, Math.ceil((Date.parse(inbox.expiresAt) - clock) / 1000))
        : 0;
    const filtered = useMemo(
        () => filterRequests(requests, query, requestMethod, searchScope),
        [requests, query, requestMethod, searchScope],
    );
    const filtering = !!query.trim() || requestMethod !== 'all';
    const current = filtered.find((request) => request.id === selected) ?? filtered[0];
    const command = inbox
        ? [
              `curl -X POST '${inbox.webhookUrl}'`,
              "-H 'Content-Type: application/json'",
              ...(inbox.visibility === 'private'
                  ? [`-H 'X-Access-Token: ${inbox.accessToken ?? 'YOUR_ACCESS_TOKEN'}'`]
                  : []),
              `-d '{"event":"hello.world"}'`,
          ].join(' \\\n  ')
        : '';

    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                title={toolId === 'webhooks' ? 'Catch every callback.' : undefined}
                description={
                    toolId === 'webhooks'
                        ? 'A temporary endpoint. A clear view of every request.'
                        : undefined
                }
            >
                {inbox && (
                    <Button
                        size="2"
                        variant="surface"
                        color="gray"
                        disabled={working}
                        onClick={() => void create()}
                    >
                        <Icon name="plus" size={15} /> New inbox
                    </Button>
                )}
            </ToolHeader>
            {error && (
                <div className="alert" role="alert">
                    <span>{error}</span>
                    <IconButton
                        size="2"
                        variant="surface"
                        color="gray"
                        onClick={() => setError('')}
                        aria-label="Dismiss message"
                    >
                        <Icon name="close" size={15} />
                    </IconButton>
                </div>
            )}
            {!inbox ? (
                <>
                    <div className="endpoint-empty">
                        <div className="empty-symbol">
                            <Icon name="webhook" size={29} />
                        </div>
                        <h2>Your next request starts here.</h2>
                        <p>
                            Create an endpoint, send it a webhook, and see the headers, body, and
                            query parameters as they arrive.
                        </p>
                        <SharingControl
                            value={visibility}
                            onChange={setVisibility}
                            disabled={working}
                        />
                        <Button
                            size="3"
                            variant="solid"
                            color="green"
                            disabled={working}
                            onClick={() => void create()}
                        >
                            <Icon name="plus" size={17} />
                            {working ? 'Creating…' : 'Create an inbox'}
                        </Button>
                        <small>Free · Expires after 1 hour · No account needed</small>
                    </div>
                    <details className="connection-details">
                        <summary>Open an existing inbox</summary>
                        <form
                            className="connection-content existing-inbox"
                            onSubmit={(event) => void openExisting(event)}
                        >
                            <label htmlFor="existing-id">
                                Inbox ID
                                <input
                                    id="existing-id"
                                    required
                                    value={existingId}
                                    onChange={(event) => setExistingId(event.target.value)}
                                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                    autoComplete="off"
                                />
                            </label>
                            <label htmlFor="existing-token">
                                Inspection token (optional for your workspace)
                                <input
                                    id="existing-token"
                                    type="password"
                                    value={existingToken}
                                    onChange={(event) => setExistingToken(event.target.value)}
                                    autoComplete="off"
                                />
                            </label>
                            <Button
                                size="2"
                                variant="surface"
                                color="gray"
                                disabled={working}
                                type="submit"
                            >
                                Open inbox <Icon name="arrow" size={14} />
                            </Button>
                        </form>
                    </details>
                </>
            ) : (
                <>
                    <div className="endpoint-bar">
                        <span className="endpoint-label">YOUR ENDPOINT</span>
                        <code className="endpoint-url">{inbox.webhookUrl}</code>
                        <button
                            type="button"
                            className="endpoint-access"
                            onClick={() => setSettingsOpen(true)}
                            title="Change who can send to this inbox"
                        >
                            <Icon name="shield" size={12} />
                            {inbox.visibility === 'private' ? 'Private' : 'Public'}
                        </button>
                        <CopyButton text={inbox.webhookUrl} label="Copy URL" />
                        <span className="expiry">
                            <Icon name="clock" size={13} /> {timeLeft(remaining)}
                        </span>
                    </div>
                    {viewer.status === 'guest' && (
                        <p className="keep-longer">
                            <Icon name="clock" size={14} />
                            Anonymous inboxes last 1 hour.{' '}
                            <Link href="/account/#register">Sign up free</Link> to keep them for 7
                            days and use them from your AI agent.
                        </p>
                    )}
                    <div className="inbox-toolbar">
                        <div className="live-status">
                            <span className={live && !error ? 'status-dot' : ''} />
                            {live
                                ? error
                                    ? 'Reconnecting'
                                    : 'Listening for requests'
                                : 'Updates paused'}
                        </div>
                        <div className="button-row">
                            <Button
                                size="2"
                                variant={settingsOpen ? 'soft' : 'surface'}
                                color="gray"
                                aria-expanded={settingsOpen}
                                onClick={() => setSettingsOpen(!settingsOpen)}
                            >
                                Settings
                            </Button>
                            <Button
                                size="2"
                                variant="surface"
                                color="gray"
                                aria-pressed={live}
                                onClick={() => setLive(!live)}
                            >
                                <Icon name={live ? 'pause' : 'play'} size={13} />
                                {live ? 'Pause' : 'Resume'}
                            </Button>
                            <IconButton
                                size="2"
                                variant="surface"
                                color="gray"
                                disabled={refreshing}
                                onClick={() => void refresh()}
                                aria-label="Refresh requests"
                            >
                                <Icon name="refresh" size={14} />
                            </IconButton>
                            <IconButton
                                size="2"
                                variant="surface"
                                color="gray"
                                disabled={working}
                                onClick={() => setConfirmation('delete')}
                                aria-label="Delete inbox"
                            >
                                <Icon name="trash" size={14} />
                            </IconButton>
                        </div>
                    </div>
                    {settingsOpen && (
                        <section className="inbox-settings" aria-label="Inbox settings">
                            <Tabs.Root defaultValue="access">
                                <Tabs.List size="2">
                                    <Tabs.Trigger value="access">Access</Tabs.Trigger>
                                    <Tabs.Trigger value="response">Response</Tabs.Trigger>
                                    <Tabs.Trigger value="forward">Forwarding</Tabs.Trigger>
                                    <Tabs.Trigger value="code">Code &amp; export</Tabs.Trigger>
                                </Tabs.List>
                                <Tabs.Content value="access">
                                    <div className="inbox-settings-pane">
                                        <SharingControl
                                            value={inbox.visibility ?? 'public'}
                                            onChange={(mode) => void changeSharing(mode)}
                                            disabled={working}
                                        />
                                        {inbox.visibility === 'private' && (
                                            <div className="resource-access">
                                                <p>
                                                    Senders need the access token in{' '}
                                                    <code>X-Access-Token</code>. Your inspection
                                                    token only reads and manages the inbox.
                                                </p>
                                                {inbox.accessToken && (
                                                    <CopyButton
                                                        text={inbox.accessToken}
                                                        label="Copy sender access token"
                                                    />
                                                )}
                                                <button
                                                    className="button button-small"
                                                    disabled={working}
                                                    onClick={() => void changeSharing('private')}
                                                >
                                                    Rotate sender access token
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </Tabs.Content>
                                <Tabs.Content value="response">
                                    <InboxResponseSettings
                                        key={inbox.id}
                                        inbox={inbox}
                                        onError={setError}
                                        onSaved={(response) => {
                                            const { response: _old, ...rest } = inbox;
                                            const updated = response ? { ...rest, response } : rest;
                                            remember(updated);
                                            setInbox(updated);
                                        }}
                                    />
                                </Tabs.Content>
                                <Tabs.Content value="forward">
                                    <InboxForwardSettings
                                        key={`forward-${inbox.id}`}
                                        inbox={inbox}
                                        onError={setError}
                                        onSaved={(forwardUrl) => {
                                            const { forwardUrl: _old, ...rest } = inbox;
                                            const updated = forwardUrl
                                                ? { ...rest, forwardUrl }
                                                : rest;
                                            remember(updated);
                                            setInbox(updated);
                                        }}
                                    />
                                </Tabs.Content>
                                <Tabs.Content value="code">
                                    <div className="inbox-settings-pane">
                                        <p>Run this in your terminal to send a test event.</p>
                                        <div className="code-row">
                                            <code>{command}</code>
                                            <CopyButton
                                                text={command}
                                                label="Copy cURL command"
                                                compact
                                            />
                                        </div>
                                        {inbox.inspectionToken ? (
                                            <>
                                                <div className="connection-token">
                                                    <Icon name="shield" size={13} />
                                                    <span>Keep your inspection token private.</span>
                                                </div>
                                                <div className="token-controls">
                                                    <input
                                                        className="token-value"
                                                        aria-label="Inspection token"
                                                        type={showToken ? 'text' : 'password'}
                                                        readOnly
                                                        value={inbox.inspectionToken}
                                                        autoComplete="off"
                                                    />
                                                    <Button
                                                        size="2"
                                                        variant="surface"
                                                        color="gray"
                                                        aria-pressed={showToken}
                                                        onClick={() => setShowToken(!showToken)}
                                                    >
                                                        {showToken ? 'Hide' : 'Show'}
                                                    </Button>
                                                    <CopyButton
                                                        text={inbox.inspectionToken}
                                                        label="Copy token"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <p>Managed through your current workspace.</p>
                                        )}
                                        <div className="button-row" style={{ marginTop: 15 }}>
                                            <Button
                                                size="2"
                                                variant="surface"
                                                color="gray"
                                                disabled={!requests.length}
                                                onClick={() =>
                                                    download(
                                                        JSON.stringify(
                                                            {
                                                                inbox: {
                                                                    id: inbox.id,
                                                                    expiresAt: inbox.expiresAt,
                                                                },
                                                                requests,
                                                            },
                                                            null,
                                                            2,
                                                        ),
                                                        `inbox-${inbox.id}.json`,
                                                    )
                                                }
                                            >
                                                <Icon name="download" size={13} /> Export history
                                            </Button>
                                        </div>
                                    </div>
                                </Tabs.Content>
                            </Tabs.Root>
                        </section>
                    )}
                    <div className="inbox-layout">
                        <aside className="request-list-panel" aria-label="Captured requests">
                            <div className="panel-heading">
                                Requests{' '}
                                <span className="count" aria-live="polite">
                                    {filtering
                                        ? `${filtered.length} of ${requests.length}`
                                        : `${requests.length} / ${inbox.requestLimit ?? 100}`}
                                </span>
                            </div>
                            <label className="search-field request-search">
                                <Icon name="search" size={13} />
                                <input
                                    aria-label="Filter requests"
                                    placeholder="Search captured data…"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                            </label>
                            <div className="request-filters">
                                <AppSelect
                                    aria-label="Filter by HTTP method"
                                    value={requestMethod}
                                    onChange={(event) => setRequestMethod(event.target.value)}
                                >
                                    <SelectOption value="all">All methods</SelectOption>
                                    {[
                                        'GET',
                                        'HEAD',
                                        'POST',
                                        'PUT',
                                        'PATCH',
                                        'DELETE',
                                        'OPTIONS',
                                    ].map((method) => (
                                        <SelectOption value={method} key={method}>
                                            {method}
                                        </SelectOption>
                                    ))}
                                </AppSelect>
                                <AppSelect
                                    aria-label="Search request field"
                                    value={searchScope}
                                    onChange={(event) =>
                                        setSearchScope(event.target.value as RequestSearchScope)
                                    }
                                >
                                    <SelectOption value="all">All fields</SelectOption>
                                    <SelectOption value="path">Path</SelectOption>
                                    <SelectOption value="body">Text body</SelectOption>
                                    <SelectOption value="headers">Headers</SelectOption>
                                    <SelectOption value="query">Query</SelectOption>
                                </AppSelect>
                                {filtering && (
                                    <button
                                        className="text-link"
                                        onClick={() => {
                                            setQuery('');
                                            setRequestMethod('all');
                                        }}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                            <div className="request-list">
                                {filtered.length ? (
                                    filtered.map((request) => (
                                        <button
                                            className={`request-item ${selected === request.id ? 'selected' : ''}`}
                                            key={request.id}
                                            aria-pressed={current?.id === request.id}
                                            onClick={() => setSelected(request.id)}
                                        >
                                            <div className="request-item-top">
                                                <span
                                                    className={`method method-${request.method.toLowerCase()}`}
                                                >
                                                    {request.method}
                                                </span>
                                                <time dateTime={request.timestamp}>
                                                    {new Date(
                                                        request.timestamp,
                                                    ).toLocaleTimeString()}
                                                </time>
                                            </div>
                                            <div className="request-item-path">{request.path}</div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="list-empty">
                                        <Icon name={filtering ? 'search' : 'webhook'} size={24} />
                                        {filtering ? (
                                            'No matching requests.'
                                        ) : (
                                            <>
                                                Nothing here yet.
                                                <br />
                                                Your first request will appear here.
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </aside>
                        <section className="request-detail" aria-label="Selected request">
                            <Detail
                                request={current}
                                filteredOut={requests.length > 0 && !filtered.length}
                                command={command}
                            />
                        </section>
                    </div>
                </>
            )}
            <AlertDialog.Root
                open={confirmation !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmation(null);
                }}
            >
                <AlertDialog.Content maxWidth="430px">
                    <AlertDialog.Title>
                        {confirmation === 'delete' ? 'Delete this inbox?' : 'Create another inbox?'}
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                        {confirmation === 'delete'
                            ? 'This permanently deletes the inbox and its captured requests.'
                            : 'The current inbox will stay active until it expires. Save its inspection token if you want to reopen it.'}
                    </AlertDialog.Description>
                    <div className="confirm-actions">
                        <AlertDialog.Cancel>
                            <Button variant="soft" color="gray">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                            <Button
                                color={confirmation === 'delete' ? 'red' : 'green'}
                                onClick={() => {
                                    const action = confirmation;
                                    setConfirmation(null);
                                    if (action === 'delete') void remove();
                                    else void createInbox();
                                }}
                            >
                                {confirmation === 'delete' ? 'Delete inbox' : 'Create inbox'}
                            </Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Root>
            <p className="work-note">
                <Icon name="shield" size={13} /> Private to inspect. Expires after one hour.{' '}
                <Link className="text-link" href="/docs/">
                    API reference
                </Link>
            </p>
        </div>
    );
}
