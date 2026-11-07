'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { parseJsonSafely } from '@kivel/tools/engine';
import { api } from '../lib/api';
import { useViewer } from '../lib/viewer';
import { ToolHeader } from './tool-header';
import { ResultPreview } from './result-preview';
interface Entry {
    namespace: string;
    key: string;
    value: unknown;
    bytes: number;
    updatedAt?: string;
    expiresAt?: string;
}
export function MemoryWorkbench({ toolId }: { toolId: string }) {
    const viewer = useViewer();
    const [namespace, setNamespace] = useState('project'),
        [key, setKey] = useState('build/latest');
    const [value, setValue] = useState('{\n  "ready": true,\n  "step": "build"\n}'),
        [ttl, setTtl] = useState('');
    const [entries, setEntries] = useState<Omit<Entry, 'value'>[]>([]),
        [entry, setEntry] = useState<Entry | null>(null);
    const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('');
    const base = `/api/memory/${encodeURIComponent(namespace)}`;
    async function list() {
        const response = await (await api(base)).json();
        setEntries(response.keys);
        setUsage({ used: response.usedBytes, limit: response.limitBytes });
    }
    useEffect(() => {
        if (viewer.status !== 'user' || !/^[A-Za-z0-9._:-]{1,64}$/.test(namespace)) return;
        let live = true;
        const timer = setTimeout(() => {
            void api(base)
                .then((response) => response.json())
                .then((data) => {
                    if (live) {
                        setEntries(data.keys);
                        setUsage({ used: data.usedBytes, limit: data.limitBytes });
                    }
                })
                .catch((failure) => {
                    if (live) setError(failure.message);
                });
        }, 200);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [viewer.status, viewer.status === 'user' ? viewer.workspace : '', namespace, base]);
    async function run(action: 'get' | 'save' | 'delete', selected = key) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            if (
                !/^[A-Za-z0-9._:-]{1,64}$/.test(namespace) ||
                !/^[A-Za-z0-9._:/-]{1,200}$/.test(selected)
            )
                throw new Error(
                    'Use a namespace of 1–64 characters and key of 1–200 characters. Letters, numbers, dots, colons, underscores and hyphens are supported; keys may also contain slashes.',
                );
            const path = `${base}/${selected.split('/').map(encodeURIComponent).join('/')}`;
            if (action === 'save') {
                if (new TextEncoder().encode(value).length > 90000)
                    throw new Error(
                        'Keep browser edits within 90 KiB so the JSON request fits the HTTPS gateway.',
                    );
                const parsed = parseJsonSafely(value);
                const seconds = ttl ? Number(ttl) : undefined;
                if (
                    seconds !== undefined &&
                    (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 31536000)
                )
                    throw new Error('Expiry must be empty or 1–31,536,000 seconds.');
                await api(path, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        value: parsed,
                        ...(seconds ? { ttlSeconds: seconds } : {}),
                    }),
                });
                setEntry(await (await api(path)).json());
                setNotice('Value saved.');
            } else if (action === 'get') {
                const current = await (await api(path)).json();
                setKey(selected);
                setEntry(current);
                setValue(JSON.stringify(current.value, null, 2));
                setTtl('');
            } else {
                await api(path, { method: 'DELETE' });
                setEntry(null);
                setNotice('Key deleted.');
            }
            await list();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to update memory.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader
                toolId={toolId}
                description="Keep JSON state in your workspace. Namespaces organize projects; access is shared with workspace credentials that have the appropriate scopes."
            />
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {viewer.status === 'guest' ? (
                <div className="dashboard-empty">
                    <h2>Keep state between agent sessions.</h2>
                    <p>
                        Free includes 5 MiB of workspace memory. Pro includes 100 MiB; Team includes
                        1 GiB.
                    </p>
                    <Link className="button" href="/account/#register">
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
                            void run('save');
                        }}
                    >
                        <label>
                            Namespace
                            <TextField.Root
                                required
                                maxLength={64}
                                value={namespace}
                                onChange={(event) => {
                                    setNamespace(event.target.value);
                                    setEntry(null);
                                    setEntries([]);
                                    setUsage(null);
                                }}
                            />
                        </label>
                        <label>
                            Key
                            <TextField.Root
                                required
                                maxLength={200}
                                value={key}
                                onChange={(event) => {
                                    setKey(event.target.value);
                                    setEntry(null);
                                }}
                            />
                        </label>
                        <label>
                            JSON value
                            <TextArea
                                required
                                rows={9}
                                value={value}
                                onChange={(event) => setValue(event.target.value)}
                            />
                        </label>
                        <label>
                            Expiry in seconds <span className="muted">(optional)</span>
                            <TextField.Root
                                type="number"
                                min={1}
                                max={31536000}
                                value={ttl}
                                placeholder="Keep until deleted"
                                onChange={(event) => setTtl(event.target.value)}
                            />
                        </label>
                        <div className="button-row">
                            <Button type="submit" disabled={busy}>
                                Save value
                            </Button>
                            <Button
                                type="button"
                                variant="soft"
                                color="gray"
                                disabled={busy}
                                onClick={() => void run('get')}
                            >
                                Read key
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                color="red"
                                disabled={busy}
                                onClick={() => void run('delete')}
                            >
                                Delete key
                            </Button>
                        </div>
                    </form>
                    <section className="llm-preview">
                        <h2>{namespace} keys</h2>
                        {usage && (
                            <p className="muted">
                                {(usage.used / 1048576).toFixed(2)} MiB used of{' '}
                                {(usage.limit / 1048576).toFixed(0)} MiB. Values are private to this
                                workspace.
                            </p>
                        )}
                        <div className="result-table-scroll">
                            <table className="result-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Key</th>
                                        <th scope="col">Size</th>
                                        <th scope="col">Expiry</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map((item) => (
                                        <tr key={item.key}>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="text-link"
                                                    disabled={busy}
                                                    onClick={() => void run('get', item.key)}
                                                >
                                                    {item.key}
                                                </button>
                                            </td>
                                            <td>{item.bytes.toLocaleString()} B</td>
                                            <td>
                                                {item.expiresAt
                                                    ? new Date(item.expiresAt).toLocaleString()
                                                    : 'Until deleted'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {entries.length === 0 && (
                            <p className="muted">No keys in this namespace yet.</p>
                        )}
                        {entry && (
                            <>
                                <p className="muted">
                                    {entry.namespace}/{entry.key} · {entry.bytes.toLocaleString()}{' '}
                                    bytes
                                </p>
                                <ResultPreview
                                    text={JSON.stringify(entry.value, null, 2)}
                                    title="Stored value"
                                    filename="workspace-value.json"
                                />
                            </>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
