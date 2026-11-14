'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    ArrowRight,
    At,
    BracketsCurly,
    Clock,
    EnvelopeSimple,
    HandPalm,
    LinkSimple,
    Pulse,
    Robot,
    WebhooksLogo,
} from '@phosphor-icons/react';
import { siteOrigin } from '../lib/site';
import { api, ApiError } from '../lib/api';
import { setupPrompt } from '../lib/setup-prompt';
import { activityLabel, timeAgo } from '../lib/activity-labels';
import { CopyButton } from './copy-button';
import {
    WorkspaceCard,
    WorkspaceEmpty,
    WorkspaceIcon,
    WorkspaceStat,
    type WorkspaceTone,
} from './workspace-ui';
import type { DashboardPanel } from './dashboard-shell';

interface Overview {
    series: Record<'email' | 'webhooks' | 'mocks' | 'checks', number[]>;
    uptime: (number | null)[];
    latestEmail: {
        inboxId: string;
        from: string;
        to: string;
        subject: string;
        receivedAt: string;
        codes: string[];
        link?: string;
    } | null;
}
interface Agent {
    id: string;
    keyId?: string;
    name: string;
    lastUsedAt: string | null;
}
interface Activity {
    at: string;
    tool: string;
    ok: boolean;
    keyId?: string;
    agentName?: string;
}
interface Question {
    id: string;
    agentName: string;
    question: string;
}
type Reminder = { id: string; title: string; detail: string; action: string; onAction: () => void };

const activityStyles: [RegExp, WorkspaceTone, typeof Robot][] = [
    [/email/, 'email', EnvelopeSimple],
    [/webhook/, 'webhooks', WebhooksLogo],
    [/mock|oauth/, 'mocks', BracketsCurly],
    [/monitor|heartbeat/, 'monitors', Pulse],
    [/approval|ask_human/, 'approvals', HandPalm],
];
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

