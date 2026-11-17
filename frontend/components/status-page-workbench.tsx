'use client';
import Link from 'next/link';
import { legacyAccountLink, workspaceResource } from '../lib/app-routes';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Select, Tabs, TextArea, TextField } from '@radix-ui/themes';
import type { StatusPublication } from '@kivel.io/sdk';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { ToolHeader } from './tool-header';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { CopyButton } from './copy-button';
import { AppSelect, SelectOption } from './app-select';

interface Monitor {
    id: string;
    name: string;
    kind: string;
    status: string;
}
interface Page extends Partial<StatusPublication> {
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
                description="Publish how your services are doing, with monitor checks and manual updates. Targets, alert destinations and private error details stay in your workspace."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Publish your service status.</h2>
                    <p>Share monitor checks, service updates and scheduled maintenance.</p>
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
                        <Button type="submit" disabled={busy}>
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
            {page && <PublicationEditor key={page.id} page={page} />}
        </div>
    );
}

function PublicationEditor({ page }: { page: Page }) {
    const [components, setComponents] = useState(page.components ?? []);
    const [incidents, setIncidents] = useState(page.incidents ?? []);
    const [maintenance, setMaintenance] = useState(page.maintenance ?? []);
    const [affected, setAffected] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function save(changes: Partial<StatusPublication>) {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            await api(`/api/status-pages/${page.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes),
            });
            if (changes.components) setComponents(changes.components);
            if (changes.incidents) setIncidents(changes.incidents);
            if (changes.maintenance) setMaintenance(changes.maintenance);
            setAffected([]);
            setMessage('Status page updated.');
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : 'Unable to publish these changes.',
            );
        } finally {
            setBusy(false);
        }
    }
    const componentOptions = (
        <fieldset>
            <legend>Affected components</legend>
            {!components.length && <p className="muted">This update applies to the whole page.</p>}
            {components.map((component) => (
                <label className="llm-option" key={component.id}>
                    <Checkbox
                        checked={affected.includes(component.id)}
                        onCheckedChange={(checked) =>
                            setAffected((items) =>
                                checked
                                    ? [...items, component.id]
                                    : items.filter((id) => id !== component.id),
                            )
                        }
                    />
                    {component.name}
                </label>
            ))}
        </fieldset>
    );
    const componentStates = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage' };
    const incidentStates = {
        investigating: 'Investigating',
        identified: 'Identified',
        monitoring: 'Monitoring',
        resolved: 'Resolved',
    };
    return (
        <section className="llm-preview operations-detail" aria-label="Status publication">
            <h2>Status updates</h2>
            <Tabs.Root defaultValue="components" onValueChange={() => setAffected([])}>
                <Tabs.List aria-label="Publication settings">
                    <Tabs.Trigger value="components">Components</Tabs.Trigger>
                    <Tabs.Trigger value="incidents">Incidents</Tabs.Trigger>
                    <Tabs.Trigger value="maintenance">Maintenance</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="components">
                    <ul className="operations-timeline">
                        {components.map((component) => (
                            <li key={component.id}>
                                <strong>{component.name}</strong>
                                <Select.Root
                                    value={component.status}
                                    onValueChange={(status: typeof component.status) =>
                                        void save({
                                            components: components.map((item) =>
                                                item.id === component.id
                                                    ? { ...item, status }
                                                    : item,
                                            ),
                                        })
                                    }
                                >
                                    <Select.Trigger
                                        aria-label={component.name + ' status'}
                                        disabled={busy}
                                    />
                                    <Select.Content>
                                        {Object.entries(componentStates).map(([value, label]) => (
                                            <Select.Item key={value} value={value}>
                                                {label}
                                            </Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select.Root>
                                <Button
                                    type="button"
                                    variant="soft"
                                    disabled={busy}
                                    onClick={() =>
                                        void save({
                                            components: components.filter(
                                                (item) => item.id !== component.id,
                                            ),
                                            incidents: incidents.map((item) => ({
                                                ...item,
                                                componentIds: item.componentIds.filter(
                                                    (id) => id !== component.id,
                                                ),
                                            })),
                                            maintenance: maintenance.map((item) => ({
                                                ...item,
                                                componentIds: item.componentIds.filter(
                                                    (id) => id !== component.id,
                                                ),
                                            })),
                                        })
                                    }
                                >
                                    Remove
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const name = String(
                                new FormData(event.currentTarget).get('name') ?? '',
                            );
                            void save({
                                components: [
                                    ...components,
                                    { id: crypto.randomUUID(), name, status: 'operational' },
                                ],
                            });
                        }}
                    >
                        <label>
                            Component name
                            <TextField.Root name="name" required maxLength={80} />
                        </label>
                        <Button type="submit" disabled={busy || components.length >= 20}>
                            Add component
                        </Button>
                    </form>
                </Tabs.Content>
                <Tabs.Content value="incidents">
                    <ul className="operations-timeline">
                        {incidents.map((incident) => (
                            <li key={incident.id}>
                                <strong>{incident.name}</strong>
                                <small> · {incidentStates[incident.updates.at(-1)!.status]}</small>
                                <p>{incident.updates.at(-1)!.message}</p>
                            </li>
                        ))}
                    </ul>
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            const id = String(form.get('incident') ?? '');
                            const update = {
                                at: new Date().toISOString(),
                                status: form.get('status') as keyof typeof incidentStates,
                                message: String(form.get('message') ?? ''),
                            };
                            if (id && id !== 'new')
                                void save({
                                    incidents: incidents.map((item) =>
                                        item.id === id
                                            ? { ...item, updates: [...item.updates, update] }
                                            : item,
                                    ),
                                });
                            else
                                void save({
                                    incidents: [
                                        ...incidents,
                                        {
                                            id: crypto.randomUUID(),
                                            name: String(form.get('name') ?? ''),
                                            componentIds: affected,
                                            updates: [update],
                                        },
                                    ],
                                });
                        }}
                    >
                        <label htmlFor="published-incident">Existing incident</label>
                        <AppSelect id="published-incident" name="incident" defaultValue="new">
                            <SelectOption value="new">New incident</SelectOption>
                            {incidents
                                .filter((item) => item.updates.length < 20)
                                .map((item) => (
                                    <SelectOption key={item.id} value={item.id}>
                                        {item.name}
                                    </SelectOption>
                                ))}
                        </AppSelect>
                        <label>
                            Name (new incidents)
                            <TextField.Root name="name" maxLength={80} />
                        </label>
                        <label htmlFor="published-incident-status">Status</label>
                        <AppSelect
                            id="published-incident-status"
                            name="status"
                            defaultValue="investigating"
                        >
                            {Object.entries(incidentStates).map(([value, label]) => (
                                <SelectOption key={value} value={value}>
                                    {label}
                                </SelectOption>
                            ))}
                        </AppSelect>
                        <label>
                            Public update
                            <TextArea name="message" required maxLength={500} />
                        </label>
                        {componentOptions}
                        <Button type="submit" disabled={busy}>
                            Publish incident update
                        </Button>
                    </form>
                </Tabs.Content>
                <Tabs.Content value="maintenance">
                    <ul className="operations-timeline">
                        {maintenance.map((item) => (
                            <li key={item.id}>
                                <strong>{item.name}</strong>
                                <p>
                                    {new Date(item.startsAt).toLocaleString()} to{' '}
                                    {new Date(item.endsAt).toLocaleString()}
                                </p>
                                <Button
                                    type="button"
                                    variant="soft"
                                    disabled={busy}
                                    onClick={() =>
                                        void save({
                                            maintenance: maintenance.filter(
                                                (value) => value.id !== item.id,
                                            ),
                                        })
                                    }
                                >
                                    Remove
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <form
                        className="email-create-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            void save({
                                maintenance: [
                                    ...maintenance,
                                    {
                                        id: crypto.randomUUID(),
                                        name: String(form.get('name') ?? ''),
                                        componentIds: affected,
                                        startsAt: new Date(String(form.get('start'))).toISOString(),
                                        endsAt: new Date(String(form.get('end'))).toISOString(),
                                    },
                                ],
                            });
                        }}
                    >
                        <label>
                            Maintenance name
                            <TextField.Root name="name" required maxLength={80} />
                        </label>
                        <label>
                            Starts
                            <TextField.Root type="datetime-local" name="start" required />
                        </label>
                        <label>
                            Ends
                            <TextField.Root type="datetime-local" name="end" required />
                        </label>
                        {componentOptions}
                        <Button type="submit" disabled={busy || maintenance.length >= 20}>
                            Schedule maintenance
                        </Button>
                    </form>
                </Tabs.Content>
            </Tabs.Root>
            {message && <p role="status">{message}</p>}
            {error && (
                <p role="alert" className="alert">
                    {error}
                </p>
            )}
        </section>
    );
}
