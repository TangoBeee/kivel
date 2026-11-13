'use client';

import Link from 'next/link';
import { appLink } from '../lib/app-routes';
import { useEffect, useId, useRef, useState } from 'react';
import { AlertDialog, Button, Select, TextField } from '@radix-ui/themes';
interface Authenticator {
    id: string;
    name: string;
    issuer: string;
    accountName: string;
    algorithm: string;
    digits: number;
    period: number;
    createdAt: string;
}
interface TotpCode {
    id: string;
    code: string;
    secondsRemaining: number;
    nextCode?: string;
}
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { useToolbox } from './toolbox-provider';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';

export function AuthenticatorsPanel({
    onUsageChange,
    selectedId,
    onSelect,
}: {
    onUsageChange?: () => void;
    selectedId?: string;
    onSelect?: (id?: string) => void;
}) {
    const { capabilities } = useToolbox();
    const viewer = useViewer(),
        fileId = useId();
    const [entries, setEntries] = useState<Authenticator[]>([]),
        [limit, setLimit] = useState(0);
    const [name, setName] = useState(''),
        [mode, setMode] = useState('uri'),
        [secret, setSecret] = useState('');
    const [image, setImage] = useState(''),
        [filename, setFilename] = useState('');
    const [algorithm, setAlgorithm] = useState('SHA1'),
        [digits, setDigits] = useState('6'),
        [period, setPeriod] = useState('30');
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(''),
        [renamed, setRenamed] = useState('');
    const [code, setCode] = useState<(TotpCode & { expiresAt: number }) | null>(null),
        [now, setNow] = useState(Date.now());
    const workspace = viewer.status === 'user' ? viewer.workspace : '';
    const currentWorkspace = useRef(workspace);
    currentWorkspace.current = workspace;
    const imageReader = useRef<FileReader | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        imageReader.current?.abort();
        setEntries([]);
        setCode(null);
        setSecret('');
        setImage('');
        setFilename('');
        setEditing('');
        setError('');
        setLoading(true);
        if (viewer.status !== 'user') {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        void api('/api/authenticators', { signal: controller.signal })
            .then((response) => response.json())
            .then((value) => {
                if (controller.signal.aborted) return;
                setEntries(value.authenticators);
                setLimit(value.limit);
            })
            .catch((failure) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => {
            controller.abort();
            imageReader.current?.abort();
        };
    }, [viewer.status, workspace]);
    useEffect(() => {
        if (!code) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [code]);
    useEffect(() => {
        setCode(null);
        setEditing('');
    }, [selectedId]);
    async function refresh() {
        const target = workspace;
        const value = await (await api('/api/authenticators')).json();
        if (currentWorkspace.current !== target) return;
        setEntries(value.authenticators);
        setLimit(value.limit);
        onUsageChange?.();
    }
    async function act(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : 'Unable to complete this action.',
            );
        } finally {
            setBusy(false);
        }
    }
    const remaining = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
    if (viewer.status === 'loading') return <p role="status">Loading your workspace…</p>;
    if (viewer.status !== 'user')
        return (
            <div className="dashboard-empty">
                <h2>Keep account access with your workspace.</h2>
                <p>
                    Connect an agent or sign in to store an authenticator. Only use it for accounts
                    you asked your agent to create or operate.
                </p>
                <Button asChild>
                    <Link href={appLink('/login/')}>Sign in to your workspace</Link>
                </Button>
            </div>
        );
    return (
        <section className="account-card" aria-labelledby="authenticators-title">
            <div className="account-section-heading">
                <div>
                    <h2 id="authenticators-title">Authenticators</h2>
                    <p>Sign-in codes for accounts you asked your agent to create or operate.</p>
                </div>
                <span>
                    {entries.length} / {limit}
                </span>
            </div>
            <p className="tool-notice">
                Secrets are encrypted and never shown again. Keep the service’s recovery codes in a
                separate safe place. Every code request appears in workspace activity.
            </p>
            {capabilities && !capabilities.authenticators && (
                <p className="tool-notice" role="status">
                    Authenticator storage is not enabled on this server. An operator must configure
                    it before you import secrets.
                </p>
            )}
            {error && (
                <p className="error-message" role="alert">
                    {error}
                </p>
            )}
            {loading ? (
                <p role="status">Loading authenticators…</p>
            ) : (
                <>
                    {selectedId && (
                        <Button variant="ghost" onClick={() => onSelect?.()}>
                            Back to authenticators
                        </Button>
                    )}
                    {entries.length ? (
                        <ul className="authenticator-list">
                            {entries
                                .filter((entry) => !selectedId || entry.id === selectedId)
                                .map((entry) => (
                                    <li key={entry.id}>
                                        <div>
                                            {editing === entry.id ? (
                                                <form
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        void act(async () => {
                                                            await api(
                                                                `/api/authenticators/${entry.id}`,
                                                                {
                                                                    method: 'PATCH',
                                                                    body: JSON.stringify({
                                                                        name: renamed,
                                                                    }),
                                                                },
                                                            );
                                                            setEditing('');
                                                            await refresh();
                                                        });
                                                    }}
                                                >
                                                    <label
                                                        className="sr-only"
                                                        htmlFor={`${fileId}-rename`}
                                                    >
                                                        Authenticator name
                                                    </label>
                                                    <TextField.Root
                                                        id={`${fileId}-rename`}
                                                        value={renamed}
                                                        onChange={(event) =>
                                                            setRenamed(event.target.value)
                                                        }
                                                        maxLength={80}
                                                        required
                                                    />
                                                    <Button type="submit" disabled={busy}>
                                                        Save name
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() => setEditing('')}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </form>
                                            ) : (
                                                <>
                                                    {onSelect && !selectedId ? (
                                                        <button
                                                            type="button"
                                                            className="resource-title"
                                                            onClick={() => onSelect(entry.id)}
                                                        >
                                                            {entry.name}
                                                        </button>
                                                    ) : (
                                                        <strong>{entry.name}</strong>
                                                    )}
                                                    <p>
                                                        {[entry.issuer, entry.accountName]
                                                            .filter(Boolean)
                                                            .join(' · ') ||
                                                            `${entry.algorithm} · ${entry.digits} digits · ${entry.period} seconds`}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        <div className="dashboard-section-actions">
                                            <Button
                                                variant="soft"
                                                disabled={busy || !capabilities?.authenticators}
                                                onClick={() =>
                                                    void act(async () => {
                                                        const value = await (
                                                            await api(
                                                                `/api/authenticators/${entry.id}/code`,
                                                            )
                                                        ).json();
                                                        if (currentWorkspace.current !== workspace)
                                                            return;
                                                        const now = Date.now();
                                                        setNow(now);
                                                        setCode({
                                                            ...value,
                                                            expiresAt: Date.parse(value.expiresAt),
                                                        });
                                                    })
                                                }
                                            >
                                                Get code
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                disabled={busy}
                                                onClick={() => {
                                                    setEditing(entry.id);
                                                    setRenamed(entry.name);
                                                }}
                                            >
                                                Rename
                                            </Button>
                                            <AlertDialog.Root>
                                                <AlertDialog.Trigger>
                                                    <Button
                                                        variant="ghost"
                                                        color="red"
                                                        disabled={busy}
                                                    >
                                                        Delete
                                                        <span className="sr-only">
                                                            {' '}
                                                            {entry.name}
                                                        </span>
                                                    </Button>
                                                </AlertDialog.Trigger>
                                                <AlertDialog.Content maxWidth="420px">
                                                    <AlertDialog.Title>
                                                        Delete {entry.name}?
                                                    </AlertDialog.Title>
                                                    <AlertDialog.Description>
                                                        This permanently removes the stored secret.
                                                        You will need the service’s recovery codes
                                                        or another authenticator to sign in.
                                                    </AlertDialog.Description>
                                                    <div className="dialog-actions">
                                                        <AlertDialog.Cancel>
                                                            <Button variant="soft">
                                                                Keep authenticator
                                                            </Button>
                                                        </AlertDialog.Cancel>
                                                        <AlertDialog.Action>
                                                            <Button
                                                                color="red"
                                                                onClick={() =>
                                                                    void act(async () => {
                                                                        await api(
                                                                            `/api/authenticators/${entry.id}`,
                                                                            { method: 'DELETE' },
                                                                        );
                                                                        if (code?.id === entry.id)
                                                                            setCode(null);
                                                                        await refresh();
                                                                        if (selectedId)
                                                                            onSelect?.();
                                                                    })
                                                                }
                                                            >
                                                                Delete authenticator
                                                            </Button>
                                                        </AlertDialog.Action>
                                                    </div>
                                                </AlertDialog.Content>
                                            </AlertDialog.Root>
                                        </div>
                                    </li>
                                ))}
                        </ul>
                    ) : (
                        <p>
                            No authenticators yet. Add one from the service’s two-factor setup
                            screen.
                        </p>
                    )}
                    {code && (
                        <div className="authenticator-code" role="status">
                            <p>{entries.find((entry) => entry.id === code.id)?.name}</p>
                            {remaining ? (
                                <>
                                    <div>
                                        <code>{code.code}</code>
                                        <CopyButton text={code.code} label="Copy code" />
                                    </div>
                                    <p>{remaining} seconds remaining</p>
                                    {code.nextCode && (
                                        <p>
                                            Next code: <code>{code.nextCode}</code>{' '}
                                            <span>Use after this code expires.</span>
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p>
                                    This code expired. Get a new code when you are ready to sign in.
                                </p>
                            )}
                        </div>
                    )}
                    {selectedId && !entries.some((entry) => entry.id === selectedId) && (
                        <p role="status">This authenticator is unavailable in this workspace.</p>
                    )}
                    {!selectedId && (
                        <form
                            className="authenticator-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void act(async () => {
                                    await api('/api/authenticators', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            name,
                                            ...(mode === 'uri'
                                                ? { uri: secret }
                                                : mode === 'secret'
                                                  ? {
                                                        secret,
                                                        algorithm,
                                                        digits: Number(digits),
                                                        period: Number(period),
                                                    }
                                                  : { imageBase64: image }),
                                        }),
                                    });
                                    setSecret('');
                                    setImage('');
                                    setFilename('');
                                    setName('');
                                    await refresh();
                                });
                            }}
                        >
                            <h3>Add an authenticator</h3>
                            <label>
                                Name
                                <TextField.Root
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="GitHub for my project"
                                    maxLength={80}
                                    required
                                    autoComplete="off"
                                />
                            </label>
                            <label>
                                Setup format
                                <Select.Root
                                    value={mode}
                                    onValueChange={(value) => {
                                        setMode(value);
                                        setSecret('');
                                        setImage('');
                                        setFilename('');
                                    }}
                                >
                                    <Select.Trigger aria-label="Setup format" />
                                    <Select.Content>
                                        <Select.Item value="uri">Setup URI</Select.Item>
                                        <Select.Item value="secret">Base32 secret</Select.Item>
                                        <Select.Item value="qr">QR code image</Select.Item>
                                    </Select.Content>
                                </Select.Root>
                            </label>
                            {mode === 'qr' ? (
                                <div>
                                    <input
                                        id={fileId}
                                        ref={fileInput}
                                        tabIndex={-1}
                                        aria-label="QR code image"
                                        className="sr-only"
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            event.target.value = '';
                                            if (!file) return;
                                            if (file.size > 1048576) {
                                                setError('Choose a PNG or JPEG up to 1 MiB.');
                                                return;
                                            }
                                            imageReader.current?.abort();
                                            const reader = new FileReader();
                                            imageReader.current = reader;
                                            reader.onerror = () =>
                                                setError('Unable to read this image.');
                                            reader.onload = () => {
                                                if (currentWorkspace.current !== workspace) return;
                                                setImage(String(reader.result).split(',')[1] ?? '');
                                                setFilename(file.name);
                                                setError('');
                                            };
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="soft"
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        {filename || 'Choose QR image'}
                                    </Button>
                                    <p>PNG or JPEG, up to 1 MiB and one million pixels.</p>
                                </div>
                            ) : (
                                <label>
                                    {mode === 'uri' ? 'otpauth URI' : 'Base32 secret'}
                                    <TextField.Root
                                        type="password"
                                        autoComplete="off"
                                        value={secret}
                                        onChange={(event) => setSecret(event.target.value)}
                                        placeholder={
                                            mode === 'uri'
                                                ? 'otpauth://totp/…'
                                                : 'Setup key from the service'
                                        }
                                        required
                                    />
                                </label>
                            )}
                            {mode === 'secret' && (
                                <div className="authenticator-settings">
                                    {[
                                        [
                                            'Algorithm',
                                            algorithm,
                                            setAlgorithm,
                                            ['SHA1', 'SHA256', 'SHA512'],
                                        ],
                                        ['Digits', digits, setDigits, ['6', '7', '8']],
                                        ['Period in seconds', period, setPeriod, ['30', '60']],
                                    ].map(([label, value, update, choices]) => (
                                        <label key={label as string}>
                                            {label as string}
                                            <Select.Root
                                                value={value as string}
                                                onValueChange={update as (value: string) => void}
                                            >
                                                <Select.Trigger aria-label={label as string} />
                                                <Select.Content>
                                                    {(choices as string[]).map((choice) => (
                                                        <Select.Item value={choice} key={choice}>
                                                            {choice}
                                                        </Select.Item>
                                                    ))}
                                                </Select.Content>
                                            </Select.Root>
                                        </label>
                                    ))}
                                </div>
                            )}
                            <Button
                                type="submit"
                                disabled={
                                    busy ||
                                    !capabilities?.authenticators ||
                                    entries.length >= limit ||
                                    (mode === 'qr' && !image)
                                }
                            >
                                {busy ? 'Saving…' : 'Save authenticator'}
                            </Button>
                            {entries.length >= limit && (
                                <p>
                                    Your plan’s authenticator limit is full. Delete one or{' '}
                                    <Link href="/pricing/">view plans</Link>.
                                </p>
                            )}
                        </form>
                    )}
                </>
            )}
        </section>
    );
}
export function AuthenticatorWorkbench({ toolId }: { toolId: string }) {
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
            <AuthenticatorsPanel />
        </div>
    );
}
