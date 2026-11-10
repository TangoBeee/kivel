'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Tabs } from '@radix-ui/themes';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { useToolbox } from './toolbox-provider';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
interface Capture {
    id: string;
    expiresAt: string;
    smtp: { host: string; port: number; secure: boolean; username: string; password?: string };
}
interface Message {
    id: string;
    from: string;
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    receivedAt: string;
    attachments: { id?: string; filename: string; size: number }[];
}
export function SmtpWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const { capabilities } = useToolbox();
    const [capture, setCapture] = useState<Capture | null>(null),
        [messages, setMessages] = useState<Message[]>([]),
        [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        setCapture(null);
        setMessages([]);
        setError('');
        if (viewer.status !== 'user') return;
        const id = new URLSearchParams(location.search).get('resource');
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
        let live = true;
        void api(`/api/smtp-inboxes/${id}`)
            .then((response) => response.json())
            .then((value) => {
                if (live) setCapture(value);
            })
            .catch((failure) => {
                if (live) setError(failure.message);
            });
        return () => {
            live = false;
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    useEffect(() => {
        if (!capture) return;
        let live = true;
        const load = () => {
            void api(`/api/email-inboxes/${capture.id}/messages`)
                .then((response) => response.json())
                .then((value) => {
                    if (live) setMessages(value.messages);
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        };
        load();
        const timer = window.setInterval(load, 3000);
        return () => {
            live = false;
            window.clearInterval(timer);
        };
    }, [capture]);
    async function create() {
        setBusy(true);
        setError('');
        try {
            const response = await api('/api/smtp-inboxes?ttlSeconds=86400', { method: 'POST' });
            setCapture(await response.json());
            setMessages([]);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to create capture.');
        } finally {
            setBusy(false);
        }
    }
    async function rotate() {
        if (!capture) return;
        setBusy(true);
        setError('');
        try {
            const value = await (
                await api(`/api/smtp-inboxes/${capture.id}/rotate`, { method: 'POST' })
            ).json();
            setCapture({ ...capture, smtp: value.smtp });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to rotate password.');
        } finally {
            setBusy(false);
        }
    }
    async function remove() {
        if (!capture) return;
        setBusy(true);
        try {
            await api(`/api/email-inboxes/${capture.id}`, { method: 'DELETE' });
            setCapture(null);
            setMessages([]);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to delete capture.');
        } finally {
            setBusy(false);
        }
    }
    const current = messages.find((message) => message.id === selected) ?? messages.at(-1);
    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                description="Capture application email in an isolated capture inbox. Messages stay here and are never delivered to real recipients."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Test mail before it leaves your app.</h2>
                    <p>A free workspace keeps SMTP captures private.</p>
                    <Link className="button" href="/account/#register">
                        Create a free account
                    </Link>
                </div>
            ) : viewer.status === 'loading' ? (
                <p role="status">Loading your workspace…</p>
            ) : !capture ? (
                <div className="dashboard-empty">
                    <h2>Connect your application’s SMTP client.</h2>
                    <p>
                        Create a capture, copy its credentials, and send a test message. It lasts
                        one day and accepts up to 100 messages of 128 KiB each. Public capture
                        requires TLS and SMTP authentication.
                    </p>
                    <Button
                        disabled={busy || !capabilities?.smtpCapture}
                        onClick={() => {
                            void create();
                        }}
                    >
                        {busy
                            ? 'Creating…'
                            : capabilities?.smtpCapture
                              ? 'Create SMTP capture'
                              : 'SMTP capture not enabled'}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="llm-workspace">
                        <section className="email-create-form">
                            <h2>SMTP connection</h2>
                            {!capture.smtp.password && (
                                <>
                                    <p className="muted">
                                        The saved password cannot be revealed. Rotate it to
                                        reconnect your application.
                                    </p>
                                    <Button
                                        disabled={busy}
                                        variant="soft"
                                        onClick={() => {
                                            void rotate();
                                        }}
                                    >
                                        Rotate SMTP password
                                    </Button>
                                </>
                            )}
                            {Object.entries(capture.smtp).map(([key, value]) => (
                                <div key={key}>
                                    <span className="endpoint-label">{key}</span>
                                    <div className="code-row">
                                        <code>{String(value)}</code>
                                        <CopyButton
                                            compact
                                            text={String(value)}
                                            label={`Copy ${key}`}
                                        />
                                    </div>
                                </div>
                            ))}
                            <p className="muted">
                                Credentials are shown once. Keep them separate from connection URLs.
                                Expires {new Date(capture.expiresAt).toLocaleString()}.
                            </p>
                            <Button
                                disabled={busy}
                                color="red"
                                variant="soft"
                                onClick={() => {
                                    void remove();
                                }}
                            >
                                Delete capture
                            </Button>
                        </section>
                        <section className="llm-preview">
                            <h2>Captured messages · {messages.length}</h2>
                            {!messages.length ? (
                                <p className="muted" role="status">
                                    Waiting for your first SMTP message…
                                </p>
                            ) : (
                                <div className="email-message-list">
                                    {messages.map((message) => (
                                        <button
                                            key={message.id}
                                            className="email-message-item"
                                            aria-pressed={message.id === current?.id}
                                            onClick={() => setSelected(message.id)}
                                        >
                                            <strong>{message.subject || '(No subject)'}</strong>
                                            <span>{message.from}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {current && (
                                <article>
                                    <h3>{current.subject || '(No subject)'}</h3>
                                    <p className="muted">
                                        {current.from} ·{' '}
                                        {new Date(current.receivedAt).toLocaleString()}
                                    </p>
                                    {current.codes.length > 0 && (
                                        <div className="button-row">
                                            {current.codes.map((code) => (
                                                <CopyButton key={code} text={code} label={code} />
                                            ))}
                                        </div>
                                    )}
                                    <Tabs.Root defaultValue="text">
                                        <Tabs.List>
                                            <Tabs.Trigger value="text">Text</Tabs.Trigger>
                                            <Tabs.Trigger value="html" disabled={!current.html}>
                                                HTML preview
                                            </Tabs.Trigger>
                                        </Tabs.List>
                                        <Tabs.Content value="text">
                                            <pre className="email-text">
                                                {current.text ||
                                                    'This message has no plain-text body.'}
                                            </pre>
                                        </Tabs.Content>
                                        <Tabs.Content value="html">
                                            <iframe
                                                title="Captured email HTML preview"
                                                sandbox=""
                                                referrerPolicy="no-referrer"
                                                className="smtp-capture-preview"
                                                srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">${current.html ?? ''}`}
                                            />
                                        </Tabs.Content>
                                    </Tabs.Root>
                                    {current.attachments.length > 0 && (
                                        <div className="muted">
                                            <p>Attachments are untrusted files.</p>
                                            {current.attachments.map((file, index) => (
                                                <p key={file.id ?? index}>
                                                    {file.filename || 'Attachment'} (
                                                    {file.size.toLocaleString()} bytes)
                                                    {file.id ? (
                                                        <Button
                                                            size="1"
                                                            variant="ghost"
                                                            aria-label={`Download ${file.filename || 'attachment'}`}
                                                            onClick={() => {
                                                                void api(
                                                                    `/api/email-inboxes/${capture!.id}/messages/${current.id}/attachments/${file.id}`,
                                                                )
                                                                    .then((response) =>
                                                                        response.json(),
                                                                    )
                                                                    .then((link) =>
                                                                        window.location.assign(
                                                                            link.downloadUrl,
                                                                        ),
                                                                    )
                                                                    .catch((failure) =>
                                                                        setError(failure.message),
                                                                    );
                                                            }}
                                                        >
                                                            Download
                                                        </Button>
                                                    ) : (
                                                        ' · Metadata only'
                                                    )}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
