'use client';
import Link from 'next/link';
import { legacyAccountLink, workspaceResource } from '../lib/app-routes';
import { useEffect, useState } from 'react';
import { Button, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { ToolHeader } from './tool-header';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { CopyButton } from './copy-button';

interface Monitor {
    id: string;
    name: string;
    kind: string;
    status: string;
}
interface Page {
    id: string;
    name: string;
    description: string;
    monitorIds: string[];
    pageUrl: string;
    expiresAt: string;
    persistent: boolean;
    accessToken?: string;
}
export function StatusPageWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [monitors, setMonitors] = useState<Monitor[]>([]),
        [selected, setSelected] = useState<string[]>([]);
    const [name, setName] = useState('Service status'),
        [description, setDescription] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('private');
    const [page, setPage] = useState<Page | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        setPage(null);
        setMonitors([]);
        setSelected([]);
        setError('');
        if (viewer.status !== 'user') return;
        let live = true;
        void api('/api/monitors')
            .then((response) => response.json())
            .then((data) => {
                if (live) setMonitors(data.monitors);
            })
            .catch((failure) => {
                if (live) setError(failure.message);
            });
        const id = workspaceResource(location.search);
        if (id && /^[a-f0-9-]{36}$/i.test(id))
            void api(`/api/status-pages/${id}`)
                .then((response) => response.json())
                .then((data) => {
                    if (live) {
                        setPage(data);
                        setName(data.name);
                        setDescription(data.description);
                        setSelected(data.monitorIds);
                        setVisibility(data.visibility);
                    }
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        return () => {
            live = false;
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    async function create() {
        if (viewer.status !== 'user') return;
        setBusy(true);
        setError('');
        try {
            const query = new URLSearchParams({
                visibility,
                ...(viewer.plan === 'free' ? { ttlSeconds: '604800' } : { persistent: 'true' }),
            });
            const response = await api(`/api/status-pages${page ? `/${page.id}` : `?${query}`}`, {
                method: page ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, monitorIds: selected }),
            });
            const value = await response.json();
            setPage(
                page
                    ? { ...page, name, description, monitorIds: selected }
                    : { ...value, name, description, monitorIds: selected },
            );
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to publish status page.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                description="Publish the status of selected workspace monitors. Targets, alert destinations and private error details stay in your workspace."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Publish your service status.</h2>
                    <p>
                        A free workspace can select its own monitors and share their current state.
                    </p>
                    <Link className="button" href={legacyAccountLink('/account/#register')}>
                        Create a free account
                    </Link>
                </div>
            ) : viewer.status === 'loading' ? (
                <p role="status">Loading your workspace…</p>
            ) : (
                <div className="llm-workspace">
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void create();
                        }}
                    >
                        <label>
                            Page name
                            <TextField.Root
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                maxLength={80}
                            />
                        </label>
                        <label>
                            Description
                            <TextArea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={240}
                            />
                        </label>
                        <fieldset>
                            <legend>Published monitors</legend>
                            {monitors.length ? (
                                monitors.map((monitor) => (
                                    <label className="llm-option" key={monitor.id}>
                                        <Checkbox
                                            checked={selected.includes(monitor.id)}
                                            onCheckedChange={(checked) =>
                                                setSelected((current) =>
                                                    checked
                                                        ? [...current, monitor.id]
                                                        : current.filter((id) => id !== monitor.id),
                                                )
                                            }
                                            disabled={
                                                !selected.includes(monitor.id) &&
                                                selected.length >= 20
                                            }
                                        />
                                        {monitor.name}{' '}
                                        <span className="muted">· {monitor.status}</span>
                                    </label>
                                ))
                            ) : (
                                <p>
                                    Create a monitor first in{' '}
                                    <Link href={legacyAccountLink('/account/#monitors')}>
                                        your dashboard
                                    </Link>
                                    .
                                </p>
                            )}
                        </fieldset>
                        <SharingControl
                            value={visibility}
                            onChange={setVisibility}
                            disabled={Boolean(page) || busy}
                        />
                        <p className="muted">
                            Select up to 20 monitors. Public pages show names, states, probe times
                            and recent status changes. Private pages require workspace access or a
                            separate caller token. Free pages last seven days; paid pages can stay
                            active while subscribed.
                        </p>
                        <Button type="submit" disabled={busy || !selected.length}>
                            {busy ? 'Saving…' : page ? 'Save page' : 'Create page'}
                        </Button>
                    </form>
                    <section className="llm-preview" aria-label="Published page">
                        {page ? (
                            <>
                                <h2>{page.name}</h2>
                                <p>{page.description}</p>
                                <div className="code-row">
                                    <code>{page.pageUrl}</code>
                                    <CopyButton text={page.pageUrl} label="Copy page URL" compact />
                                </div>
                                {page.accessToken && (
                                    <details>
                                        <summary>Private caller token</summary>
                                        <p className="muted">
                                            Share this separately from the page URL. It is shown
                                            once.
                                        </p>
                                        <div className="code-row">
                                            <code>{page.accessToken}</code>
                                            <CopyButton
                                                compact
                                                text={page.accessToken}
                                                label="Copy caller token"
                                            />
                                        </div>
                                    </details>
                                )}
                                <p>
                                    {page.persistent
                                        ? 'Active while subscribed'
                                        : `Expires ${new Date(page.expiresAt).toLocaleString()}`}
                                </p>
                                <a
                                    className="button"
                                    href={page.pageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Open status page
                                </a>
                                <p className="muted">
                                    Manage visibility and deletion in{' '}
                                    <Link href={legacyAccountLink('/account/#resources')}>
                                        workspace resources
                                    </Link>
                                    .
                                </p>
                            </>
                        ) : (
                            <>
                                <h2>Your published view</h2>
                                <p className="muted">
                                    Create a page to preview its public or private address. Probe
                                    details and alert destinations are never published.
                                </p>
                            </>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
