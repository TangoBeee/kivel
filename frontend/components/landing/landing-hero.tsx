'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import {
    motion,
    useMotionValue,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
    type MotionValue,
} from 'motion/react';
import { DashboardMock } from './dashboard-mock';
import { InboxGlyph, KeyGlyph, MockGlyph, WebhookGlyph } from './icons';

// Scroll keyframes as fractions of the hero's trip past the top of the viewport.
const k = { rest: 0.1, gather: 0.3, show: 0.4, spread: 0.5, end: 1 };

function useStage(progress: MotionValue<number>, input: number[], output: number[]) {
    return useTransform(progress, input, output);
}

/** One floating tile. The outer layer follows the scroll, the inner one drifts with the mouse. */
function Tile({
    className,
    progress,
    path,
    mouse,
    blur,
    children,
}: {
    className: string;
    progress: MotionValue<number>;
    path: { x: number[]; y: number[]; rotate: number[] };
    mouse: { x: MotionValue<number>; y: MotionValue<number> };
    blur?: boolean;
    children: ReactNode;
}) {
    const stops = [k.gather, k.spread];
    const x = useStage(progress, stops, path.x);
    const y = useStage(progress, stops, path.y);
    const rotate = useStage(progress, stops, path.rotate);
    const filter = useTransform(
        progress,
        stops,
        blur ? ['blur(0px)', 'blur(4px)'] : ['blur(0px)', 'blur(0px)'],
    );
    return (
        <motion.div className={`kv-hero-tile ${className}`} style={{ x, y, rotate, filter }}>
            <motion.div className="kv-hero-tile-face" style={mouse}>
                {children}
            </motion.div>
        </motion.div>
    );
}

export function LandingHero({ toolTotal }: { toolTotal: number }) {
    const wrap = useRef<HTMLElement>(null);
    const still = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: wrap, offset: ['start start', 'end start'] });
    // Webflow smooths these scroll interactions; a spring gives the same slight lag.
    const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.5 });
    const resting = useMotionValue(0.2);
    const progress = still ? resting : smooth;

    const dashY = useStage(progress, [k.rest, k.show], [0, 202]);
    const dashScale = useStage(progress, [k.rest, k.show], [1, 0.8]);
    const dashBlur = useTransform(progress, [k.rest, k.show], ['blur(0px)', 'blur(8px)']);
    const dashOpacity = useStage(progress, [k.show, k.spread], [1, 0]);
    const iconsY = useStage(progress, [k.rest, k.show, k.end], [0, 760, 810]);
    const textScale = useStage(progress, [k.gather, k.show], [0.8, 1]);
    const textOpacity = useStage(progress, [k.gather, k.show], [0, 1]);
    const textBlur = useTransform(progress, [k.gather, k.show], ['blur(7px)', 'blur(0px)']);
    const glowScaleX = useStage(progress, [k.gather, k.show, k.spread], [0.5, 1, 1.4]);
    const glowScaleY = useStage(progress, [k.gather, k.show, k.spread], [0.3, 1, 0.8]);
    const glowOpacity = useStage(progress, [k.gather, k.show, k.spread], [0, 0.4, 0.27]);

    // Mouse parallax: ±30px, half the tiles move against the pointer.
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const sx = useSpring(mx, { stiffness: 60, damping: 18 });
    const sy = useSpring(my, { stiffness: 60, damping: 18 });
    const against = { x: useTransform(sx, (v) => -v), y: useTransform(sy, (v) => -v) };
    const along = { x: sx, y: sy };
    useEffect(() => {
        if (still || !matchMedia('(pointer: fine)').matches) return;
        const move = (event: PointerEvent) => {
            mx.set((event.clientX / innerWidth - 0.5) * -60);
            my.set((event.clientY / innerHeight - 0.5) * -60);
        };
        addEventListener('pointermove', move, { passive: true });
        return () => removeEventListener('pointermove', move);
    }, [still, mx, my]);

    return (
        <section ref={wrap} className="kv-hero" aria-labelledby="hero-heading">
            <div className="kv-container kv-hero-top">
                <h1 id="hero-heading" className="kv-hero-title kv-load-2">
                    Plug in
                    <br />
                    your agent
                </h1>
                <div className="kv-hero-side kv-load-3">
                    <p>
                        Email inboxes, webhook URLs, mock APIs and {toolTotal} tools for Claude
                        Code, Cursor and Codex. One MCP connection. Free to start.
                    </p>
                    <div className="kv-buttons">
                        <Link href="/account/#register" className="kv-button">
                            Get started
                        </Link>
                        <Link href="/docs/" className="kv-button is-outline">
                            Read the docs
                        </Link>
                    </div>
                </div>
            </div>

            <div className="kv-container kv-hero-stage">
                <div className="kv-blue-blur kv-load-glow" />
                <motion.div
                    className="kv-hero-dash kv-load-4"
                    style={{ y: dashY, scale: dashScale, filter: dashBlur, opacity: dashOpacity }}
                >
                    <DashboardMock />
                </motion.div>
                <motion.div className="kv-hero-icons" style={{ y: iconsY }}>
                    <Tile
                        className="is-01"
                        progress={progress}
                        mouse={along}
                        path={{ x: [0, 118], y: [0, 118], rotate: [0, 29] }}
                    >
                        <InboxGlyph />
                    </Tile>
                    <Tile
                        className="is-02 kv-load-tile"
                        progress={progress}
                        mouse={against}
                        path={{ x: [57, 73], y: [-179, -88], rotate: [0, -23] }}
                    >
                        <WebhookGlyph />
                    </Tile>
                    <Tile
                        className="is-03 kv-load-tile"
                        progress={progress}
                        mouse={along}
                        blur
                        path={{ x: [0, -65], y: [-164, -65], rotate: [0, 37] }}
                    >
                        <KeyGlyph />
                    </Tile>
                    <Tile
                        className="is-04"
                        progress={progress}
                        mouse={against}
                        path={{ x: [0, -27], y: [0, 225], rotate: [0, -29] }}
                    >
                        <MockGlyph />
                    </Tile>
                </motion.div>
            </div>

            <div className="kv-container kv-hero-statement">
                <motion.div
                    className="kv-blue-blur is-02"
                    style={{ scaleX: glowScaleX, scaleY: glowScaleY, opacity: glowOpacity }}
                />
                <motion.p
                    className="kv-title kv-statement"
                    style={{ scale: textScale, opacity: textOpacity, filter: textBlur }}
                >
                    Your agent can write the code. Kivel lets it sign up, read the email, catch the
                    webhook and pass the 2FA check, all over one MCP connection.
                </motion.p>
            </div>
        </section>
    );
}
