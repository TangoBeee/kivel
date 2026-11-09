'use client';

import { Button } from '@radix-ui/themes';
import { describeLimit, type UsageItem } from '@kivel.io/tools/plans';
import { formatBytes, type WorkspaceUsage } from '../lib/workspace-usage';
import { UsageBar } from './tool-page';

const resetTime = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
});

export function UsagePanel({
    plan,
    usage,
    validUntil,
    onPlans,
    onUpgrade,
}: {
    plan: string;
    usage: WorkspaceUsage;
    validUntil: string | null;
    onPlans: () => void;
    onUpgrade?: () => void;
}) {
    const groups = new Map<string, UsageItem[]>();
    for (const item of usage.items ?? []) {
        const group = describeLimit(item.key).group;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(item);
    }
    const free = plan === 'free';
    return (
        <div className="usage-page">
            <div className="usage-plan">
                <div>
                    <small>Your plan</small>
                    <strong>{plan[0]!.toUpperCase() + plan.slice(1)}</strong>
                </div>
                <p>
                    {validUntil && !free
                        ? `Paid through ${new Date(validUntil).toLocaleDateString()}. `
                        : ''}
                    Your workspace shares these allowances across the app and API.
                </p>
                <Button
                    size="2"
                    variant={free ? 'solid' : 'soft'}
                    onClick={free && onUpgrade ? onUpgrade : onPlans}
                >
                    {free ? 'See upgrade options' : 'Manage plan'}
                </Button>
            </div>
            {usage.error ? (
                <p role="alert">{usage.error}</p>
            ) : !usage.items ? (
                <p role="status">Loading usage…</p>
            ) : (
                <div className="usage-groups">
                    {[...groups].map(([group, items]) => (
                        <section key={group}>
                            <h2>{group}</h2>
                            <ul>
                                {items.map((item) => {
                                    const format =
                                        item.unit === 'bytes'
                                            ? formatBytes
                                            : (value: number) => value.toLocaleString();
                                    const near = item.max > 0 && item.used >= item.max * 0.8;
                                    return (
                                        <li key={item.key}>
                                            <span>
                                                <strong>{item.label}</strong>
                                                {item.resetsAt && (
                                                    <small>
                                                        Resets{' '}
                                                        {resetTime.format(new Date(item.resetsAt))}
                                                    </small>
                                                )}
                                                {near && (
                                                    <small>
                                                        {item.used >= item.max
                                                            ? 'At your limit'
                                                            : 'Near your limit'}
                                                    </small>
                                                )}
                                            </span>
                                            <UsageBar used={item.used} limit={item.max} />
                                            <b>
                                                {format(item.used)} / {format(item.max)}
                                            </b>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
