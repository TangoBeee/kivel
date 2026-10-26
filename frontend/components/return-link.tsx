'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { readReturn } from '../lib/return-path';
import { recordToolVisit } from '../lib/recent-tools';

/** "Back to dashboard" when this tool was opened from the dashboard; nothing otherwise. */
export function ReturnLink({ toolId }: { toolId?: string }) {
    const pathname = usePathname();
    useEffect(() => {
        if (toolId) recordToolVisit(toolId);
    }, [toolId]);
    const [target, setTarget] = useState<{ back: string; label: string } | null>(null);
    useEffect(() => setTarget(readReturn(pathname)), [pathname]);
    if (!target) return null;
    return (
        <Link href={target.back} className="tool-return">
            <Icon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} />
            {target.label}
        </Link>
    );
}
