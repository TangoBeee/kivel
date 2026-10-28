'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { api, ApiError, resourceHeaders } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { CopyButton } from './copy-button';
import { Icon } from './icons';
import { ToolHeader } from './tool-header';

interface EmailInbox {
    id: string;
    address: string;
    managementToken: string;
    expiresAt: string;
}
interface EmailMessage {
    id: string;
    receivedAt: string;
    from: string;
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: { url: string; kind: 'verification' | 'other' }[];
    attachments: { filename: string; mimeType: string; size: number }[];
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
        return value && Date.parse(value.expiresAt) > Date.now() ? value : null;
    } catch {
        return null;
    }
};

export function EmailInboxWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [inbox, setInbox] = useState<EmailInbox | null>(null);
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [showHtml, setShowHtml] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const lastId = useRef<string | undefined>(undefined);

    async function create() {
        setBusy(true);
        setError('');
        try {
            const created: EmailInbox = await (
                await api('/api/email-inboxes', { method: 'POST' })
            ).json();
            remember(created);
            lastId.current = undefined;
            setMessages([]);
            setSelected(null);
            setInbox(created);
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
        const saved = restore();
        if (saved) setInbox(saved);
        else if (
            !navigator.webdriver &&
            !/bot|crawl|spider|preview|lighthouse/i.test(navigator.userAgent)
        )
            void create();
        // Runs once; create only uses setters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!inbox) return;
        const controller = new AbortController();
        const headers = resourceHeaders(inbox.managementToken);
        void (async () => {
            try {
                const first = await (
                    await api(`/api/email-inboxes/${inbox.id}/messages`, {
                        headers,
                        signal: controller.signal,
                    })
                ).json();
                setMessages(first.messages);
                lastId.current = first.messages.at(-1)?.id;
                while (!controller.signal.aborted) {
                    const query = new URLSearchParams({ timeoutSeconds: '25' });
                    if (lastId.current) query.set('after', lastId.current);
                    const batch = await (
                        await api(
                            `/api/email-inboxes/${inbox.id}/wait?${query}`,
                            { headers, signal: controller.signal },
                            35000,
                        )
                    ).json();
                    if (batch.messages.length) {
                        lastId.current = batch.messages.at(-1).id;
                        setMessages((items) => [...items, ...batch.messages]);
                        setSelected(batch.messages.at(-1).id);
                    }
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

    const current =
        messages.find((message) => message.id === selected) ?? messages.at(-1) ?? undefined;
    const minutes = inbox
        ? Math.max(0, Math.round((Date.parse(inbox.expiresAt) - Date.now()) / 60000))
        : 0;

    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                title="An inbox your agent can read."
                description="A real email address for sign-up tests. Codes and magic links are pulled out for you."
            >
                {inbox && (
                    <Button
                        size="2"
                        variant="surface"
                        color="gray"
                        disabled={busy}
                        onClick={() => void create()}
                    >
                        <Icon name="plus" size={14} /> New address
                    </Button>
                )}
            </ToolHeader>
            {error && (
                <div className="alert" role="alert">
                    <span>{error}</span>
                    {!inbox && (
                        <Button
                            size="2"
                            color="green"
                            disabled={busy}
                            onClick={() => void create()}
                        >
                            Try again
                        </Button>
                    )}
                </div>
            )}
            {inbox && (
                <>
                    <div className="endpoint-bar">
                        <span className="endpoint-label">YOUR ADDRESS</span>
                        <code className="endpoint-url">{inbox.address}</code>
                        <CopyButton text={inbox.address} label="Copy address" />
                        <span className="expiry">
                            <Icon name="clock" size={13} />{' '}
                            {minutes >= 120
                                ? `${Math.round(minutes / 60)}h left`
                                : `${minutes}m left`}
                        </span>
                    </div>
                    {viewer.status === 'guest' && (
                        <p className="keep-longer">
                            <Icon name="clock" size={14} />
                            Anonymous addresses last 1 hour.{' '}
                            <Link href="/account/#register">Sign up free</Link> to keep them for 7
                            days and give them to your AI agent.
                        </p>
                    )}
                    <div className="email-layout">
                        <aside className="email-list" aria-label="Messages">
                            <div className="email-list-heading">
                                <span className="status-dot" />{' '}
                                {messages.length
                                    ? `${messages.length} message${messages.length === 1 ? '' : 's'}`
                                    : 'Waiting for mail…'}
                            </div>
                            {messages.length ? (
                                [...messages].reverse().map((message) => (
                                    <button
                                        key={message.id}
                                        type="button"
                                        aria-pressed={current?.id === message.id}
                                        onClick={() => {
                                            setSelected(message.id);
                                            setShowHtml(false);
                                        }}
                                    >
                                        <strong>{message.subject || '(no subject)'}</strong>
                                        <span>{message.from}</span>
                                        <time>
                                            {new Date(message.receivedAt).toLocaleTimeString()}
                                        </time>
                                    </button>
                                ))
                            ) : (
                                <p>
                                    Use this address to sign up anywhere. Mail usually arrives
                                    within a few seconds.
                                </p>
                            )}
                        </aside>
                        <section className="email-detail" aria-label="Selected message">
                            {current ? (
                                <>
                                    <h2>{current.subject || '(no subject)'}</h2>
                                    <p className="email-from">
                                        {current.from} ·{' '}
                                        {new Date(current.receivedAt).toLocaleString()}
                                    </p>
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
                                        <p className="email-from">
                                            Attachments (not stored):{' '}
                                            {current.attachments
                                                .map((item) => `${item.filename} (${item.size} B)`)
                                                .join(', ')}
                                        </p>
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
                        <summary>Use it from code or an agent</summary>
                        <div className="connection-content">
                            <p>Wait for the next message and read its code:</p>
                            <div className="code-row">
                                <code>{`curl -H 'X-Resource-Token: ${inbox.managementToken}' \\\n  '${typeof location === 'undefined' ? 'https://socket.help' : location.origin}/api/email-inboxes/${inbox.id}/wait'`}</code>
                                <CopyButton
                                    text={`curl -H 'X-Resource-Token: ${inbox.managementToken}' '${typeof location === 'undefined' ? 'https://socket.help' : location.origin}/api/email-inboxes/${inbox.id}/wait'`}
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
