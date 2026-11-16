'use client';

import { useEffect, useState } from 'react';
import { Button, TextArea } from '@radix-ui/themes';
import type { MockCall, MockRecordedRoute } from '@kivel.io/sdk';
import { api, resourceHeaders } from '../lib/api';
import { downloadBlob, ResultPreview } from './result-preview';

type MockAccess = { id: string; token: string };
type CallSummary = Pick<MockCall, 'id' | 'at' | 'path' | 'method' | 'status' | 'durationMs'>;
type Assertion = {
    passed: boolean;
    expected: number;
    matched: number;
    calls: CallSummary[];
    olderCallsMayHaveExpired?: boolean;
};
const emptyFilters = { method: '', path: '', status: '', run: '' };
const events: Record<string, string> = {
    'WS connect': 'Connected',
    'WS receive': 'Received',
    'WS send': 'Sent',
    'WS close': 'Closed',
};

function statusTone(call: Pick<CallSummary, 'method' | 'status'>) {
    if (call.method === 'WS close')
        return call.status === 1000 || call.status === 1001 ? 'success' : 'danger';
    if (call.status >= 500) return 'danger';
    if (call.status >= 400) return 'warning';
    return call.status >= 200 && call.status < 300 ? 'success' : 'neutral';
}

function CallRow({
    call,
    websocket = false,
}: {
    call: MockCall | CallSummary;
    websocket?: boolean;
}) {
    const connection =
        websocket && 'query' in call && typeof call.query.connectionId === 'string'
            ? call.query.connectionId
            : undefined;
    const frame = call.method === 'WS receive' || call.method === 'WS send';
    const at = new Date(call.at);
    return (
        <>
            <span className="mock-call-method">{events[call.method] ?? call.method}</span>
            <code className="mock-call-path" title={connection ?? call.path}>
                {connection?.slice(0, 8) ?? call.path}
            </code>
            <span className="mock-call-status" data-tone={statusTone(call)}>
                {frame && 'bodySize' in call ? `${call.bodySize} B` : call.status}
            </span>
            <span className="mock-call-duration">{call.durationMs} ms</span>
            <time dateTime={call.at} title={at.toLocaleString()}>
                {at.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })}
            </time>
        </>
    );
}

function mockRequest(
    { id, token }: MockAccess,
    path: string,
    payload?: unknown,
    signal?: AbortSignal,
) {
    return api(`/api/mocks/${id}/${path}`, {
        headers: {
            ...resourceHeaders(token),
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { method: 'POST', body: JSON.stringify(payload) }),
        signal,
    }).then((response) => response.json());
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete this mock request.';
}

