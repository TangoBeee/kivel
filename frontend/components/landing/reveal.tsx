'use client';

import { useEffect, useRef, useState } from 'react';

export function Reveal({
    children,
    className = '',
    delay = 0,
}: {
    children: React.ReactNode;
    className?: string;
    delay?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setVisible(true);
                observer.disconnect();
            },
            { rootMargin: '0px 0px -10% 0px' },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return (
        <div
            ref={ref}
            className={`lp-reveal ${visible ? 'is-visible' : ''} ${className}`}
            style={delay ? { transitionDelay: `${delay}ms` } : undefined}
        >
            {children}
        </div>
    );
}
