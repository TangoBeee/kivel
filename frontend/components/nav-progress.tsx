'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** A thin bar at the top of the window from the moment a link is clicked until the next page shows. */
export function NavProgress() {
    const pathname = usePathname();
    const [width, setWidth] = useState(0);
    const [visible, setVisible] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        function onClick(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = (event.target as Element).closest?.('a[href]');
            if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || url.pathname === location.pathname) return;
            clearTimeout(timer.current);
            setVisible(true);
            setWidth(20);
            timer.current = setTimeout(() => setWidth(70), 120);
        }
        addEventListener('click', onClick);
        return () => removeEventListener('click', onClick);
    }, []);

    useEffect(() => {
        if (!visible) return;
        clearTimeout(timer.current);
        setWidth(100);
        timer.current = setTimeout(() => {
            setVisible(false);
            setWidth(0);
        }, 450);
        // The bar finishes whenever the route changes.
    }, [pathname]);

    return (
        <div
            className="nav-progress"
            aria-hidden="true"
            style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
        />
    );
}
