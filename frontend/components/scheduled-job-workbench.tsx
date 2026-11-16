'use client';
import Link from 'next/link';
import { legacyAccountLink, workspaceResource } from '../lib/app-routes';
import { useEffect, useState } from 'react';
import { Button, TextArea, TextField, Select, AlertDialog } from '@radix-ui/themes';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
interface Job {
    id: string;
    name: string;
    url: string;
    status: string;
    nextRunAt: string | null;
    remaining: number;
    paused?: boolean;
    cron?: string;
    timezone?: string;
    events: {
        id: string;
        at: string;
        deliveryId?: string;
        status: number | null;
        attempt: number;
        error?: string;
    }[];
}
export function ScheduledJobWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [name, setName] = useState('Test callback'),
        [url, setUrl] = useState(''),
        [body, setBody] = useState('{\n  "event": "test.ready"\n}');
    const [delay, setDelay] = useState('60'),
        [interval, setInterval] = useState(
            toolId === 'automation-temporary-cron-triggers' ? 'cron' : 'once',
        ),
        [runs, setRuns] = useState('5');
    const [cron, setCron] = useState('0 9 * * *');
    const [timezone, setTimezone] = useState(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    );
    const [jobs, setJobs] = useState<Job[]>([]),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    const [id, setId] = useState<string | null>(null);
    useEffect(() => setId(workspaceResource(location.search)), []);
    const endpoint = id ? `/api/scheduled-jobs/${encodeURIComponent(id)}` : '/api/scheduled-jobs';
    async function loadJobs() {
        const data = await (await api(endpoint)).json();
        return id ? [data] : (data.jobs as Job[]);
    }
    async function refresh() {
        setJobs(await loadJobs());
    }
    useEffect(() => {
        if (viewer.status !== 'user') return;
        let live = true;
        setJobs([]);
        setError('');
        const load = () => {
            void loadJobs()
                .then((jobs) => {
                    if (live) setJobs(jobs);
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        };
        load();
        const timer = window.setInterval(load, 10000);
        return () => {
            live = false;
            window.clearInterval(timer);
        };
    }, [endpoint, viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    async function create() {
        setBusy(true);
        setError('');
        try {
            let parsed: unknown;
            try {
                parsed = JSON.parse(body);
            } catch {
                throw new Error('Enter valid JSON for the callback body.');
            }
            await api('/api/scheduled-jobs?ttlSeconds=604800', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    name,
                    url,
                    body: parsed,
                    ...(interval === 'cron'
                        ? { cron, timezone, maxRuns: Number(runs) }
                        : {
                              delaySeconds: Number(delay),
                              ...(interval === 'once'
                                  ? {}
                                  : { intervalSeconds: Number(interval), maxRuns: Number(runs) }),
                          }),
                }),
            });
            await refresh();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to schedule callback.');
        } finally {
            setBusy(false);
        }
    }
    async function toggleJob(job: Job) {
        setBusy(true);
        setError('');
        try {
            await api(`/api/scheduled-jobs/${job.id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ paused: !job.paused }),
            });
            await refresh();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to update the schedule.');
        } finally {
            setBusy(false);
        }
    }
    async function cancel(id: string) {
        setBusy(true);
        setError('');
        try {
            await api(`/api/scheduled-jobs/${id}`, { method: 'DELETE' });
            await refresh();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to cancel.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Schedule your next callback.</h2>
                    <p>
                        Owned jobs survive restarts and keep a delivery history in your workspace.
                    </p>
                    <Link className="button" href={legacyAccountLink('/account/#register')}>
                        Create a free account
                    </Link>
                </div>
            ) : viewer.status === 'loading' ? (
                <p role="status">Loading your workspace…</p>
            ) : (
                <div className={id ? undefined : 'llm-workspace'}>
                    {!id && (
                        <form
                            className="email-create-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void create();
                            }}
                        >
                            <label>
                                Name
                                <TextField.Root
                                    required
                                    maxLength={80}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </label>
                            <label>
                                Destination
                                <TextField.Root
                                    type="url"
                                    required
                                    placeholder="https://your-app.com/webhook"
                                    value={url}
                                    onChange={(event) => setUrl(event.target.value)}
                                />
                            </label>
                            <label>
                                JSON body
                                <TextArea
                                    required
                                    rows={6}
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                />
                            </label>
                            <label>
                                Repeat
                                <Select.Root value={interval} onValueChange={setInterval}>
                                    <Select.Trigger aria-label="Repeat" />
                                    <Select.Content>
                                        <Select.Item value="once">Once</Select.Item>
                                        <Select.Item value="300">Every 5 minutes</Select.Item>
                                        <Select.Item value="3600">Every hour</Select.Item>
                                        <Select.Item value="86400">Every day</Select.Item>
                                        <Select.Item value="cron">Cron schedule</Select.Item>
                                    </Select.Content>
                                </Select.Root>
                            </label>
                            {interval === 'cron' ? (
                                <>
                                    <label>
                                        Cron expression
                                        <TextField.Root
                                            required
                                            maxLength={120}
                                            value={cron}
                                            onChange={(event) => setCron(event.target.value)}
                                        />
                                    </label>
                                    <label>
                                        IANA timezone
                                        <TextField.Root
                                            required
                                            maxLength={80}
                                            placeholder="America/New_York"
                                            value={timezone}
                                            onChange={(event) => setTimezone(event.target.value)}
                                        />
                                    </label>
                                </>
                            ) : (
                                <label>
                                    First delivery in seconds
                                    <TextField.Root
                                        type="number"
                                        min={5}
                                        max={604000}
                                        required
                                        value={delay}
                                        onChange={(event) => setDelay(event.target.value)}
                                    />
                                </label>
                            )}
                            {interval !== 'once' && (
                                <label>
                                    Total deliveries
                                    <TextField.Root
                                        type="number"
                                        min={interval === 'cron' ? 1 : 2}
                                        max={100}
                                        required
                                        value={runs}
                                        onChange={(event) => setRuns(event.target.value)}
                                    />
                                </label>
                            )}
                            <p className="muted">
                                Public HTTP(S) destinations only. Up to 16 KiB of JSON and 100 runs
                                within seven days. Failed deliveries retry twice with the same
                                X-Kivel-Delivery-Id; your receiver should deduplicate it. Delivery
                                timing can vary by a few seconds.
                            </p>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Scheduling…' : 'Schedule callback'}
                            </Button>
                        </form>
                    )}
                    <section className="llm-preview" aria-label="Scheduled callbacks">
                        <div className="section-heading">
                            <h2>Your callbacks</h2>
                            <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                    void refresh().catch((failure) => setError(failure.message));
                                }}
                            >
                                Refresh
                            </Button>
                        </div>
                        {!jobs.length ? (
                            <p className="muted">
                                Scheduled callbacks and delivery results will appear here.
                            </p>
                        ) : (
                            jobs.map((job) => (
                                <article className="monitor-item" key={job.id}>
                                    <div className="section-heading">
                                        <h3>{job.name}</h3>
                                        <span className="pill">
                                            {job.paused ? 'Paused' : job.status}
                                        </span>
                                    </div>
                                    <p className="mono" style={{ overflowWrap: 'anywhere' }}>
                                        {job.url}
                                    </p>
                                    <div className="code-row">
                                        <code>{job.id}</code>
                                        <CopyButton compact text={job.id} label="Copy job ID" />
                                    </div>
                                    {job.cron && (
                                        <p>
                                            <code>{job.cron}</code> · {job.timezone}
                                        </p>
                                    )}
                                    <p className="muted">
                                        {job.paused
                                            ? 'Resume to deliver again.'
                                            : job.nextRunAt
                                              ? `Next: ${new Date(job.nextRunAt).toLocaleString()} · ${job.remaining} remaining`
                                              : 'No further deliveries scheduled.'}
                                    </p>
                                    {job.events.length > 0 && (
                                        <details>
                                            <summary>
                                                Delivery history · {job.events.length}
                                            </summary>
                                            <ul>
                                                {job.events
                                                    .slice()
                                                    .reverse()
                                                    .map((event) => (
                                                        <li key={event.id}>
                                                            {new Date(event.at).toLocaleString()} ·{' '}
                                                            {event.status
                                                                ? `HTTP ${event.status}`
                                                                : event.error}{' '}
                                                            · attempt {event.attempt}
                                                            {event.deliveryId && (
                                                                <CopyButton
                                                                    compact
                                                                    text={event.deliveryId}
                                                                    label="Copy delivery ID"
                                                                />
                                                            )}
                                                        </li>
                                                    ))}
                                            </ul>
                                        </details>
                                    )}
                                    {job.status === 'scheduled' && (
                                        <Button
                                            type="button"
                                            variant="soft"
                                            disabled={busy}
                                            onClick={() => void toggleJob(job)}
                                        >
                                            {job.paused ? 'Resume job' : 'Pause job'}
                                        </Button>
                                    )}
                                    <AlertDialog.Root>
                                        <AlertDialog.Trigger>
                                            <Button variant="soft" color="red" disabled={busy}>
                                                Delete job
                                            </Button>
                                        </AlertDialog.Trigger>
                                        <AlertDialog.Content>
                                            <AlertDialog.Title>
                                                Delete this scheduled job?
                                            </AlertDialog.Title>
                                            <AlertDialog.Description>
                                                Future attempts will stop. A delivery already in
                                                progress may still reach its destination.
                                            </AlertDialog.Description>
                                            <div className="dialog-actions">
                                                <AlertDialog.Cancel>
                                                    <Button variant="soft">Keep job</Button>
                                                </AlertDialog.Cancel>
                                                <AlertDialog.Action>
                                                    <Button
                                                        color="red"
                                                        onClick={() => {
                                                            void cancel(job.id);
                                                        }}
                                                    >
                                                        Delete job
                                                    </Button>
                                                </AlertDialog.Action>
                                            </div>
                                        </AlertDialog.Content>
                                    </AlertDialog.Root>
                                </article>
                            ))
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
