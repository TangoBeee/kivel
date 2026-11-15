'use client';

import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import type { MockCall, MockCallFilters, MockRecordedRoute } from '@kivel.io/sdk';
import { api, resourceHeaders } from '../lib/api';
import { downloadBlob } from './result-preview';

/** Live list of what callers sent to a mock and what it answered. */
export function MockCalls({
    id,
    token,
    websocket = false,
    exportable = false,
    diagnostics = false,
    scenarios = false,
    recordings = false,
    onPromote,
}: {
    id: string;
    token: string;
    websocket?: boolean;
    exportable?: boolean;
    diagnostics?: boolean;
    scenarios?: boolean;
    recordings?: boolean;
    onPromote?: (route: MockRecordedRoute) => void;
}) {
    const [calls, setCalls] = useState<MockCall[]>([]);
    const [open, setOpen] = useState<string | null>(null);
    const [filterInput, setFilterInput] = useState({ method: '', path: '', status: '', run: '' });
    const [filters, setFilters] = useState<MockCallFilters>({});
    const [cursor, setCursor] = useState('');
    const [next, setNext] = useState('');
    const [count, setCount] = useState('1');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);
    const [runId, setRunId] = useState('');
    const [scenarioNotice, setScenarioNotice] = useState('');
    const [candidates, setCandidates] = useState<
        { id: string; at: string; route: MockRecordedRoute }[]
    >([]);
    const [recordingsLoaded, setRecordingsLoaded] = useState(false);
    const [testRequest, setTestRequest] = useState('{"method":"GET","path":"/"}');
    const [match, setMatch] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const search = new URLSearchParams({ limit: '20' });
                for (const [key, value] of Object.entries(filters)) search.set(key, String(value));
                if (cursor) search.set('cursor', cursor);
                const value = await (
                    await api(`/api/mocks/${id}/calls?${search}`, {
                        headers: resourceHeaders(token),
                        signal: controller.signal,
                    })
                ).json();
                if (!controller.signal.aborted) {
                    setCalls(value.calls);
                    setNext(value.nextCursor ?? '');
                    setLoadError('');
                }
            } catch (failure) {
                if (!controller.signal.aborted)
                    setLoadError(
                        failure instanceof Error ? failure.message : 'Unable to load call history.',
                    );
            }
            if (!controller.signal.aborted && !cursor)
                timer = setTimeout(load, document.visibilityState === 'visible' ? 3000 : 15000);
        }
        void load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [id, token, filters, cursor]);
    async function action(path: string, payload?: unknown) {
        setBusy(true);
        setError('');
        if (path === 'assertions') setNotice('');
        try {
            const value = await (
                await api(`/api/mocks/${id}/${path}`, {
                    method: payload === undefined ? 'GET' : 'POST',
                    headers: {
                        ...resourceHeaders(token),
                        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
                    },
                    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
                })
            ).json();
            if (path === 'config')
                downloadBlob(
                    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
                    'kivel-mock.json',
                );
            else if (path === 'match') setMatch(JSON.stringify(value, null, 2));
            else if (path === 'scenarios/reset')
                setScenarioNotice(
                    value.reset ? 'Run reset.' : 'This run was already at its first step.',
                );
            else if (path === 'recordings') {
                setCandidates(value.recordings);
                setRecordingsLoaded(true);
            } else if (path === 'recordings/promote') {
                setCandidates((items) =>
                    items.filter(
                        (item) => item.id !== (payload as { recordingId: string }).recordingId,
                    ),
                );
                onPromote?.(value.route);
            } else
                setNotice(
                    `${value.passed ? 'Passed' : 'Failed'}. ${value.matched} of ${value.retained} retained calls matched. Expected ${value.expected}.${value.olderCallsMayHaveExpired ? ' Older calls may have expired.' : ''}`,
                );
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to check this mock.');
        } finally {
            setBusy(false);
        }
    }
    const wsEvent: Record<string, string> = {
        'WS connect': 'Connected',
        'WS receive': 'Received',
        'WS send': 'Sent',
        'WS close': 'Closed',
    };
    return (
        <section className="mock-calls" aria-label={websocket ? 'Recent traffic' : 'Recent calls'}>
            <div className="mock-calls-heading">
                <strong>{websocket ? 'Recent traffic' : 'Recent calls'}</strong>
                {exportable && (
                    <Button
                        size="2"
                        variant="surface"
                        type="button"
                        onClick={() => void action('config')}
                    >
                        Download configuration
                    </Button>
                )}
            </div>
            <form
                className="mock-call-filter"
                onSubmit={(event) => {
                    event.preventDefault();
                    setCursor('');
                    setOpen(null);
                    setNotice('');
                    setFilters({
                        ...(filterInput.method.trim() ? { method: filterInput.method.trim() } : {}),
                        ...(filterInput.path.trim() ? { path: filterInput.path.trim() } : {}),
                        ...(filterInput.status ? { status: Number(filterInput.status) } : {}),
                        ...(filterInput.run.trim() ? { run: filterInput.run.trim() } : {}),
                    });
                }}
            >
                <label>
                    Method or event
                    <input
                        maxLength={40}
                        value={filterInput.method}
                        onChange={(e) => setFilterInput({ ...filterInput, method: e.target.value })}
                    />
                </label>
                <label>
                    Exact path
                    <input
                        maxLength={512}
                        placeholder="/orders"
                        value={filterInput.path}
                        onChange={(e) => setFilterInput({ ...filterInput, path: e.target.value })}
                    />
                </label>
                <label>
                    Status or close code
                    <input
                        type="number"
                        min="100"
                        max="4999"
                        value={filterInput.status}
                        onChange={(e) => setFilterInput({ ...filterInput, status: e.target.value })}
                    />
                </label>
                {scenarios && (
                    <label>
                        Run ID
                        <input
                            value={filterInput.run}
                            maxLength={64}
                            onChange={(e) =>
                                setFilterInput({ ...filterInput, run: e.target.value })
                            }
                        />
                    </label>
                )}
                <Button size="2" type="submit" variant="surface">
                    Apply filters
                </Button>
            </form>
            {calls.length ? (
                <ul>
                    {calls.map((call, index) => {
                        const key = call.id ?? `${call.at}-${index}`;
                        const connection =
                            websocket && typeof call.query?.connectionId === 'string'
                                ? call.query.connectionId
                                : undefined;
                        const failed =
                            call.method === 'WS close'
                                ? ![1000, 1001].includes(call.status)
                                : call.status >= 400;
                        const frame = call.method === 'WS receive' || call.method === 'WS send';
                        return (
                            <li key={key}>
                                <button
                                    type="button"
                                    aria-expanded={open === key}
                                    onClick={() => setOpen(open === key ? null : key)}
                                >
                                    <span className="mock-call-method">
                                        {wsEvent[call.method] ?? call.method}
                                    </span>
                                    <code
                                        className="mock-call-path"
                                        title={connection ?? call.path}
                                    >
                                        {connection?.slice(0, 8) ?? call.path}
                                    </code>
                                    <span
                                        className={`mock-call-status ${failed ? 'is-error' : ''}`}
                                    >
                                        {frame ? `${call.bodySize} B` : call.status}
                                    </span>
                                    <span className="mock-call-meta">
                                        {call.durationMs} ms ·{' '}
                                        {new Date(call.at).toLocaleTimeString()}
                                    </span>
                                </button>
                                {open === key && (
                                    <pre>
                                        {call.bodyPreview ??
                                            (call.bodySize
                                                ? `${call.bodySize} bytes (binary)`
                                                : 'No body')}
                                    </pre>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p>
                    {Object.keys(filters).length
                        ? 'No calls match these filters.'
                        : websocket
                          ? 'Connect a client to see its messages and close code here.'
                          : 'Call your mock and each request appears here within a few seconds.'}
                </p>
            )}
            {(cursor || next) && (
                <div className="button-row">
                    {cursor && (
                        <Button
                            size="2"
                            variant="surface"
                            type="button"
                            onClick={() => setCursor('')}
                        >
                            Latest calls
                        </Button>
                    )}
                    {next && (
                        <Button
                            size="2"
                            variant="surface"
                            type="button"
                            onClick={() => setCursor(next)}
                        >
                            Older calls
                        </Button>
                    )}
                </div>
            )}
            <details>
                <summary>Assert call count</summary>
                <form
                    className="mock-call-filter"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void action('assertions', { ...filters, count: Number(count) });
                    }}
                >
                    <label>
                        Expected matches for the active filters
                        <input
                            type="number"
                            min="0"
                            max="100"
                            required
                            value={count}
                            onChange={(event) => setCount(event.target.value)}
                        />
                    </label>
                    <Button size="2" type="submit" variant="surface" disabled={busy}>
                        Check count
                    </Button>
                </form>
                {notice && <p role="status">{notice}</p>}
            </details>
            {diagnostics && (
                <details>
                    <summary>Check route matching</summary>
                    <form
                        className="mock-call-filter"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setMatch('');
                            try {
                                void action('match', JSON.parse(testRequest));
                            } catch {
                                setError('Enter valid JSON for the request.');
                            }
                        }}
                    >
                        <label>
                            Request to match
                            <textarea
                                rows={4}
                                maxLength={15000}
                                value={testRequest}
                                onChange={(event) => setTestRequest(event.target.value)}
                            />
                        </label>
                        <Button size="2" type="submit" variant="surface" disabled={busy}>
                            Find matching route
                        </Button>
                    </form>
                    {match && <pre>{match}</pre>}
                </details>
            )}
            {scenarios && (
                <details>
                    <summary>Reset a scenario run</summary>
                    <form
                        className="mock-call-filter"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setScenarioNotice('');
                            void action('scenarios/reset', { run: runId });
                        }}
                    >
                        <label>
                            Run ID
                            <input
                                value={runId}
                                required
                                pattern="[A-Za-z0-9_\-]{1,64}"
                                maxLength={64}
                                onChange={(event) => setRunId(event.target.value)}
                            />
                        </label>
                        <Button size="2" type="submit" variant="surface" disabled={busy}>
                            Reset run
                        </Button>
                    </form>
                    {scenarioNotice && <p role="status">{scenarioNotice}</p>}
                </details>
            )}
            {recordings && (
                <details>
                    <summary>Review proxy recordings</summary>
                    <Button
                        size="2"
                        type="button"
                        variant="surface"
                        disabled={busy}
                        onClick={() => void action('recordings')}
                    >
                        Load recordings
                    </Button>
                    {recordingsLoaded && !candidates.length && <p>No recordings to review.</p>}
                    {candidates.map(({ id: recordingId, at, route }) => (
                        <details key={recordingId}>
                            <summary>
                                {route.method} {route.path} · {route.status} ·{' '}
                                {new Date(at).toLocaleTimeString()}
                            </summary>
                            <pre>{route.body}</pre>
                            <Button
                                size="2"
                                type="button"
                                variant="surface"
                                disabled={busy}
                                onClick={() => void action('recordings/promote', { recordingId })}
                            >
                                Save as fixture
                            </Button>
                        </details>
                    ))}
                </details>
            )}
            {loadError && (
                <p className="alert" role="alert">
                    {loadError}
                </p>
            )}
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}
