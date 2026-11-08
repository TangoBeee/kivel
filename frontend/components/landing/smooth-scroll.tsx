'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/** Eased wheel scrolling on the landing page only. Touch scrolling and reduced motion stay native. */
export function SmoothScroll() {
    useEffect(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        let frame = requestAnimationFrame(function loop(time) {
            lenis.raf(time);
            frame = requestAnimationFrame(loop);
        });
        return () => {
            cancelAnimationFrame(frame);
            lenis.destroy();
        };
    }, []);
    return null;
}
