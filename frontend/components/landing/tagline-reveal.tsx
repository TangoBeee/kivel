'use client';

import { useEffect, useRef } from 'react';

// Each word lights up as it crosses a trigger line 40% above the bottom of the viewport.
export function TaglineReveal({ lines }: { lines: string[] }) {
    const ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        const words = Array.from(ref.current?.querySelectorAll<HTMLElement>('.lp-word') ?? []);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            words.forEach((word) => word.classList.add('is-active'));
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                const activated: HTMLElement[] = [];
                for (const entry of entries) {
                    const word = entry.target as HTMLElement;
                    const top = entry.rootBounds?.top ?? 0;
                    const active = entry.isIntersecting || entry.boundingClientRect.top < top;
                    if (active && !word.classList.contains('is-active')) activated.push(word);
                    if (!active) {
                        word.style.transitionDelay = '0ms';
                        word.classList.remove('is-active');
                    }
                }
                // Words that cross the line together still light up one at a time, in reading order.
                activated
                    .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
                    .forEach((word, order) => {
                        word.style.transitionDelay = `${order * 80}ms`;
                        word.classList.add('is-active');
                    });
            },
            { rootMargin: '0px 0px -40% 0px' },
        );
        words.forEach((word) => observer.observe(word));
        return () => observer.disconnect();
    }, []);
    let index = 0;
    return (
        <h2 ref={ref} className="lp-tagline">
            {lines.map((line) => (
                <span key={line} className="lp-tagline-line">
                    {line.split(' ').map((word) => {
                        const position = index++;
                        return (
                            <span key={position} className="lp-word" data-index={position}>
                                {word}{' '}
                            </span>
                        );
                    })}
                </span>
            ))}
        </h2>
    );
}
