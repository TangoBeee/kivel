'use client';

import { Button } from '@radix-ui/themes';
import { describeLimit, planRank, type PlanId, type UsageItem } from '@kivel.io/tools/plans';
import { formatBytes } from '../../lib/workspace-usage';

const consequences: Partial<Record<UsageItem['key'], string>> = {
    'resources.active': 'Delete a resource or let one expire to make room for another.',
    'resources.storage': 'Free up storage before adding more data.',
    'email.inboxes': 'Delete an inbox before creating a new one.',
    'monitors.active': 'Delete a monitor before adding another.',
    'memory.bytes': 'Delete stored values to free up memory.',
    'authenticators.entries': 'Delete an authenticator before adding another.',
    'vault.entries': 'Delete an entry before saving another.',
    'email.sent_today': 'Sending resumes when the daily allowance resets.',
    'email.sent_month': 'Sending resumes when the monthly allowance resets.',
    'tools.runs': 'Hosted runs resume when the daily allowance resets.',
    'agents.connected': 'Replace an agent to connect another one.',
    'approvals.questions': 'New requests become available 24 hours after earlier requests.',
    'mocks.oauth': 'Delete an OAuth provider before creating another.',
};

export function LimitCard({
    item,
    plan,
    onPlans,
}: {
    item: UsageItem;
    plan: PlanId;
    onPlans: () => void;
}) {
    const definition = describeLimit(item.key);
    const next = (['free', 'pro', 'team'] as const).find(
        (candidate) =>
            planRank[candidate] > planRank[plan] &&
            definition?.max(candidate) > Math.max(item.max, item.used),
    );
    const more = next && definition.max(next);
    return (
        <aside className="limit-card">
            <div>
                <strong>{item.label} limit reached</strong>
                <p>
                    {consequences[item.key] ??
                        (item.unit === 'bytes'
                            ? 'Delete stored data to free space.'
                            : 'Delete an item or let one expire to make room.')}
                </p>
                {next && more !== undefined && (
                    <p>
                        {{ free: 'Free', pro: 'Pro', team: 'Team' }[next]} includes{' '}
                        {item.unit === 'bytes' ? formatBytes(more) : more.toLocaleString()}.
                    </p>
                )}
            </div>
            {next && (
                <Button type="button" size="1" variant="soft" onClick={onPlans}>
                    See plans
                </Button>
            )}
        </aside>
    );
}
