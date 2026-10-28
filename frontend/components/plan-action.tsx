'use client';

import Link from 'next/link';
import { useViewer } from '../lib/viewer';
import { Icon } from './icons';

type PlanId = 'anonymous' | 'free' | 'pro' | 'team';
const rank: Record<PlanId, number> = { anonymous: 0, free: 1, pro: 2, team: 3 };

/** The call to action on a pricing card, adjusted to the plan the viewer already has. */
export function PlanAction({
    id,
    name,
    checkoutOpen,
}: {
    id: PlanId;
    name: string;
    checkoutOpen: boolean;
}) {
    const viewer = useViewer();
    const paid = id === 'pro' || id === 'team';
    if (viewer.status === 'user') {
        const current = viewer.plan as PlanId;
        if (current === id)
            return (
                <button className="button button-secondary plan-current" disabled>
                    <Icon name="check" size={15} />
                    {paid ? 'Subscribed' : 'Current plan'}
                </button>
            );
        if (id === 'anonymous')
            return (
                <Link className="button button-secondary" href="/catalog/">
                    Use the tools
                </Link>
            );
        if (rank[id] < rank[current])
            return (
                <button className="button button-secondary" disabled>
                    Included in your plan
                </button>
            );
        if (paid && !checkoutOpen)
            return (
                <button className="button button-secondary" disabled>
                    Not available during beta
                </button>
            );
        if (!viewer.owner)
            return (
                <button className="button button-secondary" disabled>
                    Ask your workspace owner
                </button>
            );
        // Paid subscribers change plans in the billing portal, not through a second checkout.
        return (
            <Link className="button button-primary" href="/account/#billing">
                {current === 'pro' || current === 'team'
                    ? `Switch to ${name}`
                    : `Upgrade to ${name}`}
            </Link>
        );
    }
    if (paid && !checkoutOpen)
        return (
            <button className="button button-secondary" disabled>
                Not available during beta
            </button>
        );
    return (
        <Link
            className={`button ${id === 'free' ? 'button-primary' : 'button-secondary'}`}
            href={id === 'anonymous' ? '/catalog/' : '/account/'}
        >
            {id === 'anonymous'
                ? 'Use the tools'
                : id === 'free'
                  ? 'Create free account'
                  : `Upgrade to ${name}`}
        </Link>
    );
}

/** "Your plan" marker for the card that matches the signed-in viewer; guests see the fallback. */
export function PlanBadge({ id, fallback }: { id: PlanId; fallback?: React.ReactNode }) {
    const viewer = useViewer();
    if (viewer.status !== 'user') return fallback ?? null;
    return viewer.plan === id ? <span className="content-tag plan-yours">Your plan</span> : null;
}
