'use client';
import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

// Opening something you already made (?resource=…) shows just the tool and your data:
// no guide, no related tools, no footer. Runs before paint, also after in-app navigation.
export function ResourceView() {
    const pathname = usePathname();
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (new URLSearchParams(location.search).has('resource')) root.dataset.view = 'resource';
        return () => {
            delete root.dataset.view;
        };
    }, [pathname]);
    return null;
}
