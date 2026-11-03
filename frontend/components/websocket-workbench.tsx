'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertDialog, Button, Checkbox, Flex, TextArea, TextField } from '@radix-ui/themes';
import { validateMock } from '@socket-help/tools/mock-config';
import { api, resourceHeaders } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
import { MockCalls } from './mock-calls';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';

type Mock = {
    id: string;
    endpointUrl: string;
    expiresAt: string;
    visibility: Visibility;
    accessVersion: string;
    accessToken?: string;
    managementToken?: string;
};
const key = 'socket-websocket-mock';
const starter = JSON.stringify({ welcome: [], replies: [], delayMs: 0 }, null, 2);

export function WebSocketWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [mock, setMock] = useState<Mock | null>(null);
    const [name, setName] = useState('Live updates');
    const [echo, setEcho] = useState(true);
    const [script, setScript] = useState(starter);
    const [visibility, setVisibility] = useState<Visibility>('private');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('hello');
    const [probe, setProbe] = useState<{ label: string; data?: string }>({ label: '' });
    const connection = useRef<WebSocket | null>(null);
    const probeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function remember(value: Mock | null) {
        setMock(value);
        try {
            if (value) sessionStorage.setItem(key, JSON.stringify(value));
            else sessionStorage.removeItem(key);
        } catch {}
    }

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const id = new URLSearchParams(location.search).get('resource');
                const saved: Mock | null = JSON.parse(sessionStorage.getItem(key) ?? 'null');
                const resource = id ?? saved?.id;
                if (!resource || !/^[\da-f-]{36}$/i.test(resource)) return;
                const token = saved?.id === resource ? saved.managementToken : undefined;
                const value = await (
                    await api(`/api/mocks/${resource}`, {
                        headers: resourceHeaders(token ?? ''),
                        signal: controller.signal,
                    })
                ).json();
                if (controller.signal.aborted || !value.websocket) return;
                const { echo: reflect, ...config } = value.websocket;
                setMock({
                    id: resource,
                    visibility: value.visibility,
                    accessVersion: value.accessVersion,
                    endpointUrl: value.endpointUrl,
                    expiresAt: value.expiresAt,
                    ...(token ? { managementToken: token } : {}),
                    ...(saved?.id === resource &&
                    saved.accessVersion === value.accessVersion &&
                    saved.accessToken
                        ? { accessToken: saved.accessToken }
                        : {}),
                });
                setName(value.name);
                setEcho(reflect);
                setVisibility(value.visibility);
                setScript(Object.keys(config).length ? JSON.stringify(config, null, 2) : starter);
            } catch (e) {
                if (
                    !controller.signal.aborted &&
                    new URLSearchParams(location.search).has('resource')
                )
                    setError((e as Error).message);
            }
        }
        void load();
        return () => {
            controller.abort();
            if (connection.current) {
                connection.current.onclose = null;
                connection.current.close();
            }
            clearTimeout(probeTimer.current);
        };
    }, []);

    async function mutate(action: 'save' | 'sharing' | 'delete') {
        setBusy(true);
        setError('');
        try {
            const path = `/api/mocks${mock ? `/${mock.id}` : `?visibility=${visibility}`}`;
            const credentials = resourceHeaders(mock?.managementToken ?? '');
            if (action === 'delete') {
                await api(path, { method: 'DELETE', headers: credentials });
                remember(null);
                setProbe({ label: '' });
                setVisibility('private');
                return;
            }
            const headers = { 'Content-Type': 'application/json', ...credentials };
            if (action === 'sharing' && mock) {
                const next = await (
                    await api(`${path}/sharing`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ visibility }),
                    })
                ).json();
                remember({ ...mock, ...next, accessToken: next.accessToken });
                return;
            }
            const parsed: unknown = JSON.parse(script);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                throw new Error('Enter a JSON object for the script.');
            const config = validateMock({ name, routes: [], websocket: { ...parsed, echo } });
            const response = await api(path, {
                method: mock ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify(config),
            });
            if (!mock) {
                remember(await response.json());
                setProbe({ label: '' });
            }
        } catch (e) {
            setError(
                e instanceof SyntaxError ? 'The script must be valid JSON.' : (e as Error).message,
            );
        } finally {
            setBusy(false);
        }
    }

    function quickTest() {
        if (!mock || connection.current) return;
        setProbe({ label: 'Connecting…' });
        const socket = new WebSocket(mock.endpointUrl);
        connection.current = socket;
        let received = false;
        socket.onopen = () => {
            setProbe({ label: 'Connected. Waiting for a message…' });
            socket.send(message);
        };
        socket.onmessage = (event) => {
            received = true;
            setProbe({ label: 'Message received', data: String(event.data) });
            socket.close(1000);
        };
        socket.onclose = (event) => {
            clearTimeout(probeTimer.current);
            connection.current = null;
            if (!received)
                setProbe({
                    label:
                        event.code === 1006
                            ? 'No response. Check access and the mock script.'
                            : `Closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}.`,
                });
        };
        probeTimer.current = setTimeout(() => socket.close(), 5000);
    }

    return (
        <div className="page-width work-page">
            <ToolHeader toolId={toolId} />
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
                        void mutate('save');
                    }}
                >
                    <label className="field-label">
                        Mock name
                        <TextField.Root
                            value={name}
                            maxLength={80}
                            required
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    <label className="llm-option">
                        <Checkbox
                            checked={echo}
                            onCheckedChange={(value) => setEcho(value === true)}
                        />
                        Echo messages without a matching reply
                    </label>
                    <label className="field-label">
                        Message script
                        <TextArea
                            value={script}
                            rows={7}
                            spellCheck={false}
                            onChange={(e) => setScript(e.target.value)}
                        />
                        <span className="field-help">
                            Send <code>welcome</code> messages on connect. Add{' '}
                            <code>{'{ "match": "ping", "reply": "pong" }'}</code> to{' '}
                            <code>replies</code>. Use <code>delayMs</code> or{' '}
                            <code>closeAfter</code> to test slow replies and disconnects.
                        </span>
                    </label>
                    <SharingControl value={visibility} onChange={setVisibility} disabled={busy} />
                    <Flex gap="3" wrap="wrap" align="center">
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Working…' : mock ? 'Save script' : 'Create mock'}
                        </Button>
                        {mock && (visibility !== mock.visibility || visibility === 'private') && (
                            <Button
                                type="button"
                                variant="soft"
                                disabled={busy}
                                onClick={() => void mutate('sharing')}
                            >
                                {visibility !== mock.visibility
                                    ? 'Update access'
                                    : 'Rotate access token'}
                            </Button>
                        )}
                        {mock && (
                            <AlertDialog.Root>
                                <AlertDialog.Trigger>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        color="red"
                                        disabled={busy}
                                    >
                                        Delete mock
                                    </Button>
                                </AlertDialog.Trigger>
                                <AlertDialog.Content>
                                    <AlertDialog.Title>Delete this mock?</AlertDialog.Title>
                                    <AlertDialog.Description>
                                        The URL and its traffic history will no longer be available.
                                    </AlertDialog.Description>
                                    <Flex gap="3" wrap="wrap" align="center">
                                        <AlertDialog.Cancel>
                                            <Button variant="soft" color="gray">
                                                Cancel
                                            </Button>
                                        </AlertDialog.Cancel>
                                        <AlertDialog.Action>
                                            <Button
                                                color="red"
                                                onClick={() => void mutate('delete')}
                                            >
                                                Delete mock
                                            </Button>
                                        </AlertDialog.Action>
                                    </Flex>
                                </AlertDialog.Content>
                            </AlertDialog.Root>
                        )}
                    </Flex>
                </form>
                <section className="llm-preview" aria-label="WebSocket connection">
                    <h2>Connect your client</h2>
                    {mock ? (
                        <>
                            <div className="code-row">
                                <code>{mock.endpointUrl}</code>
                                <CopyButton
                                    compact
                                    text={mock.endpointUrl}
                                    label="Copy WebSocket URL"
                                />
                            </div>
                            <p className="field-help">
                                Expires {new Date(mock.expiresAt).toLocaleString()}. Use test data
                                only.
                            </p>
                            {mock.visibility === 'private' && (
                                <div className="resource-access">
                                    <strong>Private access</strong>
                                    <p>
                                        Send the access token in the <code>X-Access-Token</code>{' '}
                                        handshake header.
                                    </p>
                                    {mock.accessToken ? (
                                        <CopyButton
                                            text={mock.accessToken}
                                            label="Copy access token"
                                        />
                                    ) : (
                                        <p>Rotate the token to get a new one.</p>
                                    )}
                                </div>
                            )}
                            {(mock.visibility === 'public' || viewer.status === 'user') && (
                                <form
                                    className="email-create-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        quickTest();
                                    }}
                                >
                                    <label className="field-label">
                                        Test message
                                        <TextField.Root
                                            value={message}
                                            maxLength={4096}
                                            onChange={(e) => setMessage(e.target.value)}
                                        />
                                    </label>
                                    <Button type="submit" variant="soft">
                                        Send test message
                                    </Button>
                                    <p className="field-help" role="status">
                                        {probe.label}
                                    </p>
                                    {probe.data !== undefined && (
                                        <div className="code-row">
                                            <code>{probe.data || '(empty message)'}</code>
                                        </div>
                                    )}
                                </form>
                            )}
                            <p className="field-help">
                                <Link className="text-link" href="/tools/websocket-tester/">
                                    Open the WebSocket tester
                                </Link>{' '}
                                for a timed capture.
                            </p>
                            <MockCalls id={mock.id} token={mock.managementToken ?? ''} websocket />
                        </>
                    ) : (
                        <p className="field-help">
                            Create a mock to get a WebSocket URL and see its connection, message and
                            close events here.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