export function MockCalls({
    id,
    token,
    websocket = false,
    exportable = false,
    scenarios = false,
}: MockAccess & {
    websocket?: boolean;
    exportable?: boolean;
    scenarios?: boolean;
}) {
    const [calls, setCalls] = useState<MockCall[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [input, setInput] = useState(emptyFilters);
    const [filterQuery, setFilterQuery] = useState('');
    const [cursor, setCursor] = useState('');
    const [next, setNext] = useState('');
    const [count, setCount] = useState('1');
    const [assertion, setAssertion] = useState<Assertion | null>(null);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);
    const wanted = new URLSearchParams(
        Object.entries(input)
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => value),
    ).toString();
    const status = Number(input.status);
    const valid =
        (!input.method.trim() || /^[A-Za-z][A-Za-z0-9_/. -]{0,39}$/.test(input.method.trim())) &&
        (!input.path.trim() || /^\/[^?\x00-\x20]{0,511}$/.test(input.path.trim())) &&
        (!input.run.trim() || /^[A-Za-z0-9_-]{1,64}$/.test(input.run.trim())) &&
        (!input.status.trim() ||
            (/^\d{3,4}$/.test(input.status.trim()) &&
                ((status >= 100 && status <= 599) || (status >= 1000 && status <= 4999))));
    useEffect(() => {
        if (!valid || wanted === filterQuery) return;
        const timer = setTimeout(() => {
            setCalls(null);
            setCursor('');
            setNext('');
            setFilterQuery(wanted);
        }, 240);
        return () => clearTimeout(timer);
    }, [wanted, valid, filterQuery]);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const query = new URLSearchParams(filterQuery);
                query.set('limit', '20');
                if (cursor) query.set('cursor', cursor);
                const page = await mockRequest(
                    { id, token },
                    `calls?${query}`,
                    undefined,
                    controller.signal,
                );
                if (!controller.signal.aborted) {
                    setCalls(page.calls);
                    setNext(page.nextCursor ?? '');
                    setLoadError('');
                }
            } catch (error) {
                if (!controller.signal.aborted) setLoadError(errorMessage(error));
            }
            if (!controller.signal.aborted && !cursor)
                timer = setTimeout(load, document.visibilityState === 'visible' ? 3000 : 15000);
        }
        void load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [id, token, filterQuery, cursor]);

    async function runAssertion() {
        setBusy(true);
        setError('');
        setAssertion(null);
        try {
            const filters = Object.fromEntries(new URLSearchParams(filterQuery));
            setAssertion(
                await mockRequest({ id, token }, 'assertions', {
                    ...filters,
                    count: Number(count),
                    includeCalls: true,
                }),
            );
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mock-calls" aria-label={websocket ? 'Recent traffic' : 'Recent calls'}>
            <div className="mock-panel-heading">
                <h2>{websocket ? 'Recent traffic' : 'Recent calls'}</h2>
                {exportable && <MockConfigDownload id={id} token={token} />}
            </div>
            <div className="mock-call-filter" role="group" aria-label="Filter recent calls">
                {(
                    [
                        'method',
                        'path',
                        'status',
                        ...(scenarios ? ['run'] : []),
                    ] as (keyof typeof input)[]
                ).map((key) => (
                    <label key={key}>
                        {{ method: 'Method', path: 'Path', status: 'Status', run: 'Run ID' }[key]}
                        <input
                            value={input[key]}
                            inputMode={key === 'status' ? 'numeric' : undefined}
                            spellCheck={false}
                            maxLength={{ method: 40, path: 512, status: 4, run: 64 }[key]}
                            placeholder={
                                {
                                    method: websocket ? 'WS receive' : 'POST',
                                    path: '/orders',
                                    status: '201',
                                    run: 'run-01',
                                }[key]
                            }
                            disabled={busy}
                            onChange={(e) => {
                                setInput({ ...input, [key]: e.target.value });
                                setOpen(null);
                                setAssertion(null);
                            }}
                        />
                    </label>
                ))}
            </div>
            {!valid && (
                <p className="small muted">
                    Use a path starting with /, a complete status code and a valid run ID.
                </p>
            )}
            {loadError && (
                <p className="alert" role="alert">
                    {loadError}
                </p>
            )}
            {!calls && !loadError && <p role="status">Loading recent calls…</p>}
            {calls?.length ? (
                <ul className="mock-call-list" aria-label="Captured calls">
                    {calls.map((call, index) => {
                        const key = call.id ?? `${call.at}-${index}`;
                        return (
                            <li key={key}>
                                <button
                                    type="button"
                                    className="mock-call-row"
                                    aria-expanded={open === key}
                                    onClick={() => setOpen(open === key ? null : key)}
                                >
                                    <CallRow call={call} websocket={websocket} />
                                </button>
                                {open === key && (
                                    <div className="mock-call-body">
                                        {call.bodyPreview ? (
                                            <>
                                                <ResultPreview
                                                    text={call.bodyPreview}
                                                    title={websocket ? 'Message' : 'Request body'}
                                                    downloadable={false}
                                                    initialFormatted
                                                />
                                                {new TextEncoder().encode(call.bodyPreview).length <
                                                    call.bodySize && (
                                                    <p className="small muted">
                                                        Showing a preview of{' '}
                                                        {call.bodySize.toLocaleString()} bytes.
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="small muted">
                                                {call.bodySize
                                                    ? `Binary body · ${call.bodySize.toLocaleString()} bytes`
                                                    : 'No request body.'}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : calls && !loadError ? (
                <p className="mock-call-empty">
                    {filterQuery
                        ? 'No calls match these filters.'
                        : websocket
                          ? 'Connect a client to see its traffic here.'
                          : 'Send a request to your endpoint to see it here.'}
                </p>
            ) : null}
            {(cursor || next) && (
                <div className="button-row mock-call-pages">
                    {cursor && (
                        <Button
                            size="2"
                            variant="surface"
                            onClick={() => {
                                setCursor('');
                                setOpen(null);
                            }}
                        >
                            Latest calls
                        </Button>
                    )}
                    {next && (
                        <Button
                            size="2"
                            variant="surface"
                            onClick={() => {
                                setCursor(next);
                                setOpen(null);
                            }}
                        >
                            Older calls
                        </Button>
                    )}
                </div>
            )}
            <section className="mock-assertion" aria-label="Call count assertion">
                <h3>Check call count</h3>
                <form
                    className="mock-call-filter"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void runAssertion();
                    }}
                >
                    <label>
                        Expected matches
                        <input
                            type="number"
                            min="0"
                            max="100"
                            required
                            value={count}
                            disabled={busy}
                            onChange={(event) => {
                                setCount(event.target.value);
                                setAssertion(null);
                            }}
                        />
                    </label>
                    <Button
                        size="2"
                        type="submit"
                        variant="surface"
                        disabled={busy || !valid || wanted !== filterQuery}
                    >
                        {busy ? 'Checking…' : 'Check count'}
                    </Button>
                </form>
                {error && (
                    <p className="alert" role="alert">
                        {error}
                    </p>
                )}
                {assertion && (
                    <div className="mock-assertion-result" data-passed={assertion.passed}>
                        <p role="status">
                            {assertion.passed
                                ? `Passed: ${assertion.matched} of ${assertion.expected}`
                                : `Failed: expected ${assertion.expected}, got ${assertion.matched}`}
                        </p>
                        {assertion.calls.length > 0 && (
                            <ul className="mock-call-list" aria-label="Matching calls">
                                {assertion.calls.map((call, index) => (
                                    <li key={call.id ?? index}>
                                        <div className="mock-call-row">
                                            <CallRow call={call} websocket={websocket} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {assertion.olderCallsMayHaveExpired && (
                            <p className="small muted">Older calls may have expired.</p>
                        )}
                    </div>
                )}
            </section>
        </section>
    );
}

export function MockConfigDownload({ id, token }: MockAccess) {
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <div>
            <Button
                size="2"
                variant="surface"
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                        const config = await mockRequest({ id, token }, 'config');
                        downloadBlob(
                            new Blob([JSON.stringify(config, null, 2)], {
                                type: 'application/json',
                            }),
                            'kivel-mock.json',
                        );
                    } catch (error) {
                        setError(errorMessage(error));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                Download configuration
            </Button>
            {error && <p role="alert">{error}</p>}
        </div>
    );
}

export function MockRouteMatch({ id, token }: MockAccess) {
    const [request, setRequest] = useState('{"method":"GET","path":"/"}');
    const [match, setMatch] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <section className="mock-panel-card" aria-label="Route diagnostics">
            <h2>Check route matching</h2>
            <p>See which saved route would handle a request.</p>
            <form
                onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    setMatch('');
                    try {
                        setMatch(
                            JSON.stringify(
                                await mockRequest({ id, token }, 'match', JSON.parse(request)),
                                null,
                                2,
                            ),
                        );
                    } catch (error) {
                        setError(
                            error instanceof SyntaxError
                                ? 'Enter valid JSON for the request.'
                                : errorMessage(error),
                        );
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <label className="field-label">
                    Request to match
                    <TextArea
                        rows={4}
                        maxLength={15000}
                        value={request}
                        onChange={(event) => setRequest(event.target.value)}
                    />
                </label>
                <Button size="2" type="submit" variant="surface" disabled={busy}>
                    Find matching route
                </Button>
            </form>
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {match && <ResultPreview text={match} title="Route match" downloadable={false} />}
        </section>
    );
}

export function MockScenarioRuns({ id, token }: MockAccess) {
    const [run, setRun] = useState('');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <section className="mock-panel-card" aria-label="Scenario runs">
            <h2>Scenario runs</h2>
            <p>
                Send a run ID in <code>X-Kivel-Mock-Run</code> to keep each run separate. Reset a
                run to put it back at its first step.
            </p>
            <form
                className="mock-call-filter"
                onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    setNotice('');
                    try {
                        const value = await mockRequest({ id, token }, 'scenarios/reset', { run });
                        setNotice(
                            value.reset ? 'Run reset.' : 'This run was already at its first step.',
                        );
                    } catch (error) {
                        setError(errorMessage(error));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <label>
                    Run ID
                    <input
                        required
                        maxLength={64}
                        pattern="[A-Za-z0-9_\-]{1,64}"
                        value={run}
                        onChange={(event) => setRun(event.target.value)}
                    />
                </label>
                <Button size="2" type="submit" variant="surface" disabled={busy}>
                    Reset run
                </Button>
            </form>
            {notice && <p role="status">{notice}</p>}
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}

export function MockRecordings({
    id,
    token,
    onPromote,
}: MockAccess & { onPromote: (route: MockRecordedRoute) => void }) {
    const [recordings, setRecordings] = useState<
        { id: string; at: string; route: MockRecordedRoute }[] | null
    >(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [updated, setUpdated] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        mockRequest({ id, token }, 'recordings', undefined, controller.signal)
            .then((value) => {
                if (!controller.signal.aborted) setRecordings(value.recordings);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(errorMessage(error));
            });
        return () => controller.abort();
    }, [id, token, updated]);
    return (
        <section className="mock-panel-card" aria-label="Proxy recordings">
            <div className="mock-panel-heading">
                <h2>Proxy recordings</h2>
                <Button
                    size="2"
                    variant="surface"
                    disabled={busy}
                    onClick={() => setUpdated((value) => value + 1)}
                >
                    Refresh
                </Button>
            </div>
            <p>Review a recorded response before saving it as a route.</p>
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {!recordings && !error && <p role="status">Loading recordings…</p>}
            {recordings?.length === 0 && <p>No recordings to review.</p>}
            {recordings && recordings.length > 0 && (
                <ul className="mock-call-list">
                    {recordings.map(({ id: key, at, route }) => (
                        <li key={key}>
                            <button
                                type="button"
                                className="mock-call-row"
                                aria-expanded={selected === key}
                                onClick={() => setSelected(selected === key ? null : key)}
                            >
                                <span className="mock-call-method">{route.method}</span>
                                <code className="mock-call-path" title={route.path}>
                                    {route.path}
                                </code>
                                <span className="mock-call-status" data-tone={statusTone(route)}>
                                    {route.status}
                                </span>
                                <time dateTime={at} title={new Date(at).toLocaleString()}>
                                    {new Date(at).toLocaleTimeString()}
                                </time>
                            </button>
                            {selected === key && (
                                <div className="mock-call-body">
                                    <ResultPreview
                                        text={route.body}
                                        title="Recorded response"
                                        downloadable={false}
                                        initialFormatted
                                    />
                                    <Button
                                        size="2"
                                        variant="surface"
                                        disabled={busy}
                                        onClick={async () => {
                                            setBusy(true);
                                            setError('');
                                            try {
                                                const value = await mockRequest(
                                                    { id, token },
                                                    'recordings/promote',
                                                    { recordingId: key },
                                                );
                                                setRecordings(
                                                    (items) =>
                                                        items?.filter((item) => item.id !== key) ??
                                                        [],
                                                );
                                                onPromote(value.route);
                                            } catch (error) {
                                                setError(errorMessage(error));
                                            } finally {
                                                setBusy(false);
                                            }
                                        }}
                                    >
                                        Save as fixture
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
