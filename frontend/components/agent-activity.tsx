'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Entry {
    at: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    keyId?: string;
}

/** What the workspace's agents have been doing over MCP: tool, key, result and time. */
export function AgentActivity({ keys }: { keys: { id: string; name: string }[] }) {
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [key, setKey] = useState('all');
    useEffect(() => {
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const value = await (await api('/api/account/activity')).json();
                if (live) setEntries(value.activity);
            } catch {
                if (live) setEntries((current) => current ?? []);
            }
            if (live) timer = setTimeout(load, 10000);
        }
        void load();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, []);
    const names = new Map(keys.map((item) => [item.id, item.name]));
    const shown = (entries ?? []).filter((entry) => key === 'all' || entry.keyId === key);
    const failures = shown.filter((entry) => !entry.ok).length;
    return (
        <div className="settings-stack">
            <section className="settings-card agent-activity">
                <div className="agent-activity-heading">
                    <div>
                        <h2>What your agents did</h2>
                        <p>
                            Every MCP tool call made with this workspace’s API keys. Only the tool,
                            result and timing are kept, never arguments or results.
                        </p>
                    </div>
                    <Link className="button button-primary button-small" href="/connect/">
                        Connect an agent
                    </Link>
                </div>
                {keys.length > 1 && (
                    <label className="agent-activity-filter">
                        Key
                        <select value={key} onChange={(event) => setKey(event.target.value)}>
                            <option value="all">All keys</option>
                            {keys.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {entries === null ? (
                    <p className="tool-notice">Loading…</p>
                ) : shown.length ? (
                    <>
                        <p className="tool-notice">
                            {shown.length} recent call{shown.length === 1 ? '' : 's'}
                            {failures ? ` · ${failures} failed` : ''}
                        </p>
                        <div className="content-table-wrap">
                            <table className="content-table">
                                <thead>
                                    <tr>
                                        <th scope="col">When</th>
                                        <th scope="col">Tool</th>
                                        <th scope="col">Key</th>
                                        <th scope="col">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.slice(0, 200).map((entry, index) => (
                                        <tr key={`${entry.at}-${index}`}>
                                            <td>{new Date(entry.at).toLocaleString()}</td>
                                            <td>
                                                <code>{entry.tool}</code>
                                            </td>
                                            <td>
                                                {entry.keyId
                                                    ? (names.get(entry.keyId) ?? 'Deleted key')
                                                    : 'Signed-in session'}
                                            </td>
                                            <td className={entry.ok ? 'replay-ok' : 'replay-error'}>
                                                {entry.ok ? 'OK' : 'Failed'} · {entry.durationMs} ms
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <p className="tool-notice">
                        No agent activity yet. Create an API key, add socket.help to your agent and
                        ask it to create a webhook inbox.
                    </p>
                )}
            </section>
        </div>
    );
}
