'use client';
import Link from 'next/link';
import { EchoWorkbench } from './echo-workbench';
import { StreamEventsPreview, renderToolResult } from './tool-result';
import { McpToolEditor } from './mcp-tool-editor';
import { mockPreset } from '@socket-help/tools/mock-presets';
import type { MockRoute } from '@socket-help/tools/mock-config';
import { validateMock } from '@socket-help/tools/mock-config';
import { formatJson } from '@socket-help/tools/engine';
import { AppSelect, SelectOption } from './app-select';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, Button } from '@radix-ui/themes';
import { useReducedMotion } from 'motion/react';
import { api, resourceHeaders } from '../lib/api';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
import { FilePicker } from './file-picker';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { BlobPreview, RemoteFilePreview } from './file-preview';
import { ResultPreview } from './result-preview';
import { Icon } from './icons';
import { MockCalls } from './mock-calls';
import { useViewer } from '../lib/viewer';
import { CrudConfiguration, CrudRecords, defaultCrudSeed } from './crud-workbench';
import { validateCrud } from '@socket-help/tools/mock-crud';
import { parseJsonSafely } from '@socket-help/tools/engine';

type Route = MockRoute;
type Resource = {
    id: string;
    visibility?: Visibility;
    accessToken?: string;
    accessVersion?: string;
    managementToken: string;
    expiresAt: string;
    endpointUrl?: string;
    downloadUrl?: string;
    name?: string;
    size?: number;
    uses?: number;
    remainingDownloads?: number;
};
const freshRoute = (): Route => ({
    method: 'GET',
    path: '/hello',
    status: 200,
    body: '{\n  "message": "Hello from Kivel"\n}',
    headers: { 'content-type': 'application/json' },
    delayMs: 0,
});
const clock = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function restore(key: string): Resource | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (
            /^[a-f0-9-]{36}$/i.test(value?.id) &&
            typeof value?.managementToken === 'string' &&
            (value.managementToken === '' || /^[A-Za-z0-9_-]{43}$/.test(value.managementToken)) &&
            Date.parse(value?.expiresAt) > Date.now()
        )
            return value;
    } catch {}
    return null;
}
function remember(key: string, value: Resource | null) {
    try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
    } catch {}
}

