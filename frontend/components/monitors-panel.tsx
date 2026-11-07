'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Dialog, DropdownMenu, IconButton, Select } from '@radix-ui/themes';
import { DotsThree, Plus, Pulse } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { CopyButton } from './copy-button';

interface Monitor {
    id: string;
    kind: 'http' | 'ssl' | 'heartbeat' | 'dns';
    name: string;
    target?: string;
    intervalSeconds: number;
    status: 'pending' | 'up' | 'down';
    paused: boolean;
    lastCheckAt?: string;
    lastMessage?: string;
    lastDurationMs?: number;
}

const intervals = [
    [60, 'Every minute'],
    [300, 'Every 5 minutes'],
    [900, 'Every 15 minutes'],
    [3600, 'Every hour'],
    [86400, 'Every day'],
] as const;
const kinds = {
    http: 'Website',
    ssl: 'SSL certificate',
    heartbeat: 'Cron job',
    dns: 'DNS records',
} as const;
const every = (seconds: number) =>
    intervals.find(([value]) => value === seconds)?.[1].toLowerCase() ??
    `every ${Math.round(seconds / 60)} min`;

/** Uptime, SSL and heartbeat monitors for the workspace, with alerts when status changes. */
export function MonitorsPanel({
    verifiedEmail,
    initialKind = 'http',
}: {
    verifiedEmail: boolean;
    initialKind?: Monitor['kind'];
}) {
    const [monitors, setMonitors] = useState<Monitor[] | null>(null);
    const [limit, setLimit] = useState(0);
    const [minInterval, setMinInterval] = useState(300);
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<Monitor['kind']>('http');
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [dnsRecordType, setDnsRecordType] = useState('A');
    const [interval, setIntervalSeconds] = useState(300);
    const [expectText, setExpectText] = useState('');
    const [webhook, setWebhook] = useState('');
    const [pingUrl, setPingUrl] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState<
        | (Monitor & {
              recentChecks?: { at: string; status: string; durationMs: number }[];
              dnsBaseline?: string[];
              lastDnsAnswers?: string[];
          })
        | null
    >(null);

    async function load() {
        try {
            const value = await (await api('/api/monitors')).json();
            setMonitors(value.monitors);
            setLimit(value.limit);
            setMinInterval(value.minIntervalSeconds);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to load monitors.');
            setMonitors((current) => current ?? []);
        }
    }
    useEffect(() => {
        void load();
        const timer = setInterval(() => void load(), 15000);
        return () => clearInterval(timer);
    }, []);

    function start() {
        setKind(initialKind);
        setName('');
        setTarget('');
        setExpectText('');
        setWebhook('');
        setIntervalSeconds(Math.max(300, minInterval));
        setPingUrl('');
        setError('');
        setOpen(true);
    }
    async function create(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const created = await (
                await api('/api/monitors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        kind,
                        name,
                        ...(kind !== 'heartbeat' ? { target } : {}),
                        intervalSeconds: kind === 'ssl' ? 86400 : interval,
                        ...(kind === 'http' && expectText ? { expectText } : {}),
                        ...(kind === 'dns' ? { dnsRecordType } : {}),
                        ...(webhook ? { alertWebhook: webhook } : {}),
                    }),
                })
            ).json();
            await load();
            // Heartbeats show their ping URL once; everything else is done.
            if (created.pingUrl) setPingUrl(created.pingUrl);
            else setOpen(false);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to add the monitor.');
        } finally {
            setBusy(false);
        }
    }
    async function change(monitor: Monitor, action: 'pause' | 'resume' | 'delete') {
        try {
            await api(`/api/monitors/${monitor.id}`, {
                method: action === 'delete' ? 'DELETE' : 'PATCH',
                ...(action === 'delete'
                    ? {}
                    : {
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ paused: action === 'pause' }),
                      }),
            });
            await load();
        } catch {}
    }

    const full = !!monitors && monitors.length >= limit;
    return (
        <section className="account-card dashboard-resources">
            <div className="account-section-heading">
                <div>
                    <h2>
                        Monitors
                        <Badge variant="soft" color="gray">
                            {monitors?.length ?? 0} / {limit}
                        </Badge>
                    </h2>
                    <p>
                        We check on a schedule and email you when something goes down or comes back.
                    </p>
                </div>
                <Button color="green" disabled={full} onClick={start}>
                    <Plus size={16} /> Add monitor
                </Button>
            </div>
            {!verifiedEmail && !!monitors?.length && (
                <p className="monitor-hint">
                    <a href="/account/#security">Verify your email</a> to get alert emails.
                </p>
            )}
            {monitors === null ? null : monitors.length ? (
                <div className="account-table-wrap">
                    <table className="account-table">
                        <thead>
                            <tr>
                                <th>Monitor</th>
                                <th>Status</th>
                                <th>Last check</th>
                                <th>
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {monitors.map((monitor) => (
                                <tr key={monitor.id}>
                                    <td>
                                        <div className="monitor-name">
                                            <strong>{monitor.name}</strong>
                                            <small>
                                                {kinds[monitor.kind]}
                                                {monitor.target
                                                    ? ` · ${monitor.kind === 'dns' ? monitor.target : new URL(monitor.target).host}`
                                                    : ''}{' '}
                                                ·{' '}
                                                {monitor.kind === 'ssl'
                                                    ? 'daily'
                                                    : every(monitor.intervalSeconds)}
                                            </small>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge
                                            variant="soft"
                                            color={
                                                monitor.paused
                                                    ? 'gray'
                                                    : monitor.status === 'up'
                                                      ? 'green'
                                                      : monitor.status === 'down'
                                                        ? 'red'
                                                        : 'gray'
                                            }
                                        >
                                            {monitor.paused
                                                ? 'Paused'
                                                : monitor.status === 'up'
                                                  ? 'Up'
                                                  : monitor.status === 'down'
                                                    ? 'Down'
                                                    : 'Waiting'}
                                        </Badge>
                                    </td>
                                    <td className="monitor-last">
                                        {monitor.lastMessage ?? '—'}
                                        {monitor.lastDurationMs !== undefined && (
                                            <small className="muted">
                                                {' '}
                                                · {monitor.lastDurationMs} ms
                                            </small>
                                        )}
                                    </td>
                                    <td>
                                        <DropdownMenu.Root>
                                            <DropdownMenu.Trigger>
                                                <IconButton
                                                    aria-label={`Actions for ${monitor.name}`}
                                                    variant="ghost"
                                                    color="gray"
                                                    size="2"
                                                >
                                                    <DotsThree size={20} />
                                                </IconButton>
                                            </DropdownMenu.Trigger>
                                            <DropdownMenu.Content align="end">
                                                <DropdownMenu.Item
                                                    onSelect={() =>
                                                        void change(
                                                            monitor,
                                                            monitor.paused ? 'resume' : 'pause',
                                                        )
                                                    }
                                                >
                                                    {monitor.paused ? 'Resume' : 'Pause'}
                                                </DropdownMenu.Item>
                                                {monitor.kind === 'dns' &&
                                                    monitor.status === 'down' && (
                                                        <DropdownMenu.Item
                                                            onSelect={() => {
                                                                void api(
                                                                    `/api/monitors/${monitor.id}/accept-dns`,
                                                                    { method: 'POST' },
                                                                )
                                                                    .then(() => load())
                                                                    .catch((failure) =>
                                                                        setError(failure.message),
                                                                    );
                                                            }}
                                                        >
                                                            Accept current DNS records
                                                        </DropdownMenu.Item>
                                                    )}
                                                <DropdownMenu.Item
                                                    onSelect={() => {
                                                        void api(`/api/monitors/${monitor.id}`)
                                                            .then((response) => response.json())
                                                            .then(setHistory)
                                                            .catch((failure) =>
                                                                setError(failure.message),
                                                            );
                                                    }}
                                                >
                                                    Check history
                                                </DropdownMenu.Item>
                                                <DropdownMenu.Item
                                                    color="red"
                                                    onSelect={() => void change(monitor, 'delete')}
                                                >
                                                    Delete
                                                </DropdownMenu.Item>
                                            </DropdownMenu.Content>
                                        </DropdownMenu.Root>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="monitor-empty">
                    <Pulse size={28} />
                    <strong>Nothing is being watched yet.</strong>
                    <p>Add a website, an SSL certificate or a cron job. It takes ten seconds.</p>
                    <Button color="green" onClick={start}>
                        <Plus size={16} /> Add your first monitor
                    </Button>
                </div>
            )}

            <Dialog.Root open={open} onOpenChange={setOpen}>
                <Dialog.Content maxWidth="480px">
                    <Dialog.Title>
                        {pingUrl ? 'Ping this URL from your job' : 'Add a monitor'}
                    </Dialog.Title>
                    {pingUrl ? (
                        <div className="monitor-form">
                            <p>Add this as the last line of your job. We alert you if it stops.</p>
                            <div className="code-row">
                                <code>{`curl -fsS -m 10 ${pingUrl}`}</code>
                                <CopyButton
                                    text={`curl -fsS -m 10 ${pingUrl}`}
                                    label="Copy command"
                                    compact
                                />
                            </div>
                            <p className="monitor-hint">
                                Shown once. To report a failure, call the same URL with /fail.
                            </p>
                            <div className="button-row">
                                <Button color="green" onClick={() => setOpen(false)}>
                                    Done
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <form className="monitor-form" onSubmit={(event) => void create(event)}>
                            <div
                                className="monitor-kinds"
                                role="radiogroup"
                                aria-label="What to watch"
                            >
                                {(Object.keys(kinds) as Monitor['kind'][]).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={kind === value}
                                        className={kind === value ? 'is-active' : ''}
                                        onClick={() => setKind(value)}
                                    >
                                        {kinds[value]}
                                    </button>
                                ))}
                            </div>
                            {kind !== 'heartbeat' && (
                                <label>
                                    {kind === 'ssl' || kind === 'dns' ? 'Domain' : 'URL'}
                                    <input
                                        required
                                        autoFocus
                                        value={target}
                                        placeholder={
                                            kind === 'ssl' || kind === 'dns'
                                                ? 'example.com'
                                                : 'https://example.com'
                                        }
                                        onChange={(event) => setTarget(event.target.value)}
                                    />
                                </label>
                            )}
                            <label>
                                Name
                                <input
                                    required
                                    maxLength={80}
                                    value={name}
                                    placeholder={
                                        kind === 'heartbeat' ? 'Nightly backup' : 'My website'
                                    }
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </label>
                            {kind !== 'ssl' && (
                                <label>
                                    {kind === 'heartbeat' ? 'Runs' : 'Check'}
                                    <Select.Root
                                        value={String(interval)}
                                        onValueChange={(value) => setIntervalSeconds(Number(value))}
                                    >
                                        <Select.Trigger aria-label="Check interval" />
                                        <Select.Content>
                                            {intervals
                                                .filter(([seconds]) => seconds >= minInterval)
                                                .map(([seconds, label]) => (
                                                    <Select.Item
                                                        key={seconds}
                                                        value={String(seconds)}
                                                    >
                                                        {label}
                                                    </Select.Item>
                                                ))}
                                        </Select.Content>
                                    </Select.Root>
                                </label>
                            )}
                            {kind === 'dns' && (
                                <label htmlFor="monitor-record-type">
                                    Record type
                                    <Select.Root
                                        value={dnsRecordType}
                                        onValueChange={setDnsRecordType}
                                    >
                                        <Select.Trigger id="monitor-record-type" />
                                        <Select.Content>
                                            {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'].map(
                                                (type) => (
                                                    <Select.Item key={type} value={type}>
                                                        {type}
                                                    </Select.Item>
                                                ),
                                            )}
                                        </Select.Content>
                                    </Select.Root>
                                    <small>
                                        The first successful lookup becomes the baseline. Changes
                                        alert you until you accept the new records.
                                    </small>
                                </label>
                            )}
                            <details className="monitor-more">
                                <summary>More options</summary>
                                {kind === 'http' && (
                                    <label>
                                        Page must contain
                                        <input
                                            maxLength={200}
                                            value={expectText}
                                            placeholder="Optional, e.g. ok"
                                            onChange={(event) => setExpectText(event.target.value)}
                                        />
                                    </label>
                                )}
                                <label>
                                    Also alert this webhook
                                    <input
                                        type="url"
                                        value={webhook}
                                        placeholder="Optional, e.g. a Slack webhook"
                                        onChange={(event) => setWebhook(event.target.value)}
                                    />
                                </label>
                            </details>
                            {error && (
                                <p className="monitor-error" role="alert">
                                    {error}
                                </p>
                            )}
                            <div className="button-row">
                                <Dialog.Close>
                                    <Button variant="soft" color="gray" type="button">
                                        Cancel
                                    </Button>
                                </Dialog.Close>
                                <Button color="green" type="submit" disabled={busy}>
                                    {busy ? 'Adding…' : 'Add monitor'}
                                </Button>
                            </div>
                        </form>
                    )}
                </Dialog.Content>
            </Dialog.Root>
            <Dialog.Root
                open={Boolean(history)}
                onOpenChange={(open) => {
                    if (!open) setHistory(null);
                }}
            >
                <Dialog.Content maxWidth="640px">
                    <Dialog.Title>{history?.name} · Check history</Dialog.Title>
                    <Dialog.Description>
                        Latest 50 probes, measured from Kivel. These are individual check results.
                    </Dialog.Description>
                    {history?.kind === 'dns' && (
                        <>
                            <h3>Baseline records</h3>
                            <pre className="email-text">
                                {history.dnsBaseline?.join('\n') ?? 'Awaiting first lookup'}
                            </pre>
                            <h3>Last observed records</h3>
                            <pre className="email-text">
                                {history.lastDnsAnswers?.join('\n') ?? 'No successful lookup'}
                            </pre>
                        </>
                    )}
                    <div className="result-table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Checked</th>
                                    <th scope="col">Result</th>
                                    <th scope="col">Probe time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history?.recentChecks
                                    ?.slice()
                                    .reverse()
                                    .map((check) => (
                                        <tr key={check.at}>
                                            <td>{new Date(check.at).toLocaleString()}</td>
                                            <td>{check.status}</td>
                                            <td>{check.durationMs} ms</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="button-row">
                        <Dialog.Close>
                            <Button variant="soft" color="gray">
                                Done
                            </Button>
                        </Dialog.Close>
                    </div>
                </Dialog.Content>
            </Dialog.Root>
        </section>
    );
}
