'use client';
import { Button } from '@radix-ui/themes';
import type { WorkspaceUsage } from '../lib/workspace-usage';
import { formatBytes } from '../lib/workspace-usage';
import type { Resource } from './dashboard-resources';
import { UsageBar } from './tool-page';

type Row = { name: string; detail: string; used: number; limit: number; show: string };

/** Every plan limit on one page, grouped, with when it resets. */
export function UsagePanel({
    plan,
    resources,
    usage,
    onPlans,
}: {
    plan: string;
    resources: Resource[];
    usage: WorkspaceUsage;
    onPlans: () => void;
}) {
    const limits = usage.limits;
    const stored = resources.reduce((sum, item) => sum + item.storedBytes, 0);
    const inboxes = resources.filter((item) => item.kind === 'email').length;
    const pair = (used: number, limit: number) =>
        `${used.toLocaleString()} / ${limit.toLocaleString()}`;
    const groups: { title: string; rows: (Row | undefined)[] }[] = [
        {
            title: 'Agents and email',
            rows: [
                usage.agents && {
                    name: 'Agents',
                    detail: 'Connected to this workspace',
                    ...usage.agents,
                    show: pair(usage.agents.used, usage.agents.limit),
                },
                limits && {
                    name: 'Email inboxes',
                    detail: 'Real addresses',
                    used: inboxes,
                    limit: limits.emailInboxes,
                    show: pair(inboxes, limits.emailInboxes),
                },
                usage.email && {
                    name: 'Emails sent this month',
                    detail: 'Resets on the 1st (UTC)',
                    used: usage.email.month,
                    limit: usage.email.perMonth,
                    show: pair(usage.email.month, usage.email.perMonth),
                },
                usage.email && {
                    name: 'Emails sent today',
                    detail: 'Resets at midnight UTC',
                    used: usage.email.day,
                    limit: usage.email.perDay,
                    show: pair(usage.email.day, usage.email.perDay),
                },
                usage.authenticators && {
                    name: 'Authenticators',
                    detail: 'Two-factor codes',
                    ...usage.authenticators,
                    show: pair(usage.authenticators.used, usage.authenticators.limit),
                },
            ],
        },
        {
            title: 'Resources and storage',
            rows: [
                limits && {
                    name: 'Resources',
                    detail: 'Webhooks, mocks, files and more',
                    used: resources.length,
                    limit: limits.maxResources,
                    show: pair(resources.length, limits.maxResources),
                },
                usage.monitors && {
                    name: 'Monitors',
                    detail: 'Checks with email alerts',
                    ...usage.monitors,
                    show: pair(usage.monitors.used, usage.monitors.limit),
                },
                limits && {
                    name: 'Storage',
                    detail: 'Files and captured requests',
                    used: stored,
                    limit: limits.storageBytes,
                    show: `${formatBytes(stored)} / ${formatBytes(limits.storageBytes)}`,
                },
                usage.memory && {
                    name: 'Memory',
                    detail: 'Saved between sessions',
                    ...usage.memory,
                    show: `${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.limit)}`,
                },
            ],
        },
        {
            title: 'Runs',
            rows: [
                limits && {
                    name: 'Tool runs today',
                    detail: 'Resets at midnight UTC',
                    used: usage.runsToday ?? 0,
                    limit: limits.runsPerDay,
                    show: pair(usage.runsToday ?? 0, limits.runsPerDay),
                },
            ],
        },
    ];
    const free = plan === 'free';
    return (
        <div className="usage-page">
            <div className="usage-plan">
                <div>
                    <small>Your plan</small>
                    <strong>{plan[0]!.toUpperCase() + plan.slice(1)}</strong>
                </div>
                <p>
                    {free
                        ? 'Pro is $2 a month: 10 email inboxes, 500 emails a month, 25 agents, 100 resources, and everything kept while you are subscribed.'
                        : 'Thanks for supporting socket.help. Manage billing in Settings › Plan.'}
                </p>
                <Button size="2" variant={free ? 'solid' : 'soft'} onClick={onPlans}>
                    {free ? 'Upgrade to Pro' : 'Manage plan'}
                </Button>
            </div>
            <div className="usage-groups">
                {groups.map((group) => (
                    <section key={group.title}>
                        <h2>{group.title}</h2>
                        <ul>
                            {group.rows
                                .filter((row): row is Row => !!row)
                                .map((row) => (
                                    <li key={row.name}>
                                        <span>
                                            <strong>{row.name}</strong>
                                            <small>{row.detail}</small>
                                        </span>
                                        <UsageBar used={row.used} limit={row.limit} />
                                        <b>{row.show}</b>
                                    </li>
                                ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
