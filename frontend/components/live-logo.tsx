'use client';

import { useEffect, useRef, useState } from 'react';

/** Window event that makes every logo smile for a moment (sent by upgrade buttons). */
export const HAPPY_EVENT = 'kivel:happy';

/**
 * The socket mark with a little life: its two slots are eyes that follow the pointer, close while
 * someone types a password (CSS in motion.css) and turn into a smile when an upgrade is clicked.
 * The static mark for images stays in logo.tsx.
 */
export function LiveLogo({ size = 28 }: { size?: number }) {
    const svg = useRef<SVGSVGElement>(null);
    const eyes = useRef<SVGGElement>(null);
    const [happy, setHappy] = useState(false);

    useEffect(() => {
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let frame = 0;
        let pointer: { x: number; y: number } | null = null;
        function follow() {
            frame = 0;
            const box = svg.current?.getBoundingClientRect();
            if (!box || !pointer || !eyes.current) return;
            const dx = pointer.x - (box.left + box.width / 2);
            const dy = pointer.y - (box.top + box.height / 2);
            const distance = Math.hypot(dx, dy) || 1;
            // Up to 2.4 units in the 40-unit drawing, easing in over the first 300px of distance.
            const reach = Math.min(1, distance / 300) * 2.4;
            eyes.current.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
        }
        const onMove = (event: PointerEvent) => {
            pointer = { x: event.clientX, y: event.clientY };
            if (!frame) frame = requestAnimationFrame(follow);
        };
        let timer: ReturnType<typeof setTimeout>;
        const onHappy = () => {
            setHappy(true);
            clearTimeout(timer);
            timer = setTimeout(() => setHappy(false), 2400);
        };
        // Any button marked data-upgrade cheers the logo up.
        const onClick = (event: MouseEvent) => {
            if ((event.target as Element).closest?.('[data-upgrade]'))
                dispatchEvent(new Event(HAPPY_EVENT));
        };
        if (!still) addEventListener('pointermove', onMove, { passive: true });
        addEventListener(HAPPY_EVENT, onHappy);
        addEventListener('click', onClick, true);
        return () => {
            removeEventListener('pointermove', onMove);
            removeEventListener(HAPPY_EVENT, onHappy);
            removeEventListener('click', onClick, true);
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, []);

    return (
        <svg
            ref={svg}
            className={`live-logo ${happy ? 'is-happy' : ''}`}
            width={size}
            height={size}
            viewBox="0 0 40 40"
            aria-hidden="true"
        >
            <circle cx="20" cy="20" r="17.5" fill="none" stroke="currentColor" strokeWidth="3.5" />
            <g ref={eyes} className="live-logo-look">
                <g className="live-logo-eyes">
                    <rect
                        x="13.25"
                        y="14.5"
                        width="3.5"
                        height="11"
                        rx="1.75"
                        fill="currentColor"
                    />
                    <rect
                        x="23.25"
                        y="14.5"
                        width="3.5"
                        height="11"
                        rx="1.75"
                        fill="currentColor"
                    />
                </g>
                <g
                    className="live-logo-smile"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                >
                    <path d="M12 22 Q15 16.5 18 22" />
                    <path d="M22 22 Q25 16.5 28 22" />
                </g>
            </g>
        </svg>
    );
}
