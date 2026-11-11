import Link from 'next/link';
import { appLink } from '../lib/app-routes';

type PlanId = 'anonymous' | 'free' | 'pro' | 'team';

export function PlanAction({
    id,
    name,
    checkoutOpen,
}: {
    id: PlanId;
    name: string;
    checkoutOpen: boolean;
}) {
    const paid = id === 'pro' || id === 'team';
    if (paid && !checkoutOpen)
        return (
            <button className="button button-secondary" disabled>
                Not available during beta
            </button>
        );
    return (
        <Link
            className={`button ${id === 'free' ? 'button-primary' : 'button-secondary'}`}
            href={
                id === 'anonymous'
                    ? '/catalog/'
                    : appLink(paid ? '/usage/?tab=billing' : '/signup/')
            }
            data-upgrade={paid ? '' : undefined}
        >
            {id === 'anonymous'
                ? 'Use the tools'
                : id === 'free'
                  ? 'Create free account'
                  : `Upgrade to ${name}`}
        </Link>
    );
}
