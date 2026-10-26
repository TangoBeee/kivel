'use client';

import { useEffect } from 'react';

// Cards listed in theme.css light up under the pointer. One passive listener, throttled to animation frames.
const GLOW_TARGETS =
    '.lp-card, .article-card, .featured-article, .pricing-card, .not-found-tools a, .catalog-tool-row, .comparison-directory > a';

export function PointerGlow() {
    useEffect(() => {
        if (!matchMedia('(hover: hover)').matches) return;
        let frame = 0;
        let last: PointerEvent | null = null;
        const update = () => {
            frame = 0;
            const target = (last?.target as Element | null)?.closest?.(GLOW_TARGETS);
            if (!(target instanceof HTMLElement) || !last) return;
            const box = target.getBoundingClientRect();
            target.style.setProperty('--glow-x', `${last.clientX - box.left}px`);
            target.style.setProperty('--glow-y', `${last.clientY - box.top}px`);
        };
        const onMove = (event: PointerEvent) => {
            last = event;
            if (!frame) frame = requestAnimationFrame(update);
        };
        addEventListener('pointermove', onMove, { passive: true });
        return () => {
            removeEventListener('pointermove', onMove);
            cancelAnimationFrame(frame);
        };
    }, []);
    return null;
}
