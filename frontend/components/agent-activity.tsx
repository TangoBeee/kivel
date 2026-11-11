'use client';

import Link from 'next/link';
import { siteOrigin } from '../lib/site';
import { useEffect, useState } from 'react';
import { DropdownMenu, IconButton } from '@radix-ui/themes';
import { DotsThree } from '@phosphor-icons/react';
import { activityLabel, timeAgo } from '../lib/activity-labels';
import { api } from '../lib/api';
import { EmailDraftPreview } from './email-drafts';

interface Entry {
    at: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    keyId?: string;
    resourceId?: string;
}

/** What the workspace's agents have been doing over MCP: tool, key, result and time. */
interface Agent {
    id: string;
    name: string;
    client?: string;
    lastUsedAt: string | null;
}

interface Question {
    id: string;
    agentName: string;
    question: string;
    status: 'pending' | 'answered' | 'expired';
    answer?: string;
    answeredBy?: string;
    createdAt: string;
    answerUrl: string;
    emailDraft?: { id: string };
}

export function AgentActivity({ keys }: { keys: { id: string; name: string }[] }) {
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [agents, setAgents] = useState<Agent[] | null>(null);
    const [limit, setLimit] = useState(0);
    async function loadAgents() {
        try {
            const value = await (await api('/api/agents')).json();
            setAgents(value.agents);
            setLimit(value.limit);
        } catch {
            setAgents((current) => current ?? []);
        }
    }
    useEffect(() => {
        void loadAgents();
    }, []);
    async function remove(agent: Agent) {
        if (!confirm(`Disconnect ${agent.name}? Its key stops working right away.`)) return;
        try {
            await api(`/api/agents/${agent.id}`, { method: 'DELETE' });
            await loadAgents();
        } catch {}
    }
    const [questions, setQuestions] = useState<Question[]>([]);
    const [key, setKey] = useState('all');
    useEffect(() => {
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const value = await (await api('/api/account/activity')).json();
                if (live) setEntries(value.activity);
                const asked = await (await api('/api/approvals')).json();
                if (live) setQuestions(asked.approvals);
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
    const names = new Map([
        ...keys.map((item) => [item.id, item.name.replace(/^Agent: /, '')] as const),
        ...(agents ?? []).map((item) => [item.id, item.name] as const),
    ]);
    const shown = (entries ?? []).filter((entry) => key === 'all' || entry.keyId === key);
    const failures = shown.filter((entry) => !entry.ok).length;
    const pending = questions.filter((item) => item.status === 'pending');
    const past = questions.filter((item) => item.status !== 'pending');
    const [allPast, setAllPast] = useState(false);
    const [more, setMore] = useState(false);
    const actors = (agents ?? []).filter((agent) =>
        (entries ?? []).some((entry) => entry.keyId === agent.id),
    );
    return (
        <div className="home-panels">
            <section className="home-section" aria-labelledby="agents-heading">
                <div className="home-section-head">
                    <h2 id="agents-heading">
                        Connected{' '}
                        <span className="home-count">
                            {agents?.length ?? 0} of {limit}
                        </span>
                    </h2>
                </div>
                {agents === null ? (
                    <span className="skeleton" style={{ height: 120 }} />
                ) : agents.length ? (
                    <ul className="home-rows">
                        {agents.map((agent) => (
                            <li key={agent.id}>
                                <span className="home-row-main">
                                    <strong>{agent.name}</strong>
                                    <small>
                                        {agent.client ? `${agent.client} · ` : ''}
                                        {agent.lastUsedAt
                                            ? `active ${timeAgo(agent.lastUsedAt)}`
                                            : 'not used yet'}
                                    </small>
                                </span>
                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger>
                                        <IconButton
                                            aria-label={`More actions for ${agent.name}`}
                                            variant="ghost"
                                            color="gray"
                                        >
                                            <DotsThree size={20} />
                                        </IconButton>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Content align="end">
                                        <DropdownMenu.Item
                                            onSelect={() => {
                                                setKey(agent.id);
                                                document
                                                    .getElementById('activity-heading')
                                                    ?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                        >
                                            Show its activity
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Separator />
                                        <DropdownMenu.Item
                                            color="red"
                                            onSelect={() => void remove(agent)}
                                        >
                                            Disconnect
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Root>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="home-empty">
                        No agents yet. Paste the setup prompt into your agent and approve it when it
                        asks.{' '}
                        <Link className="text-link" href={`${siteOrigin}/connect/`}>
                            How to connect
                        </Link>
                    </p>
                )}
                {agents && agents.length > 0 && (
                    <p className="home-note">
                        Each agent has its own key. Disconnecting one stops its key right away.
                    </p>
                )}
            </section>
            {questions.length > 0 && (
                <section className="home-section" aria-labelledby="questions-heading">
                    <div className="home-section-head">
                        <h2 id="questions-heading">
                            Questions{' '}
                            {pending.length > 0 && (
                                <span className="home-count">{pending.length} waiting</span>
                            )}
                        </h2>
                    </div>
                    <ul className="home-rows">
                        {[...pending, ...(allPast ? past : past.slice(0, 3))].map((item) => (
                            <li
                                key={item.id}
                                className={item.status === 'pending' ? '' : 'is-done'}
                            >
                                <span className="home-row-main">
                                    <strong>{item.question}</strong>
                                    <small>
                                        {item.agentName} · {timeAgo(item.createdAt)}
                                        {item.status === 'answered'
                                            ? ` · answered “${item.answer}”${item.answeredBy ? ` by ${item.answeredBy}` : ''}`
                                            : item.status === 'expired'
                                              ? ' · expired without an answer'
                                              : ''}
                                    </small>
                                </span>
                                {item.status === 'pending' && (
                                    <Link
                                        className="button button-primary button-small"
                                        href={`/approve/?id=${item.id}`}
                                    >
                                        Answer
                                    </Link>
                                )}
                            </li>
                        ))}
                    </ul>
                    {pending
                        .filter((item) => item.emailDraft)
                        .map((item) => (
                            <details className="connection-details" key={item.id}>
                                <summary>Review draft from {item.agentName}</summary>
                                <EmailDraftPreview id={item.emailDraft!.id} />
                                <Link href={`/approve/?id=${item.id}`}>Open approval page</Link>
                            </details>
                        ))}
                    {past.length > 3 && (
                        <button
                            type="button"
                            className="home-panel-link home-more"
                            onClick={() => setAllPast(!allPast)}
                        >
                            {allPast ? 'Show fewer' : `Show ${past.length - 3} older`}
                        </button>
                    )}
                </section>
            )}
            <section className="home-section" aria-labelledby="activity-heading">
                <div className="home-section-head">
                    <h2 id="activity-heading">
                        What your agents did{' '}
                        {shown.length > 0 && (
                            <span className="home-count">
                                {shown.length} call{shown.length === 1 ? '' : 's'}
                                {failures ? `, ${failures} failed` : ''}
                            </span>
                        )}
                    </h2>
                </div>
                {actors.length > 1 && (
                    <div className="filter-chips" role="group" aria-label="Agent">
                        {[{ id: 'all', name: 'All agents' }, ...actors].map((agent) => (
                            <button
                                key={agent.id}
                                type="button"
                                aria-pressed={key === agent.id}
                                onClick={() => setKey(agent.id)}
                            >
                                {agent.name}
                            </button>
                        ))}
                    </div>
                )}
                {entries === null ? (
                    <div className="activity-skeleton" role="status" aria-label="Loading activity">
                        {[0, 1, 2, 3].map((item) => (
                            <span key={item} className="skeleton" style={{ height: 44 }} />
                        ))}
                    </div>
                ) : shown.length ? (
                    <>
                        <ul className="home-rows">
                            {shown.slice(0, more ? 200 : 25).map((entry, index) => (
                                <li key={`${entry.at}-${index}`}>
                                    <span
                                        className={`activity-dot ${entry.ok ? '' : 'is-failed'}`}
                                        aria-hidden="true"
                                    />
                                    <span className="home-row-main">
                                        <strong>
                                            {activityLabel(entry.tool)}
                                            {!entry.ok && <em> · failed</em>}
                                        </strong>
                                        <small>
                                            {entry.keyId
                                                ? (names.get(entry.keyId) ?? 'Removed key')
                                                : 'You, in the browser'}{' '}
                                            · <code>{entry.tool}</code> · {entry.durationMs} ms
                                        </small>
                                    </span>
                                    <time
                                        dateTime={entry.at}
                                        title={new Date(entry.at).toLocaleString()}
                                    >
                                        {timeAgo(entry.at)}
                                    </time>
                                </li>
                            ))}
                        </ul>
                        {shown.length > 25 && (
                            <button
                                type="button"
                                className="home-panel-link home-more"
                                onClick={() => setMore(!more)}
                            >
                                {more
                                    ? 'Show fewer'
                                    : `Show ${Math.min(200, shown.length) - 25} more`}
                            </button>
                        )}
                        <p className="home-note">
                            Only the tool, result and timing are kept, never what was sent or
                            returned.
                        </p>
                    </>
                ) : (
                    <p className="home-empty">
                        No activity yet. Once an agent is connected, every tool it calls shows up
                        here.
                    </p>
                )}
            </section>
        </div>
    );
}
