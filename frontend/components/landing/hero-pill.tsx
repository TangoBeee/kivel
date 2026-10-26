'use client';

import Link from 'next/link';
import { Icon } from '../icons';
import { useViewer } from '../../lib/viewer';

// Same pill, same size: catalog stats for visitors, a way back to the workspace for signed in users.
export function HeroPill({ stats }: { stats: string }) {
    const viewer = useViewer();
    if (viewer.status === 'user')
        return (
            <Link href="/account/" className="lp-pill lp-pill-link">
                <span className="lp-pill-dot" />
                Welcome back, {viewer.username} · Open your dashboard
                <Icon name="arrow" size={14} />
            </Link>
        );
    return (
        <span className="lp-pill">
            <span className="lp-pill-dot" />
            {stats}
        </span>
    );
}
