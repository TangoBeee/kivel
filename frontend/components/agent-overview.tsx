'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button } from '@radix-ui/themes';
import { ArrowRight, ChatCircleDots, Check, Copy, Robot } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { setupPrompt } from '../lib/setup-prompt';

interface Agent {
    id: string;
    name: string;
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

function CopySetup({ label = 'Copy setup prompt' }: { label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            size="3"
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

/** The top of the Overview: connect an agent, or see what your agents are waiting on. */
export function AgentOverview({ onOpenAgents }: { onOpenAgents: () => void }) {
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

    if (agents === null) return <div className="agent-overview is-loading" aria-hidden="true" />;
    if (agents.length === 0)
        return (
            <section
                className="agent-overview agent-overview-empty"
                aria-labelledby="connect-heading"
            >
                <div>
                    <h2 id="connect-heading">Connect your first agent</h2>
                    <p>
                        Paste the setup prompt into Claude Code, Cursor or any MCP client. Your
                        agent adds socket.help, asks to join this workspace and waits for you to
                        approve it here.
                    </p>
                    <div className="agent-overview-actions">
                        <CopySetup />
                        <Link href="/connect/" className="agent-overview-link">
                            Manual setup
                            <ArrowRight size={14} />
                        </Link>
                    </div>
                </div>
                <ol className="agent-overview-steps">
                    <li>
                        <strong>Paste the prompt</strong>
                        <span>Your agent adds the MCP server.</span>
                    </li>
                    <li>
                        <strong>Approve it</strong>
                        <span>You get a link and a code to confirm.</span>
                    </li>
                    <li>
                        <strong>Let it work</strong>
                        <span>Inboxes, mocks, memory and questions for you.</span>
                    </li>
                </ol>
            </section>
        );
    return (
        <section className="agent-overview" aria-label="Your agents">
            <button type="button" className="agent-overview-stat" onClick={onOpenAgents}>
                <Robot size={20} />
                <span>
                    <strong>
                        {agents.length} of {limit} agents connected
                    </strong>
                    <small>
                        {agents
                            .slice(0, 3)
                            .map((agent) => agent.name)
                            .join(', ')}
                        {agents.length > 3 ? ` and ${agents.length - 3} more` : ''}
                    </small>
                </span>
                <ArrowRight size={16} className="agent-overview-arrow" />
            </button>
            {questions.length > 0 ? (
                <div className="agent-overview-questions">
                    <span className="agent-overview-waiting">
                        <ChatCircleDots size={20} />
                        Waiting on you
                        <Badge color="amber" variant="soft">
                            {questions.length}
                        </Badge>
                    </span>
                    <ul>
                        {questions.slice(0, 3).map((item) => (
                            <li key={item.id}>
                                <span>
                                    <strong>{item.question}</strong>
                                    <small>{item.agentName}</small>
                                </span>
                                <Link
                                    className="button button-primary button-small"
                                    href={`/approve/?id=${item.id}`}
                                >
                                    Answer
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="agent-overview-quiet">
                    <span>No questions waiting. Your agents ask here before risky steps.</span>
                    <CopySetup label="Connect another agent" />
                </div>
            )}
            <div className="agent-overview-feed">
                <span className="agent-overview-feed-title">Recent agent activity</span>
                {activity.length ? (
                    <ol>
                        {activity.map((entry, index) => (
                            <li key={`${entry.at}-${index}`}>
                                <span
                                    className={`agent-overview-dot ${entry.ok ? '' : 'is-failed'}`}
                                />
                                <code>{entry.tool}</code>
                                <span>
                                    {agents.find((agent) => agent.id === entry.keyId)?.name ??
                                        'API key'}
                                </span>
                                <time dateTime={entry.at}>{since(entry.at)}</time>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p>
                        Nothing yet. Every tool your agents call over MCP shows up here, with its
                        result and time.
                    </p>
                )}
            </div>
        </section>
    );
}
