'use client';

import { useEffect, useRef } from 'react';

/** Name of the window event that sends a pulse across the field (a webhook arrived). */
export const SIGNAL_EVENT = 'socket-help:signal';

const LINES = 26;
const STEP = 6;

// Stacked ridgelines drawn back to front, each one hiding the lines behind it. They drift slowly,
// and a captured request sends a bump along one line, so the art reacts to real traffic.
export function RidgeField() {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context) return;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const styles = getComputedStyle(element);
        const ink = styles.getPropertyValue('--ridge-ink').trim() || '107 220 154';
        const fill = styles.getPropertyValue('--ridge-fill').trim() || '#0b0c0c';
        const seeds = Array.from({ length: LINES }, (_, line) => [
            1.7 + ((line * 7919) % 13) / 9,
            3.1 + ((line * 104729) % 17) / 7,
            ((line * 2654435761) % 1000) / 160,
        ]);
        const pulses: { line: number; start: number }[] = [];
        let width = 0,
            height = 0,
            frame = 0,
            visible = true,
            activeUntil = performance.now() + 10000;

        function resize() {
            const box = element!.getBoundingClientRect();
            const ratio = Math.min(devicePixelRatio, 2);
            width = box.width;
            height = box.height;
            element!.width = Math.round(width * ratio);
            element!.height = Math.round(height * ratio);
            context!.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
        function draw(time: number) {
            const t = still ? 0 : time / 9000;
            context!.clearRect(0, 0, width, height);
            const gap = height / (LINES + 3);
            for (let line = 0; line < LINES; line++) {
                const base = gap * (line + 3);
                const [a, b, phase] = seeds[line]!;
                const depth = line / (LINES - 1);
                context!.beginPath();
                context!.moveTo(0, height);
                for (let x = 0; x <= width + STEP; x += STEP) {
                    const u = x / width;
                    const envelope =
                        Math.exp(-((u - 0.62) ** 2) / 0.05) +
                        0.35 * Math.exp(-((u - 0.18) ** 2) / 0.012);
                    let lift =
                        envelope *
                        (Math.sin(u * a * 9 + phase + t * 2) * 0.5 +
                            Math.sin(u * b * 13 - t * 3 + line) * 0.35 +
                            Math.sin(u * 41 + phase * 3 + t) * 0.15 +
                            0.9);
                    for (const pulse of pulses) {
                        if (pulse.line !== line) continue;
                        const age = (time - pulse.start) / 1600;
                        const center = age * 1.2 - 0.1;
                        lift += 1.4 * (1 - age) * Math.exp(-((u - center) ** 2) / 0.002);
                    }
                    context!.lineTo(x, base - lift * gap * 2.2);
                }
                context!.lineTo(width, height);
                context!.closePath();
                context!.fillStyle = fill;
                context!.fill();
                context!.strokeStyle = `rgb(${ink} / ${0.16 + depth * 0.5})`;
                context!.lineWidth = 1;
                context!.stroke();
            }
            for (let index = pulses.length - 1; index >= 0; index--)
                if (time - pulses[index]!.start > 1600) pulses.splice(index, 1);
        }
        function loop(time: number) {
            draw(time);
            // Drift for the first seconds only, then rest until a request arrives.
            frame = visible && !still && time < activeUntil ? requestAnimationFrame(loop) : 0;
        }
        const onSignal = () => {
            if (still) return;
            pulses.push({
                line: 8 + Math.floor(Math.random() * (LINES - 10)),
                start: performance.now(),
            });
            if (!frame && visible) frame = requestAnimationFrame(loop);
        };
        const sizer = new ResizeObserver(() => {
            resize();
            draw(performance.now());
        });
        const watcher = new IntersectionObserver(([entry]) => {
            visible = !!entry?.isIntersecting;
            if (visible && !frame && !still && performance.now() < activeUntil)
                frame = requestAnimationFrame(loop);
        });
        sizer.observe(element);
        watcher.observe(element);
        addEventListener(SIGNAL_EVENT, onSignal);
        return () => {
            cancelAnimationFrame(frame);
            sizer.disconnect();
            watcher.disconnect();
            removeEventListener(SIGNAL_EVENT, onSignal);
        };
    }, []);
    return <canvas ref={canvas} className="home-ridges" aria-hidden="true" />;
}
