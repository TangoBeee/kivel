'use client';

import { useEffect, useState } from 'react';

export function SpaceTimer({ start }: { start: number }) {
    const [left, setLeft] = useState(start);
    useEffect(() => {
        const timer = setInterval(() => setLeft((value) => (value > 0 ? value - 1 : start)), 1000);
        return () => clearInterval(timer);
    }, [start]);
    const minutes = String(Math.floor(left / 60)).padStart(2, '0');
    const seconds = String(left % 60).padStart(2, '0');
    return (
        <time aria-label="Time until this space expires">
            {minutes}:{seconds}
        </time>
    );
}
