'use client';

import Link from 'next/link';
import { appLink, legacyAccountLink } from '../lib/app-routes';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, Button, Select, Switch, TextArea, TextField } from '@radix-ui/themes';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { CopyButton } from './copy-button';
import { ToolHeader } from './tool-header';

interface Credential {
    id: string;
    name: string;
    url: string;
    username: string;
    agentMayRead: boolean;
    authenticatorId?: string;
    inboxId?: string;
}

function CredentialForm({
    entry,
    canManage,
    onSave,
    onCancel,
}: {
    entry?: Credential;
    canManage: boolean;
    onSave: (value: object) => Promise<void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState(entry?.name ?? '');
    const [url, setUrl] = useState(entry?.url ?? '');
    const [username, setUsername] = useState(entry?.username ?? '');
    const [password, setPassword] = useState('');
    const [notes, setNotes] = useState('');
    const [agentMayRead, setAgentMayRead] = useState(entry?.agentMayRead ?? false);
    const [authenticatorId, setAuthenticatorId] = useState(entry?.authenticatorId ?? 'none');
    const [inboxId, setInboxId] = useState(entry?.inboxId ?? 'none');
    const [authenticators, setAuthenticators] = useState<{ id: string; name: string }[]>([]);
    const [inboxes, setInboxes] = useState<{ id: string; address: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        void api('/api/authenticators', { signal: controller.signal })
            .then((r) => r.json())
            .then((value) => {
                if (!controller.signal.aborted) setAuthenticators(value.authenticators);
            })
            .catch(() => {});
        void api('/api/email-inboxes', { signal: controller.signal })
            .then((r) => r.json())
            .then((value) => {
                if (!controller.signal.aborted) setInboxes(value.inboxes);
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);
    return (
        <form
            className="email-create-form"
            onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                void onSave({
                    name,
                    url,
                    username,
                    ...(password ? { password } : {}),
                    ...(!entry || notes ? { notes } : {}),
                    ...(canManage ? { agentMayRead } : {}),
                    authenticatorId: authenticatorId === 'none' ? null : authenticatorId,
                    inboxId: inboxId === 'none' ? null : inboxId,
                })
                    .catch((failure: Error) => setError(failure.message))
                    .finally(() => setBusy(false));
            }}
        >
            <label>
                Name
                <TextField.Root
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Example service"
                />
            </label>
            <label>
                Site
                <TextField.Root
                    required
                    maxLength={2048}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="example.com"
                />
            </label>
            <label>
                Username
                <TextField.Root
                    required
                    maxLength={254}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                />
            </label>
            <label>
                Password (optional)
                <TextField.Root
                    type="password"
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                />
                <small>
                    {entry
                        ? 'Leave blank to keep the saved password.'
                        : 'Leave blank to generate and save a strong password.'}
                </small>
            </label>
            <label>
                Notes (optional)
                <TextArea
                    rows={3}
                    maxLength={4000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={entry ? 'Enter replacement notes' : ''}
                />
            </label>
            <label>
                Authenticator (optional)
                <Select.Root value={authenticatorId} onValueChange={setAuthenticatorId}>
                    <Select.Trigger aria-label="Linked authenticator" />
                    <Select.Content>
                        <Select.Item value="none">None</Select.Item>
                        {authenticators.map((item) => (
                            <Select.Item key={item.id} value={item.id}>
                                {item.name}
                            </Select.Item>
                        ))}
                    </Select.Content>
                </Select.Root>
            </label>
            <label>
                Email inbox (optional)
                <Select.Root value={inboxId} onValueChange={setInboxId}>
                    <Select.Trigger aria-label="Linked email inbox" />
                    <Select.Content>
                        <Select.Item value="none">None</Select.Item>
                        {inboxes.map((item) => (
                            <Select.Item key={item.id} value={item.id}>
                                {item.address}
                            </Select.Item>
                        ))}
                    </Select.Content>
                </Select.Root>
            </label>
            {canManage && (
                <label>
                    Agent may read without asking
                    <Switch
                        checked={agentMayRead}
                        onCheckedChange={setAgentMayRead}
                        aria-label="Agent may read without asking"
                    />
                    <small>Write keys can reveal this password directly when enabled.</small>
                </label>
            )}
            <div className="dialog-actions">
                <Button type="submit" disabled={busy}>
                    Save entry
                </Button>
                <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    disabled={busy}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

function CredentialDetail({
    entry,
    canWrite,
    canManage,
    onEdit,
    onUpdate,
    onDelete,
}: {
    entry: Credential;
    canWrite: boolean;
    canManage: boolean;
    onEdit: () => void;
    onUpdate: (entry: Credential) => void;
    onDelete: () => Promise<void>;
}) {
    const [revealed, setRevealed] = useState<{ password: string; notes: string } | null>(null);
    const [pending, setPending] = useState<{ approvalId: string; answerUrl: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const direct = canManage || entry.agentMayRead;
    useEffect(() => {
        if (!revealed) return;
        const timer = setTimeout(() => setRevealed(null), 30000);
        const hide = () => {
            if (document.hidden) setRevealed(null);
        };
        document.addEventListener('visibilitychange', hide);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', hide);
        };
    }, [revealed]);
    async function reveal(approvalId?: string) {
        const response = await api(`/api/credentials/${entry.id}/reveal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(approvalId ? { approvalId } : { confirm: canManage }),
        });
        const result = await response.json();
        if (result.status === 'awaitingApproval') setPending(result);
        else {
            setRevealed({ password: result.password, notes: result.notes });
            setPending(null);
        }
    }
    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to update this entry.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="vault-detail">
            <h2>{entry.name}</h2>
            <dl className="vault-fields">
                <div>
                    <dt>Site</dt>
                    <dd>
                        <span>{entry.url}</span>
                        <CopyButton text={entry.url} label="Copy site" />
                    </dd>
                </div>
                <div>
                    <dt>Username</dt>
                    <dd>
                        <span>{entry.username}</span>
                        <CopyButton text={entry.username} label="Copy username" />
                    </dd>
                </div>
                <div>
                    <dt>Password</dt>
                    <dd>
                        {revealed ? (
                            <>
                                <code>{revealed.password}</code>
                                <CopyButton text={revealed.password} label="Copy password" />
                                <Button
                                    variant="ghost"
                                    color="gray"
                                    onClick={() => setRevealed(null)}
                                >
                                    Hide
                                </Button>
                            </>
                        ) : (
                            <span>Hidden</span>
                        )}
                    </dd>
                </div>
            </dl>
            {revealed && <p className="muted">Hides automatically after 30 seconds.</p>}
            {revealed?.notes && (
                <div className="email-draft-content">
                    <h3>Notes</h3>
                    <pre>{revealed.notes}</pre>
                </div>
            )}
            {entry.authenticatorId && (
                <p>
                    <Link href={legacyAccountLink('/account/#authenticators')}>
                        Open linked authenticator
                    </Link>
                </p>
            )}
            {entry.inboxId && (
                <p>
                    <Link href={appLink(`/email/?inbox=${encodeURIComponent(entry.inboxId)}`)}>
                        Open linked inbox
                    </Link>
                </p>
            )}
            <p className="muted">
                {entry.agentMayRead
                    ? 'Write keys may reveal without asking.'
                    : 'An owner or admin approves each agent reveal.'}
            </p>
            {canManage && (
                <label className="vault-policy">
                    <Switch
                        checked={entry.agentMayRead}
                        disabled={busy}
                        aria-label="Agent may read without asking"
                        onCheckedChange={(value) =>
                            void run(async () => {
                                const response = await api(`/api/credentials/${entry.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ agentMayRead: value }),
                                });
                                onUpdate(await response.json());
                                setRevealed(null);
                            })
                        }
                    />
                    Agent may read without asking
                </label>
            )}
            <div className="dialog-actions">
                {canWrite && !revealed && !pending && (
                    <AlertDialog.Root>
                        <AlertDialog.Trigger>
                            <Button disabled={busy}>Reveal password</Button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content>
                            <AlertDialog.Title>Reveal this password?</AlertDialog.Title>
                            <AlertDialog.Description>
                                {direct
                                    ? 'The password will appear for 30 seconds. This reveal is recorded in workspace activity.'
                                    : 'An owner or admin must approve this request. The password will appear for 30 seconds after approval.'}
                            </AlertDialog.Description>
                            <div className="dialog-actions">
                                <AlertDialog.Cancel>
                                    <Button variant="soft" color="gray">
                                        Cancel
                                    </Button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action>
                                    <Button
                                        onClick={() =>
                                            void run(async () => {
                                                await reveal();
                                            })
                                        }
                                    >
                                        {direct ? 'Confirm reveal' : 'Request approval'}
                                    </Button>
                                </AlertDialog.Action>
                            </div>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                )}
                {canWrite && (
                    <Button variant="soft" color="gray" disabled={busy} onClick={onEdit}>
                        Edit entry
                    </Button>
                )}
                {canWrite && (
                    <AlertDialog.Root>
                        <AlertDialog.Trigger>
                            <Button variant="soft" color="gray" disabled={busy}>
                                Delete entry
                            </Button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content>
                            <AlertDialog.Title>Delete this vault entry?</AlertDialog.Title>
                            <AlertDialog.Description>
                                This permanently removes its saved password and notes.
                            </AlertDialog.Description>
                            <div className="dialog-actions">
                                <AlertDialog.Cancel>
                                    <Button variant="soft" color="gray">
                                        Keep entry
                                    </Button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action>
                                    <Button color="red" onClick={() => void run(onDelete)}>
                                        Delete entry
                                    </Button>
                                </AlertDialog.Action>
                            </div>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                )}
            </div>
            {pending && (
                <div className="vault-detail" role="status">
                    <p>Share this approval link with a workspace owner or admin.</p>
                    <CopyButton text={pending.answerUrl} label="Copy approval link" />
                    <Link href={pending.answerUrl}>Open approval page</Link>
                    <div className="dialog-actions">
                        <Button
                            disabled={busy}
                            onClick={() => void run(async () => reveal(pending.approvalId))}
                        >
                            Check approval
                        </Button>
                        <Button
                            variant="soft"
                            color="gray"
                            disabled={busy}
                            onClick={() => setPending(null)}
                        >
                            Request again
                        </Button>
                    </div>
                </div>
            )}
            {error && <p role="alert">{error}</p>}
        </div>
    );
}

