'use client';

import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { api } from '../lib/api';
import { CopyButton } from './copy-button';

interface Monitor {
    id: string;
    kind: 'http' | 'ssl' | 'heartbeat';
    name: string;
    target?: string;
    intervalSeconds: number;
    status: 'pending' | 'up' | 'down';
    paused: boolean;
    lastCheckAt?: string;
    lastMessage?: string;
}

const intervals = [
    [60, 'Every minute'],
    [300, 'Every 5 minutes'],
    [900, 'Every 15 minutes'],
    [3600, 'Every hour'],
    [86400, 'Every day'],
] as const;

/** Uptime, SSL and heartbeat monitors for the workspace, with alerts on change. */
export function MonitorsPanel({ verifiedEmail }: { verifiedEmail: boolean }) {
    const [monitors, setMonitors] = useState<Monitor[] | null>(null);
    const [limit, setLimit] = useState(0);
    const [minInterval, setMinInterval] = useState(300);
    const [kind, setKind] = useState<Monitor['kind']>('http');
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [interval, setIntervalSeconds] = useState(300);
    const [expectText, setExpectText] = useState('');
    const [webhook, setWebhook] = useState('');
    const [pingUrl, setPingUrl] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

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

    async function create(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError('');
        setPingUrl('');
        try {
            const created = await (
                await api('/api/monitors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        kind,
                        name,
                        ...(kind !== 'heartbeat' ? { target } : {}),
                        intervalSeconds: kind === 'ssl' ? Math.max(interval, 3600) : interval,
                        ...(kind === 'http' && expectText ? { expectText } : {}),
                        ...(webhook ? { alertWebhook: webhook } : {}),
                    }),
                })
            ).json();
            if (created.pingUrl) setPingUrl(created.pingUrl);
            setName('');
            setTarget('');
            setExpectText('');
            await load();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to create the monitor.');
        } finally {
            setBusy(false);
        }
    }
    async function change(monitor: Monitor, action: 'pause' | 'resume' | 'delete') {
        setError('');
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
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to update the monitor.');
        }
    }

    return (
        <div className="settings-stack">
            <section className="settings-card">
                <h2>Monitors</h2>
                <p className="tool-notice">
                    Uptime checks, SSL expiry warnings and heartbeats for scheduled jobs. You are
                    alerted when something goes down and when it recovers.
                    {!verifiedEmail && (
                        <>
                            {' '}
                            <a href="#security">Verify your email</a> to receive alert emails.
                        </>
                    )}
                </p>
                {error && (
                    <div className="alert" role="alert">
                        {error}
                    </div>
                )}
                {monitors === null ? (
                    <p className="tool-notice">Loading…</p>
                ) : monitors.length ? (
                    <ul className="monitor-list">
                        {monitors.map((monitor) => (
                            <li key={monitor.id}>
                                <span
                                    className={`monitor-status is-${monitor.paused ? 'paused' : monitor.status}`}
                                >
                                    {monitor.paused
                                        ? 'Paused'
                                        : monitor.status === 'up'
                                          ? 'Up'
                                          : monitor.status === 'down'
                                            ? 'Down'
                                            : 'Waiting'}
                                </span>
                                <div>
                                    <strong>{monitor.name}</strong>
                                    <small>
                                        {monitor.kind === 'heartbeat'
                                            ? 'Heartbeat'
                                            : monitor.kind === 'ssl'
                                              ? `SSL · ${monitor.target}`
                                              : monitor.target}
                                        {monitor.lastMessage ? ` · ${monitor.lastMessage}` : ''}
                                    </small>
                                </div>
                                <div className="button-row">
                                    <button
                                        className="button button-small"
                                        onClick={() =>
                                            void change(
                                                monitor,
                                                monitor.paused ? 'resume' : 'pause',
                                            )
                                        }
                                    >
                                        {monitor.paused ? 'Resume' : 'Pause'}
                                    </button>
                                    <button
                                        className="button button-small button-danger"
                                        onClick={() => void change(monitor, 'delete')}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="tool-notice">No monitors yet. Add your first one below.</p>
                )}
            </section>
            {pingUrl && (
                <div className="account-secret" role="status">
                    <strong>Add this to the end of your job</strong>
                    <code>{`curl -fsS -m 10 ${pingUrl}`}</code>
                    <div>
                        <CopyButton text={`curl -fsS -m 10 ${pingUrl}`} label="Copy command" />
                    </div>
                    <p>
                        It is shown once. Call <code>{pingUrl}/fail</code> to report a failure right
                        away.
                    </p>
                </div>
            )}
            <section className="settings-card">
                <h2>
                    Add a monitor{' '}
                    <small className="tool-notice">
                        {monitors?.length ?? 0} of {limit}
                    </small>
                </h2>
                <form
                    className="monitor-form inbox-response-form"
                    onSubmit={(event) => void create(event)}
                >
                    <div className="inbox-response-row">
                        <label>
                            Type
                            <select
                                value={kind}
                                onChange={(event) => setKind(event.target.value as Monitor['kind'])}
                            >
                                <option value="http">Website or API</option>
                                <option value="ssl">SSL certificate</option>
                                <option value="heartbeat">Cron job heartbeat</option>
                            </select>
                        </label>
                        <label>
                            Name
                            <input
                                required
                                maxLength={80}
                                value={name}
                                placeholder={kind === 'heartbeat' ? 'Nightly backup' : 'Homepage'}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </label>
                        <label>
                            {kind === 'heartbeat' ? 'Expected every' : 'Check'}
                            <select
                                value={interval}
                                onChange={(event) => setIntervalSeconds(Number(event.target.value))}
                            >
                                {intervals
                                    .filter(([seconds]) => seconds >= minInterval)
                                    .map(([seconds, label]) => (
                                        <option key={seconds} value={seconds}>
                                            {label}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    </div>
                    {kind !== 'heartbeat' && (
                        <label>
                            {kind === 'ssl' ? 'Hostname' : 'URL'}
                            <input
                                required
                                value={target}
                                placeholder={
                                    kind === 'ssl' ? 'example.com' : 'https://example.com/health'
                                }
                                onChange={(event) => setTarget(event.target.value)}
                            />
                        </label>
                    )}
                    {kind === 'http' && (
                        <label>
                            Must contain (optional)
                            <input
                                maxLength={200}
                                value={expectText}
                                placeholder="ok"
                                onChange={(event) => setExpectText(event.target.value)}
                            />
                        </label>
                    )}
                    <label>
                        Alert webhook (optional)
                        <input
                            type="url"
                            value={webhook}
                            placeholder="https://hooks.slack.com/…"
                            onChange={(event) => setWebhook(event.target.value)}
                        />
                    </label>
                    <div className="button-row">
                        <Button size="2" color="green" type="submit" disabled={busy}>
                            {busy ? 'Adding…' : 'Add monitor'}
                        </Button>
                    </div>
                </form>
            </section>
        </div>
    );
}