export function AgentOverview({
    username,
    onOpen,
    needs = [],
}: {
    username: string;
    onOpen: (panel: DashboardPanel) => void;
    needs?: Reminder[];
}) {
    const [snapshot, setSnapshot] = useState<{
        overview: Overview;
        agents: Agent[];
        questions: Question[];
        activity: Activity[];
    }>();
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const read = (path: string) =>
            api(path, { signal: controller.signal }).then((response) => response.json());
        async function load() {
            let delay = 15000;
            try {
                const [overview, { agents }, { approvals }, { activity }] = await Promise.all([
                    read('/api/account/overview'),
                    read('/api/agents'),
                    read('/api/approvals?status=pending'),
                    read('/api/account/activity'),
                ]);
                if (controller.signal.aborted) return;
                setSnapshot({ overview, agents, questions: approvals, activity });
                setError('');
            } catch (failure) {
                if (controller.signal.aborted) return;
                setError('Workspace activity could not be refreshed.');
                if (failure instanceof ApiError) delay = Math.max(delay, failure.retryAfter * 1000);
            }
            timer = setTimeout(load, delay);
        }
        void load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [revision]);

    const waiting = (snapshot?.questions.length ?? 0) + needs.length;
    const question = snapshot?.questions[0];
    const reminder = needs[0];
    const name = username.replace(/[_.-]+/g, ' ');
    const { overview, agents = [], activity = [] } = snapshot ?? {};
    const checks = overview ? total(overview.series.checks) : 0;
    const uptime =
        overview && checks
            ? overview.uptime.reduce<number>(
                  (sum, rate, i) => sum + (rate ?? 0) * overview.series.checks[i]!,
                  0,
              ) / checks
            : null;
    const mail = overview?.latestEmail;
    return (
        <div className="workspace-overview">
            <header className="workspace-greeting">
                <div>
                    <h1>Hello, {name.charAt(0).toUpperCase() + name.slice(1)}</h1>
                    <p>
                        {activity.length > 0 &&
                            `${activity.filter((event) => Date.now() - Date.parse(event.at) < 86400000).length} recorded tool calls in the last 24 hours. `}
                        {waiting === 1
                            ? 'One thing is waiting for you.'
                            : waiting > 1
                              ? `${waiting} things are waiting for you.`
                              : 'You’re all caught up.'}
                    </p>
                </div>
                {agents.length > 0 && (
                    <ul className="workspace-agents" aria-label="Connected agents">
                        {agents.slice(0, 3).map((agent) => (
                            <li key={agent.id}>
                                <button type="button" onClick={() => onOpen('agents')}>
                                    <Robot size={17} /> <strong>{agent.name}</strong>
                                    <small>
                                        {agent.lastUsedAt ? timeAgo(agent.lastUsedAt) : 'Connected'}
                                    </small>
                                </button>
                            </li>
                        ))}
                        {agents.length > 3 && (
                            <li>
                                <button type="button" onClick={() => onOpen('agents')}>
                                    All {agents.length} agents
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </header>
            {(question || reminder) && (
                <div className="workspace-waiting">
                    <HandPalm size={23} />
                    <div>
                        <strong>
                            {question ? `${question.agentName} needs you` : reminder?.title}
                        </strong>
                        <p>{question?.question ?? reminder?.detail}</p>
                    </div>
                    {question ? (
                        <Link
                            href={`/approvals/?id=${encodeURIComponent(question.id)}`}
                            aria-label="Review approval"
                        >
                            <ArrowRight size={19} />
                        </Link>
                    ) : (
                        <button
                            type="button"
                            aria-label={reminder?.action}
                            onClick={reminder?.onAction}
                        >
                            <ArrowRight size={19} />
                        </button>
                    )}
                </div>
            )}
            {error && (
                <p className="workspace-refresh-error" role="status">
                    {error}{' '}
                    <button className="text-link" onClick={() => setRevision(revision + 1)}>
                        Retry
                    </button>
                </p>
            )}
            {!snapshot && !error && (
                <div
                    className="workspace-stat-grid"
                    role="status"
                    aria-label="Loading workspace activity"
                >
                    {[0, 1, 2, 3].map((key) => (
                        <span className="skeleton workspace-stat-skeleton" key={key} />
                    ))}
                </div>
            )}
            {overview && (
                <div className="workspace-stat-grid">
                    <WorkspaceStat
                        icon={EnvelopeSimple}
                        tone="email"
                        title="Emails received"
                        value={total(overview.series.email).toLocaleString()}
                        series={overview.series.email}
                        onOpen={() => onOpen('email')}
                    />
                    <WorkspaceStat
                        icon={WebhooksLogo}
                        tone="webhooks"
                        title="Webhooks captured"
                        value={total(overview.series.webhooks).toLocaleString()}
                        series={overview.series.webhooks}
                        onOpen={() => onOpen('webhooks')}
                    />
                    <WorkspaceStat
                        icon={BracketsCurly}
                        tone="mocks"
                        title="Mock API calls"
                        value={total(overview.series.mocks).toLocaleString()}
                        series={overview.series.mocks}
                        onOpen={() => onOpen('mocks')}
                    />
                    <WorkspaceStat
                        icon={Pulse}
                        tone="monitors"
                        title="Uptime"
                        value={
                            uptime === null
                                ? '—'
                                : `${uptime.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
                        }
                        series={overview.uptime}
                        note={checks ? `${checks} retained checks` : 'No checks yet'}
                        max={100}
                        onOpen={() => onOpen('monitors')}
                    />
                </div>
            )}
            {snapshot && (
                <div className="workspace-home-grid">
                    <WorkspaceCard
                        title="What your agents did"
                        action={
                            <span className="workspace-refresh">
                                <Clock size={13} />{' '}
                                {error ? 'Refresh delayed' : 'Updates every 15 sec'}
                            </span>
                        }
                    >
                        {activity.length ? (
                            <ul className="workspace-feed">
                                {activity.slice(0, 7).map((event, index) => {
                                    const [, tone, Icon] =
                                        activityStyles.find(([pattern]) =>
                                            pattern.test(event.tool),
                                        ) ?? ([null, 'webhooks', Robot] as const);
                                    const agent =
                                        event.agentName ??
                                        agents.find(
                                            (item) => (item.keyId ?? item.id) === event.keyId,
                                        )?.name;
                                    return (
                                        <li key={`${event.at}-${index}`}>
                                            <WorkspaceIcon icon={Icon} tone={tone} />
                                            <div>
                                                <strong>{activityLabel(event.tool)}</strong>
                                                <small>
                                                    {agent ??
                                                        (event.keyId ? 'API key' : 'Workspace')}
                                                    {event.ok ? '' : ' · Failed'}
                                                </small>
                                            </div>
                                            <time dateTime={event.at}>{timeAgo(event.at)}</time>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <WorkspaceEmpty title="No activity yet">
                                Tool calls appear here as your agents work.
                            </WorkspaceEmpty>
                        )}
                        {activity.length > 0 && (
                            <button
                                className="text-link workspace-card-action"
                                onClick={() => onOpen('agents')}
                            >
                                View activity
                            </button>
                        )}
                    </WorkspaceCard>
                    <WorkspaceCard
                        title="Latest email"
                        icon={<WorkspaceIcon icon={EnvelopeSimple} tone="email" />}
                        action={
                            mail && (
                                <Link
                                    className="text-link"
                                    href={`/email/?inbox=${encodeURIComponent(mail.inboxId)}`}
                                >
                                    Open inbox
                                </Link>
                            )
                        }
                    >
                        {mail ? (
                            <div className="workspace-latest">
                                <div>
                                    <strong>{mail.from || 'Unknown sender'}</strong>
                                    <small>{timeAgo(mail.receivedAt)}</small>
                                </div>
                                <p>{mail.subject || 'No subject'}</p>
                                {mail.codes?.[0] && (
                                    <div className="workspace-email-code">
                                        <div>
                                            <small>Code found</small>
                                            <code>{mail.codes[0]}</code>
                                        </div>
                                        <CopyButton
                                            compact
                                            text={mail.codes[0]}
                                            label="Copy verification code"
                                        />
                                    </div>
                                )}
                                {mail.link && (
                                    <div className="workspace-mail-fact">
                                        <LinkSimple size={16} />
                                        <span>{mail.link}</span>
                                        <CopyButton
                                            compact
                                            text={mail.link}
                                            label="Copy verification link"
                                        />
                                    </div>
                                )}
                                <div className="workspace-mail-fact">
                                    <At size={16} />
                                    <span>{mail.to}</span>
                                </div>
                            </div>
                        ) : (
                            <WorkspaceEmpty title="No email received yet">
                                <button className="text-link" onClick={() => onOpen('email')}>
                                    Open email inboxes
                                </button>
                            </WorkspaceEmpty>
                        )}
                    </WorkspaceCard>
                </div>
            )}
            {snapshot && agents.length === 0 && (
                <WorkspaceCard title="Connect your first agent">
                    <div className="workspace-connect">
                        <p>
                            Paste the setup prompt into your coding agent, then approve its request
                            to join.
                        </p>
                        <CopyButton text={setupPrompt} label="Copy setup prompt" />
                        <Link className="text-link" href={`${siteOrigin}/connect/`}>
                            Setup guide
                        </Link>
                    </div>
                </WorkspaceCard>
            )}
            {waiting > 1 && (
                <button
                    className="text-link workspace-card-action"
                    onClick={() => onOpen(question ? 'approvals' : 'security')}
                >
                    {question ? 'Review all approvals' : 'Open account security'}
                </button>
            )}
        </div>
    );
}
