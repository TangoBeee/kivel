'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { Check, Copy } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { setupPrompt } from '../lib/setup-prompt';
import { activityLabel, timeAgo } from '../lib/activity-labels';
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

/** Overview: what needs you, your tools (passed in as children), and what your agents did. */
export function AgentOverview({
    onOpen,
    needs = [],
    children,
}: {
    onOpen: (panel: DashboardPanel) => void;
    /** Other things waiting on the person, such as verifying their email. */
    needs?: { id: string; title: string; detail: string; action: string; onAction: () => void }[];
    children?: React.ReactNode;
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

    if (agents === null)
        return (
            <div className="home-panels" role="status" aria-label="Loading your workspace">
                <span className="skeleton" style={{ height: 120 }} />
                <span className="skeleton" style={{ height: 200 }} />
            </div>
        );
    const waiting = questions.length + needs.length;
    return (
        <div className="home-panels">
            {agents.length === 0 && (
                <section className="home-connect" aria-labelledby="connect-heading">
                    <div>
                        <h2 id="connect-heading">Connect your first agent</h2>
                        <p>
                            Paste the setup prompt into Claude Code, Cursor or Codex. Your agent
                            asks to join, and you approve it here.
                        </p>
                    </div>
                    <div className="home-panel-actions">
                        <CopySetup />
                        <Link href="/connect/" className="home-panel-link">
                            Set it up by hand
                        </Link>
                    </div>
                </section>
            )}
            {waiting > 0 && (
                <section className="home-section" aria-labelledby="waiting-heading">
                    <div className="home-section-head">
                        <h2 id="waiting-heading">
                            Needs you <span className="home-count">{waiting}</span>
                        </h2>
                    </div>
                    <ul className="home-rows">
                        {questions.map((item) => (
                            <li key={item.id}>
                                <span className="home-row-main">
                                    <strong>{item.question}</strong>
                                    <small>{item.agentName} is waiting for your answer</small>
                                </span>
                                <Link
                                    className="button button-primary button-small"
                                    href={`/approve/?id=${item.id}`}
                                >
                                    Answer
                                </Link>
                            </li>
                        ))}
                        {needs.map((item) => (
                            <li key={item.id}>
                                <span className="home-row-main">
                                    <strong>{item.title}</strong>
                                    <small>{item.detail}</small>
                                </span>
                                <button className="button button-small" onClick={item.onAction}>
                                    {item.action}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {children}
            <section className="home-section" aria-labelledby="activity-heading">
                <div className="home-section-head">
                    <h2 id="activity-heading">What your agents did</h2>
                    {activity.length > 0 && (
                        <button
                            type="button"
                            className="home-panel-link"
                            onClick={() => onOpen('agents')}
                        >
                            View all
                        </button>
                    )}
                </div>
                {activity.length ? (
                    <ul className="home-rows">
                        {activity.map((entry, index) => (
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
                                        {agents.find((agent) => agent.id === entry.keyId)?.name ??
                                            (entry.keyId ? 'API key' : 'You')}
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
                ) : (
                    <p className="home-empty">
                        Nothing yet. Every tool your agents call shows up here.
                    </p>
                )}
            </section>
        </div>
    );
}
