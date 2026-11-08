'use client';

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
    motion,
    useMotionValue,
    useReducedMotion,
    useSpring,
    useTransform,
    type MotionValue,
} from 'motion/react';
import {
    Brain,
    EnvelopeSimple,
    Heartbeat,
    Key,
    Plugs,
    Plus,
    WebhooksLogo,
} from '@phosphor-icons/react';
import { LogoMark } from '../logo';
import { Reveal, outExpo } from './reveal';

const orbit = [
    { Icon: EnvelopeSimple, x: -45, y: -77, depth: 0.5 },
    { Icon: WebhooksLogo, x: 45, y: -77, depth: 0.8 },
    { Icon: Key, x: -89, y: 0, depth: 1.1 },
    { Icon: Plugs, x: 89, y: 0, depth: 0.7 },
    { Icon: Heartbeat, x: -45, y: 77, depth: 1.3 },
    { Icon: Brain, x: 45, y: 77, depth: 0.9 },
];

/** Pointer position inside a card, from -1 to 1 on each axis, springy like Webflow's smoothing. */
function usePointer() {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const still = useReducedMotion();
    const move = (event: ReactPointerEvent<HTMLElement>) => {
        if (still) return;
        const box = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - box.left) / box.width) * 2 - 1);
        y.set(((event.clientY - box.top) / box.height) * 2 - 1);
    };
    const leave = () => {
        x.set(0);
        y.set(0);
    };
    return {
        x: useSpring(x, { stiffness: 80, damping: 18 }),
        y: useSpring(y, { stiffness: 80, damping: 18 }),
        handlers: { onPointerMove: move, onPointerLeave: leave },
    };
}

function Satellite({
    item,
    px,
    py,
}: {
    item: (typeof orbit)[number];
    px: MotionValue<number>;
    py: MotionValue<number>;
}) {
    const x = useTransform(px, (v) => item.x * 1.3 + v * 14 * item.depth);
    const y = useTransform(py, (v) => item.y * 1.3 + v * 14 * item.depth);
    return (
        <motion.span className="kv-orbit-dot" style={{ x, y }}>
            <item.Icon size={26} weight="duotone" />
        </motion.span>
    );
}

function OrbitCard() {
    const { x, y, handlers } = usePointer();
    const coreX = useTransform(x, (v) => v * 6);
    const coreY = useTransform(y, (v) => v * 6);
    return (
        <article className="kv-grid-card" {...handlers}>
            <div className="kv-grid-card-glow" />
            <div className="kv-grid-art kv-orbit">
                <svg className="kv-orbit-lines" viewBox="-200 -150 400 300" aria-hidden="true">
                    <circle r="150" />
                    <circle r="230" />
                    {orbit.map((item) => (
                        <line
                            key={item.x + ':' + item.y}
                            x1="0"
                            y1="0"
                            x2={item.x * 1.3}
                            y2={item.y * 1.3}
                        />
                    ))}
                </svg>
                {orbit.map((item) => (
                    <Satellite key={item.x + ':' + item.y} item={item} px={x} py={y} />
                ))}
                <motion.span className="kv-orbit-core" style={{ x: coreX, y: coreY }}>
                    <LogoMark size={30} color="#fff" />
                </motion.span>
            </div>
            <div className="kv-grid-copy">
                <h3>One connection, every tool</h3>
                <p>
                    Inboxes, webhooks, mocks, monitors, memory and authenticators over one MCP
                    server.
                </p>
            </div>
        </article>
    );
}

const nodes = [
    [-150, -60],
    [0, -60],
    [125, -60],
    [-60, 10],
    [0, 40],
    [125, 10],
    [125, 40],
    [-200, 40],
    [-60, 40],
];

function RouteCard() {
    const { x, y, handlers } = usePointer();
    const still = useReducedMotion();
    const tipX = useTransform(x, (v) => v * 40);
    const tipY = useTransform(y, (v) => v * 30);
    return (
        <article className="kv-grid-card" {...handlers}>
            <div className="kv-grid-card-glow" />
            <div className="kv-grid-art kv-route">
                <svg viewBox="-260 -130 520 260" aria-hidden="true">
                    <g className="kv-route-grid">
                        <path d="M-260 -60H260M-260 10H260M-260 40H260M-150 -130V130M0 -130V130M125 -130V130M-60 -130V130" />
                        <path d="M-150 -60 -60 10 0 -60M125 -60 60 0M-60 40 -200 130" />
                    </g>
                    {nodes.map(([cx, cy]) => (
                        <circle
                            key={`${cx}:${cy}`}
                            className="kv-route-node"
                            cx={cx}
                            cy={cy}
                            r="5"
                        />
                    ))}
                    <motion.path
                        className="kv-route-path"
                        d="M-220 120 L-90 10 Q-60 -20 -20 -20 L10 -20"
                        initial={still ? false : { pathLength: 0 }}
                        whileInView={{ pathLength: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.6, ease: outExpo, delay: 0.3 }}
                    />
                    <circle className="kv-route-end" cx="125" cy="-60" r="9" />
                </svg>
                <span className="kv-route-bolt">
                    <WebhooksLogo size={34} weight="fill" />
                </span>
                <motion.span className="kv-route-tip" style={{ x: tipX, y: tipY }}>
                    <span className="kv-pill">
                        Caught in 41 ms
                        <i>
                            <Plus size={12} weight="bold" />
                        </i>
                    </span>
                    <svg className="kv-route-cursor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 3 20 10l-7 2-3 8z" />
                    </svg>
                </motion.span>
            </div>
            <div className="kv-grid-copy">
                <h3>Webhooks caught in milliseconds</h3>
                <p>
                    Every request is saved with its headers and body, ready for your agent to read.
                </p>
            </div>
        </article>
    );
}

export function FeatureCards() {
    return (
        <section className="kv-container kv-grid-section" aria-label="How Kivel connects">
            <Reveal>
                <OrbitCard />
            </Reveal>
            <Reveal delay={0.1}>
                <RouteCard />
            </Reveal>
        </section>
    );
}
