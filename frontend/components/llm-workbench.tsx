'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Select, TextArea, TextField } from '@radix-ui/themes';
import { validateLlmMock } from '@kivel/tools/llm-mock';
import type { LlmMockConfig } from '@kivel/tools/llm-mock';
import { parseSse } from '@kivel/tools/sse';
import { useViewer } from '../lib/viewer';
import { api, resourceHeaders } from '../lib/api';
import { ToolHeader } from './tool-header';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { CopyButton } from './copy-button';
import { CodeExample } from './code-example';
import { ResultPreview } from './result-preview';
import { MockCalls } from './mock-calls';

type Resource = {
    id: string;
    endpointUrl: string;
    managementToken?: string;
    accessToken?: string;
    expiresAt: string;
    llm: LlmMockConfig;
};
export function LlmWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
    const [model, setModel] = useState('socket-mock');
    const [text, setText] = useState(
        'The test response is ready. This is the scripted assistant message you configured.',
    );
    const [interval, setInterval] = useState('20');
    const [interrupt, setInterrupt] = useState(false);
    const [stream, setStream] = useState(toolId === 'agents-llm-streaming-simulator');
    const [visibility, setVisibility] = useState<Visibility>('private');
    const [resource, setResource] = useState<Resource | null>(null);
    const [busy, setBusy] = useState(false),
        [running, setRunning] = useState(false),
        [error, setError] = useState('');
    const [output, setOutput] = useState(''),
        [protocol, setProtocol] = useState('');
    const [elapsed, setElapsed] = useState(0),
        [finished, setFinished] = useState(false);
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    useEffect(() => {
        pending.current?.abort();
        setResource(null);
        setOutput('');
        setProtocol('');
        if (viewer.status !== 'user') return;
        const id = new URLSearchParams(location.search).get('resource');
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
        let live = true;
        void api(`/api/mocks/${id}`)
            .then((response) => response.json())
            .then((value) => {
                if (!live) return;
                const llm = validateLlmMock(value.llm);
                setResource({ ...value, llm });
                setProvider(llm.provider);
                setModel(llm.model);
                setText(llm.text);
                setInterval(String(llm.intervalMs));
                setInterrupt(Boolean(llm.interruptAfterChunks));
                setVisibility(value.visibility);
            })
            .catch((failure) => {
                if (live) setError(failure.message);
            });
        return () => {
            live = false;
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '']);
    async function save() {
        setError('');
        setBusy(true);
        try {
            const llm = validateLlmMock({
                provider,
                model,
                text,
                intervalMs: Number(interval),
                ...(interrupt ? { interruptAfterChunks: 1 } : {}),
            });
            const response = await api(
                `/api/mocks${resource ? `/${resource.id}` : `?visibility=${visibility}`}`,
                {
                    method: resource ? 'PUT' : 'POST',
                    headers: {
                        ...resourceHeaders(resource?.managementToken ?? ''),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: 'Scripted assistant', routes: [], llm }),
                },
            );
            const created = await response.json();
            setResource(resource ? { ...resource, llm } : { ...created, llm });
            setOutput('');
            setProtocol('');
            setFinished(false);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save mock.');
        } finally {
            setBusy(false);
        }
    }
    async function preview() {
        if (!resource) return;
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setRunning(true);
        setError('');
        setOutput('');
        setProtocol('');
        setFinished(false);
        const start = performance.now(),
            anthropic = resource.llm.provider === 'anthropic';
        try {
            const response = await fetch(
                `${resource.endpointUrl}/v1/${anthropic ? 'messages' : 'chat/completions'}`,
                {
                    method: 'POST',
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
                    headers: {
                        'Content-Type': 'application/json',
                        ...(resource.accessToken ? { 'X-Access-Token': resource.accessToken } : {}),
                    },
                    body: JSON.stringify({
                        model: resource.llm.model,
                        messages: [{ role: 'user', content: 'Preview this scripted response.' }],
                        max_tokens: 4096,
                        stream,
                    }),
                },
            );
            if (!response.ok)
                throw new Error(
                    `Mock answered HTTP ${response.status}. Check its lifetime and access credentials.`,
                );
            if (!stream) {
                const value = await response.json();
                setProtocol(JSON.stringify(value, null, 2));
                setOutput(anthropic ? value.content[0].text : value.choices[0].message.content);
                setFinished(true);
            } else {
                const reader = response.body!.getReader(),
                    decoder = new TextDecoder();
                let raw = '';
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    raw += decoder.decode(chunk.value, { stream: true });
                    const events = parseSse(raw, 200).events;
                    setOutput(
                        events
                            .map((event) => {
                                try {
                                    const value = JSON.parse(event.data);
                                    return anthropic
                                        ? (value.delta?.text ?? '')
                                        : (value.choices?.[0]?.delta?.content ?? '');
                                } catch {
                                    return '';
                                }
                            })
                            .join(''),
                    );
                    setProtocol(raw);
                    setFinished(
                        events.some(
                            (event) => event.data === '[DONE]' || event.event === 'message_stop',
                        ),
                    );
                }
            }
            setElapsed(Math.round(performance.now() - start));
        } catch (failure) {
            if (!controller.signal.aborted)
                setError(failure instanceof Error ? failure.message : 'Preview failed.');
        } finally {
            if (pending.current === controller) setRunning(false);
        }
    }
    async function remove() {
        if (!resource) return;
        setBusy(true);
        setError('');
        try {
            await api(`/api/mocks/${resource.id}`, {
                method: 'DELETE',
                headers: resourceHeaders(resource.managementToken ?? ''),
            });
            pending.current?.abort();
            setResource(null);
            setOutput('');
            setProtocol('');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to delete mock.');
        } finally {
            setBusy(false);
        }
    }
    const baseUrl = resource ? `${resource.endpointUrl}/v1` : '';
    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                description="Return scripted assistant text through an OpenAI Chat Completions or Anthropic Messages endpoint, with optional SSE streaming."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            <div className="llm-workspace">
                <form
                    className="email-create-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                >
                    <label htmlFor="llm-provider">
                        Provider format
                        <Select.Root
                            value={provider}
                            onValueChange={(value) => setProvider(value as typeof provider)}
                        >
                            <Select.Trigger id="llm-provider" />
                            <Select.Content>
                                <Select.Item value="openai">OpenAI Chat Completions</Select.Item>
                                <Select.Item value="anthropic">Anthropic Messages</Select.Item>
                            </Select.Content>
                        </Select.Root>
                    </label>
                    <label>
                        Model label
                        <TextField.Root
                            required
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            maxLength={80}
                        />
                    </label>
                    <label>
                        Scripted assistant response
                        <TextArea
                            required
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            rows={7}
                        />
                    </label>
                    <label>
                        Chunk interval (milliseconds)
                        <TextField.Root
                            type="number"
                            min={0}
                            max={250}
                            required
                            value={interval}
                            onChange={(event) => setInterval(event.target.value)}
                        />
                    </label>
                    <label className="llm-option">
                        <Checkbox
                            checked={interrupt}
                            onCheckedChange={(value) => setInterrupt(value === true)}
                        />
                        End after the first text chunk, without a completion event
                    </label>
                    <SharingControl
                        value={visibility}
                        onChange={setVisibility}
                        disabled={Boolean(resource) || busy}
                    />
                    <p className="muted">
                        Up to 8,192 characters and five seconds per stream. Text-only responses and
                        estimated token usage; tool calls, images and reasoning are outside this
                        simulator.
                    </p>
                    <Button type="submit" disabled={busy || running}>
                        {busy ? 'Saving…' : resource ? 'Save configuration' : 'Create endpoint'}
                    </Button>
                </form>
                <section className="llm-preview" aria-label="Response preview">
                    <h2>Try the response</h2>
                    {resource ? (
                        <>
                            <div className="code-row">
                                <code>{baseUrl}</code>
                                <CopyButton text={baseUrl} label="Copy base URL" compact />
                            </div>
                            {resource.accessToken && (
                                <details className="connection-details">
                                    <summary>Private caller token</summary>
                                    <p>Send this in X-Access-Token, separately from the URL.</p>
                                    <div className="code-row">
                                        <code>{resource.accessToken}</code>
                                        <CopyButton
                                            text={resource.accessToken}
                                            label="Copy caller token"
                                            compact
                                        />
                                    </div>
                                </details>
                            )}
                            <div className="button-row">
                                <label className="llm-option">
                                    <Checkbox
                                        checked={stream}
                                        onCheckedChange={(value) => setStream(value === true)}
                                    />
                                    Stream the response
                                </label>
                                <Button
                                    type="button"
                                    disabled={busy || running}
                                    onClick={() => void preview()}
                                >
                                    {running ? 'Receiving…' : 'Run preview'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={busy || running}
                                    onClick={() => void remove()}
                                >
                                    Delete endpoint
                                </Button>
                            </div>
                            {output && (
                                <div className="llm-message">
                                    <strong>Assistant</strong>
                                    <p>{output}</p>
                                </div>
                            )}
                            {protocol && (
                                <>
                                    <p className="muted" role="status">
                                        {running
                                            ? 'Receiving chunks…'
                                            : `${finished ? 'Complete' : 'Stream ended without a completion event'} · ${elapsed} ms · token counts are estimates`}
                                    </p>
                                    <details>
                                        <summary>Protocol response</summary>
                                        <ResultPreview
                                            text={protocol}
                                            title={stream ? 'SSE events' : 'JSON response'}
                                        />
                                    </details>
                                </>
                            )}
                            <p className="muted">
                                Expires {new Date(resource.expiresAt).toLocaleString()}. Keep
                                private credentials out of share URLs.
                            </p>
                            <CodeExample
                                title="Use your existing client"
                                code={
                                    resource.llm.provider === 'openai'
                                        ? `// OpenAI-compatible Chat Completions client\nbaseURL: '${baseUrl}'\napiKey: process.env.${resource.accessToken ? 'SOCKET_MOCK_ACCESS_TOKEN' : 'KIVEL_API_KEY'}\n// Call chat.completions.create({ model: '${resource.llm.model}', messages, stream: true })`
                                        : `// Anthropic-compatible Messages client\nbaseURL: '${resource.endpointUrl}'\napiKey: 'mock-key'\ndefaultHeaders: { '${resource.accessToken ? 'X-Access-Token' : 'Authorization'}': ${resource.accessToken ? 'process.env.SOCKET_MOCK_ACCESS_TOKEN' : "'Bearer ' + process.env.KIVEL_API_KEY"} }\n// Call messages.create({ model: '${resource.llm.model}', max_tokens: 1024, messages, stream: true })`
                                }
                            />
                            <MockCalls id={resource.id} token={resource.managementToken ?? ''} />
                        </>
                    ) : (
                        <p className="muted">
                            Create an endpoint, then preview the assistant message and protocol
                            events here.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
