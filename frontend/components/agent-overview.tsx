'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { Check, Copy } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { setupPrompt } from '../lib/setup-prompt';
import type { DashboardPanel } from './dashboard-shell';

interface Agent {
    id: string;
    name: string;
    client?: string;
    lastUsedAt: string | null;
}
interface Activity {
    at: string;
    tool: string;
    ok: boolean;
    keyId?: string;
}
const since = (value: string) => {
    const seconds = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
};
interface Question {
    id: string;
    agentName: string;
    question: string;
}

function CopySetup({
    label = 'Copy setup prompt',
    quiet = false,
}: {
    label?: string;
    quiet?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            size={quiet ? '2' : '3'}
            variant={quiet ? 'soft' : 'solid'}
            color={quiet ? 'gray' : undefined}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(setupPrompt);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2200);
                } catch {}
            }}
        >
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
            <span aria-live="polite">{copied ? 'Copied. Paste it into your agent' : label}</span>
        </Button>
    );
}

/** Home: a summary line, what needs you, your agents and what they did. */
export function AgentOverview({
    onOpen,
    plan,
    resources,
    maxResources,
}: {
    onOpen: (panel: DashboardPanel) => void;
    plan: string;
    resources: number;
    maxResources: number;
}) {
    const [agents, setAgents] = useState<Agent[] | null>(null);
    const [limit, setLimit] = useState(0);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [activity, setActivity] = useState<Activity[]>([]);

    useEffect(() => {
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const [list, asked, log] = await Promise.all([
                    api('/api/agents').then((response) => response.json()),
                    api('/api/approvals?status=pending').then((response) => response.json()),
                    api('/api/account/activity').then((response) => response.json()),
                ]);
                if (!live) return;
                setAgents(list.agents);
                setLimit(list.limit);
                setQuestions(asked.approvals);
                setActivity(log.activity.slice(0, 6));
            } catch {
                if (live) setAgents((current) => current ?? []);
            }
            if (live) timer = setTimeout(load, 15000);
        }
        void load();
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, []);

    if (agents === null) return <div className="home-panel is-loading" aria-hidden="true" />;
    if (agents.length === 0)
        return (
            <section className="home-panel home-panel-empty" aria-labelledby="connect-heading">
                <h2 id="connect-heading">Connect your first agent</h2>
                <p>
                    Paste the setup prompt into Claude Code, Cursor or Codex. Your agent asks to
                    join, and you approve it here.
                </p>
                <div className="home-panel-actions">
                    <CopySetup />
                    <Link href="/connect/" className="home-panel-link">
                        Set it up by hand
                    </Link>
                </div>
            </section>
        );
    const summary: { label: string; value: string; panel: DashboardPanel }[] = [
        { label: 'Agents', value: `${agents.length} of ${limit}`, panel: 'agents' },
        { label: 'Waiting on you', value: String(questions.length), panel: 'agents' },
        { label: 'Resources', value: `${resources} of ${maxResources || '-'}`, panel: 'resources' },
        { label: 'Plan', value: plan, panel: 'billing' },
    ];
    return (
        <div className="home-panels">
            <div className="home-summary">
                {summary.map((item) => (
                    <button key={item.label} type="button" onClick={() => onOpen(item.panel)}>
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                    </button>
                ))}
            </div>
            {questions.length > 0 && (
                <section className="home-panel" aria-labelledby="waiting-heading">
                    <h2 id="waiting-heading">Waiting on you</h2>
                    <ul>
                        {questions.map((item) => (
                            <li key={item.id}>
                                <span>
                                    <strong>{item.question}</strong>
                                    <small>{item.agentName}</small>
                                </span>
                                <Link
                                    className="button button-primary"
                                    href={`/approve/?id=${item.id}`}
                                >
                                    Answer
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <div className="home-columns">
                <section className="home-panel" aria-labelledby="agents-heading">
                    <div className="home-panel-head">
                        <h2 id="agents-heading">
                            Agents{' '}
                            <span>
                                {agents.length} of {limit}
                            </span>
                        </h2>
                        <button
                            type="button"
                            className="home-panel-link"
                            onClick={() => onOpen('agents')}
                        >
                            Manage
                        </button>
                    </div>
                    <ul>
                        {agents.map((agent) => (
                            <li key={agent.id}>
                                <span>
                                    <strong>{agent.name}</strong>
                                    <small>
                                        {agent.lastUsedAt
                                            ? `Active ${since(agent.lastUsedAt)}`
                                            : 'Not used yet'}
                                    </small>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {agents.length < limit && <CopySetup label="Connect another agent" quiet />}
                </section>
                <section className="home-panel" aria-labelledby="activity-heading">
                    <h2 id="activity-heading">Recent activity</h2>
                    {activity.length ? (
                        <ul>
                            {activity.map((entry, index) => (
                                <li key={`${entry.at}-${index}`}>
                                    <span>
                                        <strong>
                                            <code>{entry.tool}</code>
                                            {!entry.ok && <em> failed</em>}
                                        </strong>
                                        <small>
                                            {agents.find((agent) => agent.id === entry.keyId)
                                                ?.name ?? 'API key'}
                                        </small>
                                    </span>
                                    <time dateTime={entry.at}>{since(entry.at)}</time>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Every tool your agents call shows up here.</p>
                    )}
                </section>
            </div>
        </div>
    );
}