export function VaultPanel({
    onChange,
    selectedId,
    onSelect,
}: {
    onChange?: () => void;
    selectedId?: string;
    onSelect?: (id?: string) => void;
}) {
    const viewer = useViewer();
    const [entries, setEntries] = useState<Credential[]>([]);
    const [limit, setLimit] = useState(0);
    const [selected, setSelected] = useState<Credential | null>(null);
    const [form, setForm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (onSelect) {
            setSelected(entries.find((entry) => entry.id === selectedId) ?? null);
            setForm(false);
        }
    }, [selectedId, entries, Boolean(onSelect)]);
    const workspace = viewer.status === 'user' ? viewer.workspaceId : '';
    const currentWorkspace = useRef(workspace);
    currentWorkspace.current = workspace;
    const canManage = viewer.status === 'user' && ['owner', 'admin'].includes(viewer.role);
    const canWrite = viewer.status === 'user' && viewer.role !== 'viewer';
    useEffect(() => {
        setEntries([]);
        setSelected(null);
        setForm(false);
        setError('');
        setLoading(true);
        if (viewer.status !== 'user') {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        void api('/api/credentials', { signal: controller.signal })
            .then((r) => r.json())
            .then((value) => {
                if (!controller.signal.aborted) {
                    setEntries(value.credentials);
                    setLimit(value.limit);
                }
            })
            .catch((failure: Error) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [viewer.status, workspace]);
    function update(entry: Credential) {
        if (currentWorkspace.current !== workspace) return;
        setEntries((items) =>
            items.some((item) => item.id === entry.id)
                ? items.map((item) => (item.id === entry.id ? entry : item))
                : [entry, ...items],
        );
        setSelected(entry);
        onChange?.();
    }
    if (viewer.status === 'loading' || loading) return <p role="status">Loading vault…</p>;
    if (viewer.status !== 'user')
        return (
            <p>
                <Link href={appLink('/login/')}>Sign in</Link> to save credentials for accounts you
                asked your agent to operate.
            </p>
        );
    return (
        <section className="vault-panel">
            <p className="muted">
                {entries.length} / {limit} entries
            </p>
            {(selected || form) && (
                <Button
                    variant="ghost"
                    color="gray"
                    onClick={() => {
                        setSelected(null);
                        onSelect?.();
                        setForm(false);
                    }}
                >
                    Back to vault
                </Button>
            )}
            {form ? (
                <CredentialForm
                    key={selected?.id ?? 'new'}
                    {...(selected ? { entry: selected } : {})}
                    canManage={canManage}
                    onCancel={() => setForm(false)}
                    onSave={async (input) => {
                        const response = await api(
                            selected ? `/api/credentials/${selected.id}` : '/api/credentials',
                            {
                                method: selected ? 'PATCH' : 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(input),
                            },
                        );
                        const value = await response.json();
                        update(value.credential ?? value);
                        setForm(false);
                    }}
                />
            ) : selected ? (
                <CredentialDetail
                    key={`${workspace}:${selected.id}`}
                    entry={selected}
                    canWrite={canWrite}
                    canManage={canManage}
                    onEdit={() => setForm(true)}
                    onUpdate={update}
                    onDelete={async () => {
                        await api(`/api/credentials/${selected.id}`, { method: 'DELETE' });
                        if (currentWorkspace.current !== workspace) return;
                        setEntries((items) => items.filter((item) => item.id !== selected.id));
                        setSelected(null);
                        onSelect?.();
                        onChange?.();
                    }}
                />
            ) : (
                <>
                    <div className="home-section-head">
                        <h2>Saved accounts</h2>
                        {canWrite && (
                            <Button
                                size="2"
                                disabled={entries.length >= limit}
                                onClick={() => setForm(true)}
                            >
                                New entry
                            </Button>
                        )}
                    </div>
                    {entries.length ? (
                        <ul className="home-rows">
                            {entries.map((entry) => (
                                <li key={entry.id}>
                                    <button
                                        type="button"
                                        className="vault-row"
                                        onClick={() =>
                                            onSelect ? onSelect(entry.id) : setSelected(entry)
                                        }
                                    >
                                        <strong>{entry.name}</strong>
                                        <span>{entry.url}</span>
                                        <small>{entry.username}</small>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="dashboard-empty">
                            <h3>Account access, kept together.</h3>
                            <p>
                                Save a login with its email inbox and authenticator. Your human
                                approves password reveals by default.
                            </p>
                        </div>
                    )}
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </section>
    );
}

export function VaultWorkbench({ toolId }: { toolId: string }) {
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
            <VaultPanel />
        </div>
    );
}
