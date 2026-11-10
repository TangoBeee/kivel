'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function Reveal({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = ref.current;
        if (!node || !('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                node.dataset.entered = '';
                observer.disconnect();
            },
            { threshold: 0.1 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return (
        <div ref={ref} className="landing-reveal">
            {children}
        </div>
    );
}