export function ResourceWorkbench({
    toolId,
    kind,
}: {
    toolId: string;
    kind: 'mock' | 'file' | 'mcp';
}) {
    const inlineFormat =
        toolId === 'files-temporary-json-storage'
            ? 'json'
            : [
                    'files-text-code-sharing',
                    'everyday-temporary-notes',
                    'developer-code-paste-sharing',
                ].includes(toolId)
              ? 'text'
              : undefined;
    const [text, setText] = useState('');
    const [importConfig, setImportConfig] = useState('');
    const [echoMode, setEchoMode] = useState(toolId === 'network-http-echo');
    const [crudMode, setCrudMode] = useState(toolId === 'mock-apis-stateful-crud-api');
    const [crudPath, setCrudPath] = useState('/items');
    const [crudSeed, setCrudSeed] = useState(defaultCrudSeed);
    const [crudVersion, setCrudVersion] = useState(0);
    const [resource, setResource] = useState<Resource | null>(null);
    const [name, setName] = useState(
        inlineFormat === 'json'
            ? 'document.json'
            : inlineFormat
              ? 'note.txt'
              : kind === 'mcp'
                ? 'My test server'
                : toolId === 'network-http-echo'
                  ? 'My request check'
                  : 'My test API',
    );
    const viewer = useViewer();
    const paidPlan = viewer.status === 'user' && (viewer.plan === 'pro' || viewer.plan === 'team');
    const [proxyTarget, setProxyTarget] = useState('');
    const [proxyRecord, setProxyRecord] = useState(true);
    const [routes, setRoutes] = useState<Route[]>(
        () =>
            (['mock-apis-stateful-crud-api', 'network-http-echo'].includes(toolId)
                ? []
                : mockPreset(toolId)) ?? [
                {
                    ...freshRoute(),
                    ...(['network-http-status-simulator', 'network-fault-injection'].includes(
                        toolId,
                    )
                        ? { status: 503, body: '{"error":"Simulated service unavailable"}' }
                        : {}),
                    ...(toolId === 'network-delay-timeout-simulator' ? { delayMs: 1500 } : {}),
                    ...(toolId === 'network-rate-limit-simulator' ? { requestsPerMinute: 2 } : {}),
                    ...([
                        'test-media-streaming-response-simulator',
                        'test-media-sse-generator',
                    ].includes(toolId)
                        ? {
                              body: '{"step":1}\n{"step":2}\n{"step":3}',
                              headers: {
                                  'content-type':
                                      toolId === 'test-media-sse-generator'
                                          ? 'text/event-stream'
                                          : 'text/plain',
                              },
                              stream: {
                                  mode:
                                      toolId === 'test-media-sse-generator'
                                          ? ('sse' as const)
                                          : ('text' as const),
                                  intervalMs: 300,
                              },
                          }
                        : {}),
                },
            ],
    );
    const [active, setActive] = useState(0);
    const [mcpTools, setMcpTools] = useState(
        JSON.stringify(
            [
                {
                    name: toolId === 'agents-tool-failure-simulator' ? 'fail_example' : 'greet',
                    description:
                        toolId === 'agents-tool-failure-simulator'
                            ? 'Return a predictable tool failure.'
                            : 'Return a greeting for an agent integration test.',
                    inputSchema: {
                        type: 'object',
                        properties: { name: { type: 'string' } },
                        required: ['name'],
                    },
                    response:
                        toolId === 'agents-tool-failure-simulator'
                            ? 'Simulated tool failure.'
                            : 'Hello from your mock MCP server.',
                    isError: toolId === 'agents-tool-failure-simulator',
                    delayMs: toolId === 'agents-tool-failure-simulator' ? 500 : 0,
                },
            ],
            null,
            2,
        ),
    );
    const [file, setFile] = useState<File>();
    const [visibility, setVisibility] = useState<Visibility>('private');
    const oneTime = toolId === 'files-one-time-download-links';
    const [maxDownloads, setMaxDownloads] = useState(oneTime ? '1' : '100');
    const [testResult, setTestResult] = useState('');
    const [testStatus, setTestStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [expired, setExpired] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [ready, setReady] = useState(false);
    const [reopenId, setReopenId] = useState('');
    const [reopenToken, setReopenToken] = useState('');
    const controller = useRef<AbortController | null>(null);
    const resultSection = useRef<HTMLElement | null>(null);
    const focusResult = useRef(false);
    const reduceMotion = useReducedMotion();
    const key = `socket-${toolId}-resource`;
    const base = `/api/${kind === 'mock' ? 'mocks' : kind === 'mcp' ? 'mcp-servers' : 'files'}`;
    const route = routes[active] ?? routes[0] ?? freshRoute();
    useEffect(() => {
        const requested = new URLSearchParams(location.search).get('resource');
        if (requested && /^[a-f0-9-]{36}$/i.test(requested)) {
            setReady(true);
            void refresh({ id: requested, managementToken: '', expiresAt: '' });
            return () => controller.current?.abort();
        }
        const primary = [
            'files-temporary-file-transfer',
            'mock-apis-mock-rest-api',
            'agents-mock-mcp-server',
        ].includes(toolId);
        const legacyKey = `socket-${kind}-resource`;
        const saved = restore(key) ?? (primary ? restore(legacyKey) : null);
        if (saved) {
            remember(key, saved);
            try {
                sessionStorage.removeItem(legacyKey);
            } catch {}
        }
        setResource(saved);
        if (saved) setVisibility(saved.visibility ?? 'public');
        setReady(true);
        if (saved) void refresh(saved);
        return () => {
            controller.current?.abort();
        };
    }, [key]);
    useEffect(() => {
        if (!resource) return;
        const check = () => setExpired(Date.parse(resource.expiresAt) <= Date.now());
        check();
        const timer = setInterval(check, 1000);
        return () => clearInterval(timer);
    }, [resource]);
    useEffect(() => {
        if (!resource || !focusResult.current) return;
        focusResult.current = false;
        resultSection.current?.focus({ preventScroll: true });
        resultSection.current?.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'start',
        });
    }, [resource?.id, reduceMotion]);
    function save(value: Resource | null) {
        setResource(value);
        setExpired(false);
        remember(key, value);
    }
    async function refresh(value: Resource) {
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setBusy(true);
        setError('');
        try {
            const metadata = await (
                await api(`${base}/${value.id}`, {
                    headers: resourceHeaders(value.managementToken),
                    signal: request.signal,
                })
            ).json();
            if (request.signal.aborted) return;
            save({
                ...metadata,
                managementToken: value.managementToken,
                ...(metadata.accessVersion === value.accessVersion && value.accessToken
                    ? { accessToken: value.accessToken }
                    : {}),
            });
            setVisibility(metadata.visibility ?? 'public');
            if (kind !== 'file') setName(metadata.name);
            if (kind === 'mcp') setMcpTools(JSON.stringify(metadata.tools, null, 2));
            if (kind === 'mock') {
                setCrudMode(Boolean(metadata.crud));
                setEchoMode(Boolean(metadata.echo));
                if (metadata.crud) {
                    setCrudPath(metadata.crud.path);
                    setCrudSeed(JSON.stringify(metadata.crud.seed, null, 2));
                    setCrudVersion((value) => value + 1);
                }
                setName(metadata.name);
                setRoutes(metadata.routes);
                setProxyTarget(metadata.proxy?.target ?? '');
                setProxyRecord(metadata.proxy?.record ?? true);
                setActive(0);
            }
        } catch (error) {
            if (!request.signal.aborted)
                setError(error instanceof Error ? error.message : 'Unable to reopen resource.');
        } finally {
            if (!request.signal.aborted) setBusy(false);
        }
    }
    function patch(value: Partial<Route>) {
        setRoutes((items) =>
            items.map((entry, index) => (index === active ? { ...entry, ...value } : entry)),
        );
        setNotice('');
    }
    async function submit() {
        let uploadFile = file;
        let crud;
        if (crudMode) {
            try {
                crud = validateCrud({ path: crudPath, seed: parseJsonSafely(crudSeed) });
            } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Check the seed records.');
                return;
            }
        }
        if (kind === 'file' && inlineFormat) {
            try {
                if (!text || new TextEncoder().encode(text).length > 262144)
                    throw new Error('Enter nonempty text up to 256 KiB.');
                if (inlineFormat === 'json') formatJson(text);
                if (!name.trim()) throw new Error('Enter a file name.');
                uploadFile = new File([text], name.trim(), {
                    type: inlineFormat === 'json' ? 'application/json' : 'text/plain',
                });
            } catch (error) {
                setError(error instanceof Error ? error.message : 'Invalid input.');
                return;
            }
        }
        if (
            kind === 'file' &&
            (!uploadFile || uploadFile.size === 0 || uploadFile.size > 10 * 1024 * 1024)
        ) {
            setError('Choose a nonempty file up to 10 MiB.');
            return;
        }
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const updating = kind !== 'file' && resource && !expired;
            const response = await api(
                updating
                    ? `${base}/${resource.id}`
                    : `${base}?visibility=${visibility}${kind === 'file' ? `&maxDownloads=${oneTime ? 1 : maxDownloads}` : ''}`,
                {
                    method: updating ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type':
                            kind === 'file' ? 'application/octet-stream' : 'application/json',
                        ...(updating ? resourceHeaders(resource.managementToken) : {}),
                        ...(kind === 'file'
                            ? { 'X-File-Name': encodeURIComponent(uploadFile!.name) }
                            : {}),
                    },
                    body:
                        kind === 'file'
                            ? uploadFile
                            : JSON.stringify(
                                  kind === 'mcp'
                                      ? { name, tools: JSON.parse(mcpTools) }
                                      : crudMode
                                        ? { name, routes, crud }
                                        : echoMode
                                          ? { name, routes: [], echo: true }
                                          : {
                                                name,
                                                routes,
                                                ...(proxyTarget.trim()
                                                    ? {
                                                          proxy: {
                                                              target: proxyTarget.trim(),
                                                              record: proxyRecord,
                                                          },
                                                      }
                                                    : {}),
                                            },
                              ),
                    signal: request.signal,
                },
                kind === 'file' ? 90000 : 10000,
            );
            if (request.signal.aborted) return;
            if (updating) {
                setNotice(
                    crudMode
                        ? 'Saved. Live records were restored from the updated seed.'
                        : echoMode
                          ? 'Saved. The echo endpoint name is updated.'
                          : 'Saved. Your endpoint is using the updated routes.',
                );
                if (crudMode) setCrudVersion((value) => value + 1);
            } else {
                focusResult.current = true;
                save(await response.json());
                setNotice(
                    kind === 'file'
                        ? visibility === 'private'
                            ? 'Uploaded privately. Share the link and access token separately.'
                            : 'Uploaded publicly. Anyone with the link can retrieve this file.'
                        : kind === 'mcp'
                          ? 'Your MCP server is ready.'
                          : echoMode
                            ? 'Your echo endpoint is ready.'
                            : 'Your mock API is ready.',
                );
            }
        } catch (error) {
            if (!request.signal.aborted)
                setError(error instanceof Error ? error.message : 'Unable to save resource.');
        } finally {
            if (!request.signal.aborted) setBusy(false);
        }
    }
    async function remove() {
        if (!resource) return;
        setBusy(true);
        setError('');
        try {
            await api(`${base}/${resource.id}`, {
                method: 'DELETE',
                headers: resourceHeaders(resource.managementToken),
            });
            save(null);
            setNotice('Deleted. The public link is no longer available.');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Unable to delete resource.');
        } finally {
            setBusy(false);
        }
    }
    async function changeSharing(mode: Visibility) {
        setVisibility(mode);
        if (!resource || expired) return;
        setBusy(true);
        setError('');
        try {
            const result = await (
                await api(`${base}/${resource.id}/sharing`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...resourceHeaders(resource.managementToken),
                    },
                    body: JSON.stringify({ visibility: mode }),
                })
            ).json();
            save({ ...resource, ...result, accessToken: result.accessToken });
            setNotice(
                mode === 'private'
                    ? 'Private sharing enabled. Previous access tokens are revoked.'
                    : 'Public sharing enabled. Anyone with the endpoint can use it.',
            );
        } catch (failure) {
            setVisibility(resource.visibility ?? 'public');
            setError(failure instanceof Error ? failure.message : 'Unable to change sharing.');
        } finally {
            setBusy(false);
        }
    }
    async function testEndpoint() {
        if (!resource?.endpointUrl) return;
        setBusy(true);
        setError('');
        setTestResult('');
        setTestStatus('');
        try {
            const headers: Record<string, string> = resource.accessToken
                ? { 'X-Access-Token': resource.accessToken }
                : {};
            const path =
                kind === 'mcp'
                    ? resource.endpointUrl
                    : `${resource.endpointUrl}${route.path.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g, 'example')}`;
            const started = performance.now();
            const response = await fetch(path, {
                method: kind === 'mcp' ? 'POST' : route.method === 'ANY' ? 'GET' : route.method,
                headers: {
                    ...headers,
                    ...(kind === 'mcp'
                        ? {
                              Accept: 'application/json, text/event-stream',
                              'Content-Type': 'application/json',
                          }
                        : {}),
                },
                ...(kind === 'mcp'
                    ? { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }
                    : {}),
                signal: AbortSignal.timeout(10000),
                redirect: 'error',
            });
            setTestStatus(
                `HTTP ${response.status} · ${Math.round(performance.now() - started)} ms · ${response.headers.get('content-type') ?? 'No content type'}`,
            );
            if (response.body) {
                const reader = response.body.getReader(),
                    decoder = new TextDecoder();
                let result = '';
                try {
                    while (true) {
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        result += decoder.decode(chunk.value, { stream: true });
                        setTestResult(result);
                    }
                    result += decoder.decode();
                    setTestResult(result);
                } finally {
                    reader.releaseLock();
                }
            }
            setTestStatus(
                `HTTP ${response.status} · ${Math.round(performance.now() - started)} ms total · ${response.headers.get('content-type') ?? 'No content type'}`,
            );
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Endpoint test failed.');
        } finally {
            setBusy(false);
        }
    }
    const endpointUrl = resource?.endpointUrl ?? resource?.downloadUrl;
    const url =
        resource && kind === 'file' && resource.downloadUrl
            ? `${new URL('/share/', resource.downloadUrl).href}?id=${resource.id}`
            : endpointUrl;
    return (
        <div className="page-width work-page resource-workbench">
            <ToolHeader toolId={toolId}>
                <span className="badge badge-green">
                    <Icon name="clock" size={13} /> Expires after 1 hour
                </span>
            </ToolHeader>
            {kind === 'mock' && (
                <p className="tool-notice">
                    <span>
                        Start with routes or{' '}
                        <a href="/tools/openapi-to-mock/">import an OpenAPI document</a> to build
                        your mock.
                    </span>
                </p>
            )}
            {!ready && <p role="status">Checking this session…</p>}
            {error && (
                <div className="alert" role="alert">
                    {error}
                </div>
            )}
            {notice && (
                <p className="resource-notice" role="status">
                    {notice}
                </p>
            )}
            {expired && (
                <div className="alert" role="status">
                    This resource has expired. Create another one to continue.
                </div>
            )}
            {resource && (
                <section
                    className="resource-result"
                    ref={resultSection}
                    tabIndex={-1}
                    aria-label={kind !== 'file' ? 'Your endpoint' : 'Your download link'}
                >
                    <div className="resource-result-heading">
                        <strong>{kind !== 'file' ? 'Your endpoint' : resource.name}</strong>
                        <span>Expires at {clock(resource.expiresAt)}</span>
                    </div>
                    <div className="resource-link">
                        <code>{url}</code>
                        <CopyButton text={url ?? ''} label="Copy link" />
                    </div>
                    {kind === 'mcp' ? (
                        <p>
                            Connect a Streamable HTTP MCP client to this URL. Save changes before
                            calling updated tools.
                        </p>
                    ) : kind === 'mock' && echoMode ? (
                        <p>
                            Append any relative path, or call the base URL. The response reflects
                            the request received here.
                        </p>
                    ) : kind === 'mock' ? (
                        <p>
                            Add a configured route, such as{' '}
                            <code>{crudMode ? crudPath : route.path}</code>, to this base URL.
                        </p>
                    ) : (
                        <p>
                            {(resource.size ?? 0) < 1024
                                ? `${resource.size ?? 0} bytes`
                                : `${((resource.size ?? 0) / 1024).toFixed(1)} KiB`}{' '}
                            · {resource.remainingDownloads ?? 100} downloads remaining
                        </p>
                    )}
                    <SharingControl
                        value={resource.visibility ?? 'public'}
                        disabled={busy || expired}
                        onChange={(mode) => void changeSharing(mode)}
                    />
                    <div className="utility-actions">
                        <Button
                            variant="soft"
                            color="gray"
                            disabled={busy}
                            onClick={() => void refresh(resource)}
                        >
                            Refresh details
                        </Button>
                        <Button
                            variant="soft"
                            color="red"
                            disabled={busy}
                            onClick={() => setConfirm(true)}
                        >
                            Delete{' '}
                            {kind === 'mock' ? 'API' : kind === 'mcp' ? 'MCP server' : 'file'}
                        </Button>
                        {kind !== 'file' && !expired && !crudMode && !echoMode && (
                            <Button disabled={busy} onClick={() => void testEndpoint()}>
                                Test endpoint
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            color="gray"
                            disabled={busy}
                            onClick={() => {
                                save(null);
                                setFile(undefined);
                                setTestResult('');
                                setVisibility('private');
                                setNotice(
                                    'Ready for another resource. The previous resource remains active until it expires.',
                                );
                            }}
                        >
                            Start another
                        </Button>
                    </div>
                    {resource.visibility === 'private' && (
                        <div className="resource-access">
                            <strong>Private access</strong>
                            <p>
                                {kind === 'file'
                                    ? 'Share the link and access token separately. The recipient enters the token to open the file.'
                                    : 'A recipient needs the access token. Your management token is separate and cannot call this private resource.'}
                            </p>
                            {resource.accessToken ? (
                                <CopyButton text={resource.accessToken} label="Copy access token" />
                            ) : (
                                <p>
                                    The access token is unavailable in this tab. Generate a new
                                    token to share this resource.
                                </p>
                            )}
                            <button
                                className="button button-small"
                                disabled={busy || expired}
                                onClick={() => void changeSharing('private')}
                            >
                                Rotate access token
                            </button>
                            {kind !== 'file' && (
                                <p>
                                    Send the access token in <code>X-Access-Token</code> or a Bearer
                                    Authorization header.
                                </p>
                            )}
                        </div>
                    )}
                    {kind === 'file' && !expired && (
                        <RemoteFilePreview
                            id={resource.id}
                            name={resource.name ?? 'download'}
                            accessToken={resource.accessToken}
                        />
                    )}
                    {testStatus && (
                        <>
                            <p className="resource-notice" role="status">
                                {testStatus}
                            </p>
                            <ResponseOutput text={testResult} sse={route.stream?.mode === 'sse'} />
                        </>
                    )}
                    {kind === 'mock' && !expired && (
                        <MockCalls id={resource.id} token={resource.managementToken} />
                    )}
                    {resource.managementToken ? (
                        <details className="resource-access">
                            <summary>Private management access</summary>
                            <p>
                                Keep this management token private. Anonymous resources use it to
                                reopen, change sharing, or delete. Account-owned resources also
                                require your workspace access. It is saved only in this browser tab.
                            </p>
                            <CopyButton
                                text={resource.managementToken}
                                label="Copy private token"
                            />
                            <p>
                                <code>Resource ID: {resource.id}</code>
                            </p>
                        </details>
                    ) : (
                        <p className="tool-notice">Managed through your current workspace.</p>
                    )}
                </section>
            )}
            {(!resource || expired) && (
                <div className="quick-start">
                    {(kind === 'mock' || kind === 'mcp') && (
                        <div className="quick-start-copy">
                            <strong>The example below already works.</strong>
                            <span>Create it now and edit it later, or change it first.</span>
                        </div>
                    )}
                    <SharingControl value={visibility} disabled={busy} onChange={setVisibility} />
                    {(kind === 'mock' || kind === 'mcp') && (
                        <Button
                            size="2"
                            color="green"
                            disabled={busy}
                            onClick={() => void submit()}
                        >
                            {busy
                                ? 'Creating…'
                                : kind === 'mcp'
                                  ? 'Create MCP server'
                                  : 'Create mock API'}
                            <Icon name="arrow" size={14} />
                        </Button>
                    )}
                </div>
            )}
            {kind === 'mock' && echoMode ? (
                <EchoWorkbench
                    resource={resource}
                    name={name}
                    busy={busy}
                    onName={setName}
                    onSubmit={() => void submit()}
                />
            ) : kind === 'mock' && crudMode ? (
                <>
                    {resource && !expired && (
                        <CrudRecords resource={resource} version={crudVersion} />
                    )}
                    <CrudConfiguration
                        name={name}
                        path={crudPath}
                        routes={routes}
                        onRoutes={setRoutes}
                        seed={crudSeed}
                        busy={busy}
                        existing={!!resource && !expired}
                        onName={setName}
                        onPath={setCrudPath}
                        onSeed={setCrudSeed}
                        onSubmit={() => void submit()}
                        onError={setError}
                    />
                </>
            ) : kind === 'mock' ? (
                <section className="resource-editor" aria-label="Mock API configuration">
                    <details className="resource-access" open={!!proxyTarget || undefined}>
                        <summary>
                            Proxy &amp; record a real API{' '}
                            <span className="badge badge-green">Pro</span>
                        </summary>
                        {paidPlan ? (
                            <>
                                <p className="tool-notice">
                                    Calls that match no route go to this API and its answer comes
                                    back. With recording on, each new answer becomes a route, so the
                                    mock keeps working when the real API is down.
                                </p>
                                <label className="mock-import-label">
                                    Real API base URL
                                    <input
                                        type="url"
                                        value={proxyTarget}
                                        disabled={busy}
                                        placeholder="https://api.example.com/v1"
                                        onChange={(event) => setProxyTarget(event.target.value)}
                                    />
                                </label>
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={proxyRecord}
                                        disabled={busy}
                                        onChange={(event) => setProxyRecord(event.target.checked)}
                                    />
                                    Record answers as routes (up to 20)
                                </label>
                            </>
                        ) : (
                            <div className="upsell">
                                <p>
                                    Point the mock at your real API: unmatched calls pass through
                                    and real answers are saved as routes. Beeceptor charges $10 a
                                    month for its paid plans; this is part of Kivel Pro.
                                </p>
                                <Link className="button button-primary button-small" href="/plans/">
                                    Get Pro for $2 a month
                                </Link>
                            </div>
                        )}
                    </details>
                    <details className="resource-access">
                        <summary>Import / export configuration</summary>
                        <label className="mock-import-label">
                            Mock configuration (JSON)
                            <textarea
                                value={importConfig}
                                onChange={(event) => setImportConfig(event.target.value)}
                                maxLength={81920}
                                rows={6}
                                disabled={busy}
                                spellCheck={false}
                                placeholder='{"name":"Example","routes":[...]}'
                            />
                        </label>
                        <div className="utility-actions">
                            <Button
                                disabled={busy || !importConfig}
                                onClick={() => {
                                    try {
                                        const config = validateMock(JSON.parse(importConfig));
                                        setName(config.name);
                                        setEchoMode(Boolean(config.echo));
                                        setCrudMode(Boolean(config.crud));
                                        if (config.crud) {
                                            setCrudMode(true);
                                            setCrudPath(config.crud.path);
                                            setCrudSeed(JSON.stringify(config.crud.seed, null, 2));
                                        }
                                        setRoutes(config.routes);
                                        setProxyTarget(config.proxy?.target ?? '');
                                        setProxyRecord(config.proxy?.record ?? true);
                                        setActive(0);
                                        setError('');
                                        setNotice(
                                            'Configuration imported locally. Create or save the endpoint to apply it.',
                                        );
                                    } catch (error) {
                                        setError(
                                            error instanceof Error
                                                ? error.message
                                                : 'Invalid mock configuration.',
                                        );
                                    }
                                }}
                            >
                                Import configuration
                            </Button>
                            <CopyButton
                                text={JSON.stringify({ name, routes }, null, 2)}
                                label="Copy current configuration"
                            />
                        </div>
                    </details>
                    <div className="resource-form-fields">
                        <label>
                            API name
                            <input
                                value={name}
                                maxLength={80}
                                onChange={(event) => setName(event.target.value)}
                                disabled={busy}
                            />
                        </label>
                    </div>
                    <div className="resource-route-tabs" aria-label="Configured routes">
                        {routes.map((entry, index) => (
                            <button
                                key={index}
                                aria-pressed={active === index}
                                disabled={busy}
                                onClick={() => setActive(index)}
                            >
                                {entry.method} {entry.path || 'New route'} · {entry.status}
                                {entry.condition
                                    ? ' · Matched request'
                                    : routes.some(
                                            (other, i) =>
                                                i !== index &&
                                                other.method === entry.method &&
                                                other.path === entry.path,
                                        )
                                      ? ' · Fallback'
                                      : ''}
                            </button>
                        ))}
                        {routes.length < 20 && (
                            <Button
                                variant="soft"
                                color="gray"
                                disabled={busy}
                                onClick={() => {
                                    setRoutes((items) => [
                                        ...items,
                                        { ...freshRoute(), path: `/route-${items.length + 1}` },
                                    ]);
                                    setActive(routes.length);
                                }}
                            >
                                Add route
                            </Button>
                        )}
                    </div>
                    <div className="resource-form-fields">
                        <label>
                            Method
                            <AppSelect
                                value={route.method}
                                onChange={(event) => patch({ method: event.target.value })}
                                disabled={busy}
                            >
                                {[
                                    'GET',
                                    'POST',
                                    'PUT',
                                    'PATCH',
                                    'DELETE',
                                    'OPTIONS',
                                    'HEAD',
                                    'ANY',
                                ].map((method) => (
                                    <SelectOption key={method}>{method}</SelectOption>
                                ))}
                            </AppSelect>
                        </label>
                        <label>
                            Path
                            <input
                                value={route.path}
                                maxLength={200}
                                onChange={(event) => patch({ path: event.target.value })}
                                placeholder="/users/:id"
                                disabled={busy}
                            />
                        </label>
                        <label>
                            Status
                            <input
                                type="number"
                                min="200"
                                max="599"
                                value={route.status}
                                onChange={(event) => patch({ status: Number(event.target.value) })}
                                disabled={busy}
                            />
                        </label>
                        <label>
                            Delay (ms)
                            <input
                                type="number"
                                min="0"
                                max="2000"
                                value={route.delayMs}
                                onChange={(event) => patch({ delayMs: Number(event.target.value) })}
                                disabled={busy}
                            />
                        </label>
                        <label>
                            Requests per minute
                            <input
                                type="number"
                                min="1"
                                max="120"
                                value={route.requestsPerMinute ?? 120}
                                disabled={busy}
                                onChange={(event) =>
                                    patch({ requestsPerMinute: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label>
                            Random failures (%)
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={route.failureRate ?? 0}
                                disabled={busy}
                                title="Share of calls answered with 503, to test retries"
                                onChange={(event) => {
                                    const rate = Number(event.target.value);
                                    patch(
                                        rate
                                            ? { failureRate: rate, failureStatus: 503 }
                                            : { failureRate: undefined, failureStatus: undefined },
                                    );
                                }}
                            />
                        </label>
                        <label>
                            Delivery
                            <AppSelect
                                value={route.stream?.mode ?? 'single'}
                                disabled={busy}
                                onChange={(event) =>
                                    patch({
                                        stream:
                                            event.target.value === 'single'
                                                ? undefined
                                                : {
                                                      mode: event.target.value as 'sse' | 'text',
                                                      intervalMs: 300,
                                                  },
                                        ...(event.target.value !== 'single'
                                            ? {
                                                  method: 'GET',
                                                  status: 200,
                                                  headers: {
                                                      ...route.headers,
                                                      'content-type':
                                                          event.target.value === 'sse'
                                                              ? 'text/event-stream'
                                                              : 'text/plain',
                                                  },
                                              }
                                            : {}),
                                    })
                                }
                            >
                                <SelectOption value="single">One response</SelectOption>
                                <SelectOption value="text">Text stream</SelectOption>
                                <SelectOption value="sse">Server-sent events</SelectOption>
                            </AppSelect>
                        </label>
                        {route.stream && (
                            <label>
                                Chunk interval (ms)
                                <input
                                    type="number"
                                    min="10"
                                    max="1000"
                                    disabled={busy}
                                    value={route.stream.intervalMs}
                                    onChange={(event) =>
                                        patch({
                                            stream: {
                                                ...route.stream!,
                                                intervalMs: Number(event.target.value),
                                            },
                                        })
                                    }
                                />
                            </label>
                        )}
                        <label>
                            Response type
                            <AppSelect
                                value={route.headers['content-type'] ?? 'application/json'}
                                onChange={(event) =>
                                    patch({
                                        headers: {
                                            ...route.headers,
                                            'content-type': event.target.value,
                                        },
                                    })
                                }
                                disabled={busy}
                            >
                                {[
                                    'application/json',
                                    'text/plain',
                                    'application/xml',
                                    'text/csv',
                                    'text/event-stream',
                                ].map((type) => (
                                    <SelectOption key={type}>{type}</SelectOption>
                                ))}
                            </AppSelect>
                        </label>
                    </div>
                    <details
                        className="mock-behavior-options"
                        open={!!route.condition || !!route.template}
                    >
                        <summary>Request conditions & response templates</summary>
                        <div className="resource-form-fields">
                            <label>
                                Match request field
                                <AppSelect
                                    value={route.condition?.source ?? 'none'}
                                    disabled={busy}
                                    onChange={(event) =>
                                        patch({
                                            condition:
                                                event.target.value === 'none'
                                                    ? undefined
                                                    : {
                                                          source: event.target.value as
                                                              'header' | 'query' | 'body',
                                                          key: '',
                                                          value: '',
                                                      },
                                        })
                                    }
                                >
                                    <SelectOption value="none">Every request</SelectOption>
                                    <SelectOption value="header">Header</SelectOption>
                                    <SelectOption value="query">Query parameter</SelectOption>
                                    <SelectOption value="body">JSON body field</SelectOption>
                                </AppSelect>
                            </label>
                            {route.condition && (
                                <>
                                    <label>
                                        Field name
                                        <input
                                            value={route.condition.key}
                                            maxLength={80}
                                            disabled={busy}
                                            onChange={(event) =>
                                                patch({
                                                    condition: {
                                                        ...route.condition!,
                                                        key: event.target.value,
                                                    },
                                                })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Required value
                                        <input
                                            value={route.condition.value}
                                            maxLength={512}
                                            disabled={busy}
                                            onChange={(event) =>
                                                patch({
                                                    condition: {
                                                        ...route.condition!,
                                                        value: event.target.value,
                                                    },
                                                })
                                            }
                                        />
                                    </label>
                                </>
                            )}
                            <label>
                                Response mode
                                <AppSelect
                                    value={route.template ? 'template' : 'static'}
                                    disabled={busy || !!route.stream}
                                    onChange={(event) =>
                                        patch({ template: event.target.value === 'template' })
                                    }
                                >
                                    <SelectOption value="static">Static response</SelectOption>
                                    <SelectOption value="template">
                                        Insert request values
                                    </SelectOption>
                                </AppSelect>
                            </label>
                        </div>
                        <p className="tool-notice">
                            Templates accept {'{{path.id}}'}, {'{{query.name}}'}, {'{{body.name}}'}{' '}
                            and sample data such as {'{{fake.name}}'}, {'{{fake.email}}'},{' '}
                            {'{{fake.uuid}}'}, {'{{fake.price}}'} or {'{{fake.datetime}}'} inside
                            JSON strings or plain text. Missing values become empty strings. No code
                            runs. Test credentials are stored in the configuration; use fake tokens
                            only.
                        </p>
                    </details>
                    <div className="editor-panel">
                        <div className="editor-heading">
                            <label htmlFor="mock-response">
                                {route.stream ? 'Chunks / events (one per line)' : 'Response body'}
                            </label>
                            {routes.length > 1 && (
                                <button
                                    className="text-link"
                                    disabled={busy}
                                    onClick={() => {
                                        setRoutes((items) =>
                                            items.filter((_, index) => index !== active),
                                        );
                                        setActive(0);
                                    }}
                                >
                                    Remove route
                                </button>
                            )}
                        </div>
                        <textarea
                            id="mock-response"
                            value={route.body}
                            maxLength={51200}
                            spellCheck={false}
                            disabled={busy}
                            onChange={(event) => patch({ body: event.target.value })}
                        />
                    </div>
                    <p className="tool-notice">
                        Up to 20 routes, 80 KiB total configuration, and 120 requests per minute.
                        Paths support parameters such as /users/:id. Matching routes are checked in
                        order.
                    </p>
                    <div className="utility-actions">
                        <Button size="3" disabled={busy || !ready} onClick={() => void submit()}>
                            {busy
                                ? 'Saving…'
                                : resource && !expired
                                  ? 'Save changes'
                                  : 'Create mock API'}
                            <Icon name="arrow" size={16} />
                        </Button>
                    </div>
                </section>
            ) : kind === 'mcp' ? (
                <section className="resource-editor" aria-label="Mock MCP configuration">
                    <div className="resource-form-fields">
                        <label>
                            Server name
                            <input
                                value={name}
                                maxLength={80}
                                disabled={busy}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </label>
                    </div>
                    <McpToolEditor value={mcpTools} onChange={setMcpTools} disabled={busy} />
                    <p className="tool-notice">
                        Up to 10 tools. Each accepts an object with string, number, integer, or
                        boolean arguments and returns static text. Set delayMs (0–2000) for latency
                        and isError to true to simulate a failed call. No code is executed.
                    </p>
                    <div className="utility-actions">
                        <Button size="3" disabled={busy || !ready} onClick={() => void submit()}>
                            {busy
                                ? 'Saving…'
                                : resource && !expired
                                  ? 'Save changes'
                                  : 'Create MCP server'}
                            <Icon name="arrow" size={16} />
                        </Button>
                    </div>
                </section>
            ) : (
                (!resource || expired) && (
                    <section className="resource-editor" aria-label="Upload a temporary file">
                        <div className="resource-form-fields">
                            <label>
                                Download limit
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={maxDownloads}
                                    disabled={busy || oneTime}
                                    onChange={(event) => setMaxDownloads(event.target.value)}
                                />
                            </label>
                        </div>
                        {oneTime && (
                            <p className="tool-notice">
                                The link accepts one download request. The stored file contents are
                                removed after that request; its recipient can keep the downloaded
                                copy.
                            </p>
                        )}
                        {inlineFormat ? (
                            <div className="inline-share-editor">
                                <label>
                                    File name
                                    <input
                                        value={name}
                                        maxLength={150}
                                        disabled={busy}
                                        onChange={(event) => setName(event.target.value)}
                                    />
                                </label>
                                <label>
                                    {inlineFormat === 'json' ? 'JSON document' : 'Text or code'}
                                    <textarea
                                        rows={10}
                                        value={text}
                                        maxLength={262144}
                                        disabled={busy}
                                        spellCheck={false}
                                        onChange={(event) => {
                                            setText(event.target.value);
                                            setError('');
                                        }}
                                        placeholder={
                                            inlineFormat === 'json'
                                                ? '{"ready": true}'
                                                : 'Write or paste a temporary note…'
                                        }
                                    />
                                </label>
                            </div>
                        ) : (
                            <FilePicker
                                file={file}
                                disabled={busy}
                                onChange={(value) => {
                                    setFile(value);
                                    setError('');
                                    setNotice('');
                                }}
                            />
                        )}
                        {file && <BlobPreview blob={file} name={file.name} />}
                        <p className="tool-notice">
                            Files start with a one-hour lifetime. Private links require an access
                            token; public links work for anyone. Preview the selected file before
                            uploading. Downloads keep the original file.
                        </p>
                        <div className="utility-actions">
                            <Button
                                size="3"
                                disabled={busy || !ready || (inlineFormat ? !text : !file)}
                                onClick={() => void submit()}
                            >
                                {busy
                                    ? 'Uploading…'
                                    : inlineFormat
                                      ? 'Create share'
                                      : 'Upload file'}
                                <Icon name="arrow" size={16} />
                            </Button>
                            {busy && (
                                <Button
                                    variant="soft"
                                    color="gray"
                                    onClick={() => {
                                        controller.current?.abort();
                                        setBusy(false);
                                        setNotice('Upload cancelled.');
                                    }}
                                >
                                    Cancel upload
                                </Button>
                            )}
                        </div>
                    </section>
                )
            )}
            {!resource && (
                <details className="resource-access">
                    <summary>
                        Open an existing{' '}
                        {kind === 'mock' ? 'mock API' : kind === 'mcp' ? 'MCP server' : 'file'}
                    </summary>
                    <div className="resource-form-fields">
                        <label>
                            Resource ID
                            <input
                                value={reopenId}
                                maxLength={36}
                                onChange={(event) => setReopenId(event.target.value)}
                            />
                        </label>
                        <label>
                            Management token (optional for your workspace)
                            <input
                                type="password"
                                autoComplete="off"
                                value={reopenToken}
                                maxLength={43}
                                onChange={(event) => setReopenToken(event.target.value)}
                            />
                        </label>
                    </div>
                    <Button
                        disabled={
                            busy ||
                            !/^[a-f0-9-]{36}$/i.test(reopenId) ||
                            (reopenToken !== '' && !/^[A-Za-z0-9_-]{43}$/.test(reopenToken))
                        }
                        onClick={() =>
                            void refresh({
                                id: reopenId,
                                managementToken: reopenToken,
                                expiresAt: new Date(Date.now() + 60000).toISOString(),
                            })
                        }
                    >
                        Open resource
                    </Button>
                </details>
            )}
            <AlertDialog.Root open={confirm} onOpenChange={setConfirm}>
                <AlertDialog.Content maxWidth="430px">
                    <AlertDialog.Title>
                        Delete this{' '}
                        {kind === 'mock' ? 'API' : kind === 'mcp' ? 'MCP server' : 'file'}?
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                        This permanently deletes the resource and disables its public link.
                    </AlertDialog.Description>
                    <div className="confirm-actions">
                        <AlertDialog.Cancel>
                            <Button variant="soft" color="gray">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                            <Button color="red" onClick={() => void remove()}>
                                Delete resource
                            </Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </div>
    );
}

function ResponseOutput({ text, sse }: { text: string; sse: boolean }) {
    const view = text ? (
        sse ? (
            <StreamEventsPreview text={text} />
        ) : (
            renderToolResult('resource-response', text)
        )
    ) : null;
    return (
        <>
            {view}
            {view ? (
                <details className="artifact-response">
                    <summary>Raw response</summary>
                    <ResultPreview
                        text={text}
                        title="Raw response"
                        filename="endpoint-response.txt"
                    />
                </details>
            ) : (
                <ResultPreview text={text} title="Response" filename="endpoint-response.txt" />
            )}
        </>
    );
}
