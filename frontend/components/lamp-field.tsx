'use client';

import { useEffect, useRef } from 'react';

/** Window event that lights a run of lamps, as when a real request arrives. */
export const SIGNAL_EVENT = 'socket-help:signal';

interface Lamp {
    x: number;
    y: number;
    start: number;
    life: number;
}

/**
 * Switchboard lamps: small signal lights that glow and fade like incoming calls.
 * `region` is the normalized area of the art where lamps may appear; with `cover`, it is measured
 * on that image as laid out with object-fit: cover, so lamps stay on the board at any viewport.
 * `grid` draws the faint jack field itself, for pages without a photograph behind them.
 */
export function LampField({
    region = [0, 0, 1, 1],
    cover,
    grid = false,
    spacing = 22,
    every = 260,
    className = '',
}: {
    region?: [number, number, number, number];
    cover?: { width: number; height: number };
    grid?: boolean;
    spacing?: number;
    every?: number;
    className?: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context) return;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lamps: Lamp[] = [];
        let width = 0,
            height = 0,
            area = { x: 0, y: 0, w: 0, h: 0 },
            frame = 0,
            visible = false,
            last = 0;

        function measure() {
            const box = element!.getBoundingClientRect();
            const ratio = Math.min(devicePixelRatio, 2);
            width = box.width;
            height = box.height;
            element!.width = Math.round(width * ratio);
            element!.height = Math.round(height * ratio);
            context!.setTransform(ratio, 0, 0, ratio, 0, 0);
            // Map the region from image space to the canvas when the art is laid out as a cover.
            let ox = 0,
                oy = 0,
                iw = width,
                ih = height;
            if (cover) {
                const scale = Math.max(width / cover.width, height / cover.height);
                iw = cover.width * scale;
                ih = cover.height * scale;
                ox = (width - iw) / 2;
                oy = (height - ih) / 2;
            }
            area = {
                x: ox + region[0] * iw,
                y: oy + region[1] * ih,
                w: (region[2] - region[0]) * iw,
                h: (region[3] - region[1]) * ih,
            };
        }
        const snap = (value: number, origin: number) =>
            origin + Math.round((value - origin) / spacing) * spacing;
        function light(now: number, x?: number, y?: number) {
            lamps.push({
                x: snap(x ?? area.x + Math.random() * area.w, area.x),
                y: snap(y ?? area.y + Math.random() * area.h, area.y),
                start: now,
                life: 1800 + Math.random() * 2200,
            });
        }
        function draw(now: number) {
            context!.clearRect(0, 0, width, height);
            if (grid) {
                context!.fillStyle = 'rgb(236 237 235 / 0.07)';
                for (let x = snap(area.x, area.x); x <= area.x + area.w; x += spacing)
                    for (let y = snap(area.y, area.y); y <= area.y + area.h; y += spacing) {
                        context!.beginPath();
                        context!.arc(x, y, 1, 0, Math.PI * 2);
                        context!.fill();
                    }
            }
            context!.globalCompositeOperation = 'lighter';
            for (let index = lamps.length - 1; index >= 0; index--) {
                const lamp = lamps[index]!;
                const age = (now - lamp.start) / lamp.life;
                if (age >= 1) {
                    lamps.splice(index, 1);
                    continue;
                }
                // Quick switch-on, slow fade, like a filament.
                const level = age < 0.08 ? age / 0.08 : (1 - age) ** 1.6;
                const glow = context!.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 12);
                glow.addColorStop(0, `rgb(150 240 185 / ${0.55 * level})`);
                glow.addColorStop(1, 'rgb(107 220 154 / 0)');
                context!.fillStyle = glow;
                context!.fillRect(lamp.x - 12, lamp.y - 12, 24, 24);
                context!.fillStyle = `rgb(220 255 232 / ${0.9 * level})`;
                context!.beginPath();
                context!.arc(lamp.x, lamp.y, 1.6, 0, Math.PI * 2);
                context!.fill();
            }
            context!.globalCompositeOperation = 'source-over';
        }
        function loop(now: number) {
            if (now - last > every) {
                last = now;
                light(now);
            }
            draw(now);
            frame = visible ? requestAnimationFrame(loop) : 0;
        }
        function start() {
            if (!frame && visible && !still) frame = requestAnimationFrame(loop);
        }
        const onSignal = () => {
            if (still) return;
            // A call comes in: a short run of lamps along one row.
            const now = performance.now();
            const y = area.y + Math.random() * area.h;
            const x0 = area.x + Math.random() * area.w * 0.5;
            for (let step = 0; step < 10; step++) {
                const lamp = { x: snap(x0 + step * spacing, area.x), y: snap(y, area.y) };
                lamps.push({ ...lamp, start: now + step * 45, life: 2600 });
            }
            start();
        };
        const sizer = new ResizeObserver(() => {
            measure();
            if (still) {
                const now = performance.now();
                lamps.length = 0;
                for (let count = 0; count < 14; count++) light(now - 300);
            }
            draw(performance.now());
        });
        const watcher = new IntersectionObserver(([entry]) => {
            visible = !!entry?.isIntersecting;
            if (visible) start();
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
    }, [region, cover, grid, spacing, every]);
    return <canvas ref={canvas} className={`lamp-field ${className}`} aria-hidden="true" />;
}
