'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { AppSelect, SelectOption } from './app-select';
import { CodeExample } from './code-example';
import { ResultPreview } from './result-preview';
import { parseJsonSafely } from '@kivel/tools/engine';
type EchoResource = {
    id: string;
    endpointUrl?: string;
    accessToken?: string;
    visibility?: string;
    expiresAt: string;
};
type EchoResult = {
    method: string;
    path: string;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    contentType: string | null;
    body: { kind: string; bytes: number; value?: unknown; notice?: string };
    receivedAt: string;
    notice: string;
};
export function EchoWorkbench({
    resource,
    name,
    busy,
    onName,
    onSubmit,
}: {
    resource: EchoResource | null;
    name: string;
    busy: boolean;
    onName: (name: string) => void;
    onSubmit: () => void;
}) {
    const [method, setMethod] = useState('POST'),
        [path, setPath] = useState('/check?source=workbench'),
        [headers, setHeaders] = useState('x-demo-source: kivel'),
        [body, setBody] = useState(
            '{\n  "event": "demo.created",\n  "data": { "id": "demo_1", "ready": true }\n}',
        ),
        [contentType, setContentType] = useState('application/json'),
        [running, setRunning] = useState(false),
        [error, setError] = useState(''),
        [result, setResult] = useState<EchoResult | null>(null),
        [elapsed, setElapsed] = useState(0);
    const pending = useRef<AbortController | null>(null),
        output = useRef<HTMLElement | null>(null);
    useEffect(() => {
        setResult(null);
        setError('');
        return () => pending.current?.abort();
    }, [resource?.id, resource?.accessToken, resource?.visibility]);
    const live = resource && Date.parse(resource.expiresAt) > Date.now();
    async function run() {
        if (!resource?.endpointUrl) return;
        setError('');
        setResult(null);
        try {
            if (!/^\/(?!\/)[^#\s]*$/.test(path) || path.length > 500 || path.includes('..'))
                throw Error(
                    'Use a relative path such as /check?source=demo, up to 500 characters.',
                );
            const requestHeaders: Record<string, string> = {};
            for (const line of headers.split('\n').filter((line) => line.trim())) {
                const colon = line.indexOf(':');
                const key = line.slice(0, colon).trim().toLowerCase(),
                    value = line.slice(colon + 1).trim();
                if (
                    colon < 1 ||
                    !/^(?:accept|x-[a-z0-9-]+)$/.test(key) ||
                    /token|key|secret|credential|forwarded|real-ip|origin|host/.test(key) ||
                    /[\x00-\x1f\x7f]/.test(value) ||
                    value.length > 512 ||
                    Object.hasOwn(requestHeaders, key)
                )
                    throw Error(
                        'Use unique Accept or non-credential X-* headers, up to 512 characters per value.',
                    );
                requestHeaders[key] = value;
            }
            if (Object.keys(requestHeaders).length > 10)
                throw Error('Use at most ten custom headers.');
            const hasBody = !['GET', 'HEAD'].includes(method) && body.length > 0;
            if (new TextEncoder().encode(body).length > 65536)
                throw Error('Workbench bodies are limited to 64 KiB.');
            if (hasBody) {
                if (contentType === 'application/json') parseJsonSafely(body);
                requestHeaders['Content-Type'] = contentType;
            }
            if (resource.accessToken) requestHeaders['X-Access-Token'] = resource.accessToken;
            pending.current?.abort();
            const controller = new AbortController();
            pending.current = controller;
            const timeout = setTimeout(() => controller.abort(), 10000);
            setRunning(true);
            const start = performance.now();
            try {
                const response = await fetch(resource.endpointUrl + path, {
                    method,
                    headers: requestHeaders,
                    ...(hasBody ? { body } : {}),
                    signal: controller.signal,
                    redirect: process.env.NODE_ENV === 'development' ? 'follow' : 'error',
                });
                if (!response.ok) {
                    const value = await response.json();
                    throw Error(value.error ?? `HTTP ${response.status}`);
                }
                if (controller.signal.aborted) return;
                setElapsed(Math.round(performance.now() - start));
                if (method === 'HEAD')
                    setResult({
                        method,
                        path,
                        query: {},
                        headers: {},
                        contentType: null,
                        body: { kind: 'empty', bytes: 0 },
                        receivedAt: new Date().toISOString(),
                        notice: 'HEAD succeeded. HTTP omits the response body.',
                    });
                else setResult(await response.json());
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            if (!pending.current?.signal.aborted)
                setError(error instanceof Error ? error.message : 'Request failed.');
        } finally {
            setRunning(false);
        }
    }
    useEffect(() => {
        if (result)
            output.current?.scrollIntoView({
                block: 'start',
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'instant'
                    : 'smooth',
            });
    }, [result]);
    return (
        <>
            <section className="resource-editor echo-editor">
                <h2>{live ? 'Endpoint settings' : 'See what reaches your server'}</h2>
                <p>
                    Send a request from your app, curl, or this workbench. The response shows what
                    the server received, with credential fields redacted.
                </p>
                <label>
                    Endpoint name
                    <TextField.Root
                        aria-label="Echo endpoint name"
                        value={name}
                        maxLength={80}
                        disabled={busy}
                        onChange={(event) => onName(event.target.value)}
                    />
                </label>
                <Button size="3" disabled={busy || !name.trim()} onClick={onSubmit}>
                    {busy ? 'Saving…' : live ? 'Save endpoint name' : 'Create echo endpoint'}
                </Button>
            </section>
            {live && (
                <section className="crud-live echo-workbench" aria-label="Echo request workbench">
                    <div className="crud-heading">
                        <div>
                            <span className="tool-tag">Request lab</span>
                            <h2>Send it. Inspect it.</h2>
                            <p>Requests run only when you press Send. No history is stored.</p>
                        </div>
                    </div>
                    <div className="echo-request-line">
                        <AppSelect
                            aria-label="Echo method"
                            disabled={running || busy}
                            value={method}
                            onChange={(value) => {
                                setMethod(value.target.value);
                                setResult(null);
                            }}
                        >
                            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(
                                (value) => (
                                    <SelectOption key={value} value={value}>
                                        {value}
                                    </SelectOption>
                                ),
                            )}
                        </AppSelect>
                        <TextField.Root
                            aria-label="Echo request path"
                            disabled={running || busy}
                            value={path}
                            maxLength={500}
                            onChange={(event) => {
                                setPath(event.target.value);
                                setResult(null);
                            }}
                        />
                        <Button size="3" disabled={running || busy} onClick={() => void run()}>
                            {running ? 'Sending…' : 'Send request'}
                        </Button>
                    </div>
                    <div className="echo-request-fields">
                        <label>
                            Custom headers
                            <TextArea
                                aria-label="Echo custom headers"
                                disabled={running || busy}
                                value={headers}
                                rows={5}
                                maxLength={6000}
                                onChange={(event) => {
                                    setHeaders(event.target.value);
                                    setResult(null);
                                }}
                            />
                            <span>
                                One Name: value per line. Caller credentials are attached
                                separately.
                            </span>
                        </label>
                        <div>
                            <AppSelect
                                aria-label="Echo body format"
                                disabled={running || busy}
                                value={contentType}
                                onChange={(value) => {
                                    setContentType(value.target.value);
                                    setResult(null);
                                }}
                            >
                                <SelectOption value="application/json">JSON body</SelectOption>
                                <SelectOption value="text/plain">Plain text body</SelectOption>
                            </AppSelect>
                            <TextArea
                                aria-label="Echo request body"
                                value={body}
                                rows={7}
                                disabled={running || busy || ['GET', 'HEAD'].includes(method)}
                                maxLength={65536}
                                onChange={(event) => {
                                    setBody(event.target.value);
                                    setResult(null);
                                }}
                            />
                        </div>
                    </div>
                    {error && (
                        <p className="alert" role="alert">
                            {error}
                        </p>
                    )}
                    {result && (
                        <section className="echo-result" ref={output} aria-label="Observed request">
                            <div className="echo-summary">
                                <div>
                                    <span>Method</span>
                                    <strong>{result.method}</strong>
                                </div>
                                <div>
                                    <span>Body received</span>
                                    <strong>{result.body.bytes.toLocaleString()} bytes</strong>
                                </div>
                                <div>
                                    <span>Round trip</span>
                                    <strong>{elapsed} ms</strong>
                                </div>
                            </div>
                            {result.method !== 'HEAD' && (
                                <p className="tool-notice">
                                    Received at {new Date(result.receivedAt).toLocaleTimeString()} ·{' '}
                                    {result.contentType ?? 'No content type'}
                                </p>
                            )}
                            <h3>Observed path</h3>
                            <code className="echo-path">{result.path}</code>
                            <div className="echo-result-columns">
                                <section>
                                    <h3>Query parameters</h3>
                                    <EchoFields
                                        values={result.query}
                                        empty="No query parameters."
                                    />
                                    <h3>
                                        Body <span className="tool-tag">{result.body.kind}</span>
                                    </h3>
                                    {result.body.value !== undefined ? (
                                        <ResultPreview
                                            text={
                                                typeof result.body.value === 'string'
                                                    ? result.body.value
                                                    : JSON.stringify(result.body.value, null, 2)
                                            }
                                        />
                                    ) : (
                                        <p>{result.body.notice ?? 'No request body.'}</p>
                                    )}
                                </section>
                                <section>
                                    <h3>Observed headers</h3>
                                    <div
                                        className="echo-observed-headers"
                                        tabIndex={0}
                                        role="region"
                                        aria-label="Observed header list"
                                    >
                                        <EchoFields
                                            values={result.headers}
                                            empty="No response body for HEAD."
                                        />
                                    </div>
                                </section>
                            </div>
                            <p className="tool-notice">
                                {result.body.notice} {result.notice} Use synthetic data; redaction
                                cannot recognize every secret in arbitrary text.
                            </p>
                        </section>
                    )}
                    <details className="crud-client-examples">
                        <summary>Use from curl, SDK, CLI, SSH or MCP</summary>
                        <CodeExample
                            title="Echo client examples"
                            code={`curl -X POST '${resource.endpointUrl}/check?source=curl' \\\n  -H 'Content-Type: application/json' \\\n${resource.visibility === 'private' ? "  -H 'X-Access-Token: <access-token>' \\\n" : ''}  --data '{"event":"demo.created"}'\n\nconst observed = await socket.request('POST', '/mock/${resource.id}/check',\n  { event: 'demo.created' }, accessToken);\n\n// CLI / SSH: kivel api GET /mock/${resource.id}/check --token <access-token>\n// MCP: call_mock_api {id, method: 'POST', path: '/check', body, accessToken}`}
                        />
                    </details>
                </section>
            )}
        </>
    );
}
function EchoFields({ values, empty }: { values: Record<string, unknown>; empty: string }) {
    return Object.keys(values).length ? (
        <dl className="echo-fields">
            {Object.entries(values).map(([key, value]) => (
                <div key={key}>
                    <dt>{key}</dt>
                    <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                </div>
            ))}
        </dl>
    ) : (
        <p className="tool-notice">{empty}</p>
    );
}
