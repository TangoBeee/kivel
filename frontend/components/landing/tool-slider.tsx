'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
    animate,
    motion,
    useAnimationFrame,
    useInView,
    useMotionValue,
    useReducedMotion,
    useTransform,
    type AnimationPlaybackControls,
} from 'motion/react';
import {
    CaretLeft,
    CaretRight,
    Code,
    Database,
    EnvelopeSimple,
    FilmStrip,
    FolderSimple,
    Globe,
    Heartbeat,
    ImageSquare,
    LinkSimple,
    Plugs,
    Robot,
    Timer,
    type IconProps,
} from '@phosphor-icons/react';
import { Reveal, outExpo } from './reveal';

const icons: Record<string, ComponentType<IconProps>> = {
    network: Globe,
    'mock-apis': Plugs,
    agents: Robot,
    files: FolderSimple,
    everyday: ImageSquare,
    email: EnvelopeSimple,
    domains: LinkSimple,
    monitoring: Heartbeat,
    databases: Database,
    'test-media': FilmStrip,
    developer: Code,
    automation: Timer,
};

export interface SliderItem {
    id: string;
    name: string;
    description: string;
    count: number;
    href: string;
}

const GAP = 30;
const DRIFT = 22; // px per second while nobody is touching the row

export function ToolSlider({ items }: { items: SliderItem[] }) {
    const mask = useRef<HTMLDivElement>(null);
    const firstSet = useRef<HTMLDivElement>(null);
    const still = useReducedMotion();
    const inView = useInView(mask, { margin: '200px 0px' });
    // `offset` grows without limit as people drag; the track shows it wrapped into one set's width,
    // with a second copy of the cards right behind, so the row never runs out in either direction.
    const offset = useMotionValue(0);
    const [setWidth, setSetWidth] = useState(0);
    const x = useTransform(offset, (value) =>
        setWidth ? -(((-value % setWidth) + setWidth) % setWidth) : 0,
    );
    const [step, setStep] = useState(300);
    const held = useRef(false);
    const hovered = useRef(false);
    const moved = useRef(false);
    const glide = useRef<AnimationPlaybackControls | null>(null);

    useEffect(() => {
        const measure = () => {
            const set = firstSet.current;
            if (!set) return;
            setSetWidth(set.offsetWidth + GAP);
            const card = set.firstElementChild as HTMLElement | null;
            if (card) setStep(card.offsetWidth + GAP);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (firstSet.current) observer.observe(firstSet.current);
        return () => observer.disconnect();
    }, [items.length]);

    // A slow drift, paused while dragging, hovering, gliding, off screen or with reduced motion.
    useAnimationFrame((_, delta) => {
        if (still || !inView || held.current || hovered.current || glide.current) return;
        offset.set(offset.get() - (DRIFT * Math.min(delta, 64)) / 1000);
    });

    const settle = (to: number, velocity = 0) => {
        glide.current?.stop();
        glide.current = animate(
            offset,
            to,
            still
                ? { duration: 0, onComplete: () => (glide.current = null) }
                : {
                      type: 'spring',
                      stiffness: 170,
                      damping: 30,
                      velocity,
                      onComplete: () => (glide.current = null),
                  },
        );
    };
    // Arrows move exactly one card and snap to card edges.
    const go = (direction: number) => {
        const target = Math.round(offset.get() / step) * step - direction * step;
        settle(target);
    };

    // Trackpads: a sideways swipe moves the row; vertical scrolling still scrolls the page.
    useEffect(() => {
        const element = mask.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
            event.preventDefault();
            glide.current?.stop();
            glide.current = null;
            offset.set(offset.get() - event.deltaX);
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [offset]);

    const cards = (copy: number) =>
        items.map((item) => {
            const Icon = icons[item.id] ?? Code;
            const hidden = copy > 0;
            return (
                <motion.div
                    key={`${copy}-${item.id}`}
                    className="kv-slide-slot"
                    variants={{
                        hidden: { opacity: 0, y: 60, filter: 'blur(15px)' },
                        shown: {
                            opacity: 1,
                            y: 0,
                            filter: 'blur(0px)',
                            transition: { duration: 1.4, ease: outExpo },
                        },
                    }}
                >
                    <Link
                        href={item.href}
                        className="kv-slide"
                        draggable={false}
                        // The second copy is only there to close the loop; keep it out of the
                        // keyboard order and away from screen readers.
                        tabIndex={hidden ? -1 : undefined}
                        aria-hidden={hidden || undefined}
                        onFocus={(event) => {
                            const card = event.currentTarget.parentElement!;
                            const left = card.offsetLeft + x.get();
                            const width = mask.current?.offsetWidth ?? 0;
                            if (left < 0 || left + card.offsetWidth > width)
                                settle(offset.get() - left);
                        }}
                    >
                        <span className="kv-slide-glow" aria-hidden="true" />
                        <span className="kv-slide-icon" aria-hidden="true">
                            <Icon size={20} weight="duotone" />
                        </span>
                        <strong>{item.name}</strong>
                        <span className="kv-slide-text">{item.description}</span>
                        <span className="kv-slide-count">{item.count} tools</span>
                    </Link>
                </motion.div>
            );
        });

    return (
        <section className="kv-slider-section" aria-labelledby="slider-heading">
            <Reveal className="kv-container kv-center">
                <h2 id="slider-heading" className="kv-title kv-slider-title">
                    Everything your agent needs.
                    <br />
                    <span>Whatever it is building.</span>
                </h2>
            </Reveal>
            <div className="kv-container">
                {/* The cards fade in together when the row comes into view. */}
                <motion.div
                    ref={mask}
                    className="kv-slider-mask"
                    initial={still ? false : 'hidden'}
                    whileInView="shown"
                    viewport={{ once: true, amount: 0.2 }}
                    variants={{ shown: { transition: { staggerChildren: 0.06 } } }}
                    onPointerEnter={(event) => {
                        if (event.pointerType === 'mouse') hovered.current = true;
                    }}
                    onPointerLeave={() => (hovered.current = false)}
                >
                    <motion.div
                        className="kv-slider-track"
                        style={{ x }}
                        onPanStart={() => {
                            held.current = true;
                            moved.current = true;
                            glide.current?.stop();
                            glide.current = null;
                        }}
                        onPan={(_, info) => offset.set(offset.get() + info.delta.x)}
                        onPanEnd={(_, info) => {
                            held.current = false;
                            // Carry the flick's speed, then come to rest on a card edge.
                            const projected = offset.get() + info.velocity.x * 0.35;
                            settle(Math.round(projected / step) * step, info.velocity.x);
                            setTimeout(() => (moved.current = false), 0);
                        }}
                        onPointerDown={() => (moved.current = false)}
                        onClickCapture={(event) => {
                            // A drag that ends over a card should not open it.
                            if (moved.current) event.preventDefault();
                        }}
                    >
                        <div ref={firstSet} className="kv-slider-set">
                            {cards(0)}
                        </div>
                        <div className="kv-slider-set">{cards(1)}</div>
                    </motion.div>
                </motion.div>
                <div className="kv-slider-arrows">
                    <button type="button" aria-label="Previous categories" onClick={() => go(-1)}>
                        <CaretLeft size={18} weight="bold" />
                    </button>
                    <button type="button" aria-label="Next categories" onClick={() => go(1)}>
                        <CaretRight size={18} weight="bold" />
                    </button>
                </div>
                <hr className="kv-divider" />
            </div>
        </section>
    );
}
