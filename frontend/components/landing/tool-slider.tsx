'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
    animate,
    motion,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
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

export function ToolSlider({ items }: { items: SliderItem[] }) {
    const mask = useRef<HTMLDivElement>(null);
    const track = useRef<HTMLDivElement>(null);
    const still = useReducedMotion();
    const x = useMotionValue(0);
    const [min, setMin] = useState(0);
    const [index, setIndex] = useState(0);
    const dragged = useRef(false);

    // Card start positions and how far left the track may go before the last card would leave the edge.
    const stops = useCallback(() => {
        const children = [...(track.current?.children ?? [])] as HTMLElement[];
        return children.map((child) => child.offsetLeft);
    }, []);
    useEffect(() => {
        const measure = () => {
            if (!track.current || !mask.current) return;
            // Cards run past the content column to the screen edge, so the track stops when the
            // last card meets that edge (less an 18px gutter), never leaving an empty strip.
            const visible =
                document.documentElement.clientWidth -
                mask.current.getBoundingClientRect().left -
                18;
            const limit = Math.min(0, visible - track.current.scrollWidth);
            setMin(limit);
            if (x.get() < limit) x.set(limit);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (mask.current) observer.observe(mask.current);
        // On wide screens the column keeps its width while the window changes, so watch both.
        addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            removeEventListener('resize', measure);
        };
    }, [items.length, x]);

    // The card nearest the left edge is the active one.
    useMotionValueEvent(x, 'change', (value) => {
        const positions = stops();
        let nearest = 0;
        positions.forEach((position, i) => {
            if (Math.abs(position + value) < Math.abs(positions[nearest]! + value)) nearest = i;
        });
        if (value <= min + 1) nearest = positions.length - 1;
        setIndex(nearest);
    });

    const clamp = useCallback((value: number) => Math.max(min, Math.min(0, value)), [min]);
    const glide = useCallback(
        (target: number) =>
            animate(
                x,
                clamp(target),
                still ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 30 },
            ),
        [x, clamp, still],
    );
    const go = (step: number) => {
        const positions = stops();
        const next = Math.max(0, Math.min(positions.length - 1, index + step));
        glide(-positions[next]!);
    };

    // Trackpads: a sideways swipe moves the track; vertical scrolling still scrolls the page.
    useEffect(() => {
        const element = mask.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
            event.preventDefault();
            x.set(clamp(x.get() - event.deltaX));
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [x, clamp]);

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
                {/* The cards fade in together when the row comes into view. The trigger sits on this
                    fixed container: revealing cards one by one left off-screen ones invisible while
                    dragging, and the wide, moving track itself never counts as in view. */}
                <motion.div
                    ref={mask}
                    className="kv-slider-mask"
                    initial={still ? false : 'hidden'}
                    whileInView="shown"
                    viewport={{ once: true, amount: 0.2 }}
                    variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
                >
                    <motion.div
                        ref={track}
                        className="kv-slider-track"
                        style={{ x }}
                        drag="x"
                        dragConstraints={{ left: min, right: 0 }}
                        dragElastic={0.04}
                        dragTransition={{
                            power: 0.25,
                            timeConstant: 260,
                            bounceStiffness: 400,
                            bounceDamping: 40,
                        }}
                        onDragStart={() => (dragged.current = true)}
                        onDragEnd={() => setTimeout(() => (dragged.current = false), 0)}
                        onClickCapture={(event) => {
                            // A drag that ends over a card should not open it.
                            if (dragged.current) event.preventDefault();
                        }}
                    >
                        {items.map((item, position) => {
                            const Icon = icons[item.id] ?? Code;
                            return (
                                <motion.div
                                    key={item.id}
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
                                        draggable={false}
                                        onFocus={(event) => {
                                            // Keyboard users: bring a focused card fully into view.
                                            const card = event.currentTarget.parentElement!;
                                            const left = card.offsetLeft + x.get();
                                            const right = left + card.offsetWidth;
                                            const width = mask.current?.offsetWidth ?? 0;
                                            if (left < 0 || right > width) glide(-card.offsetLeft);
                                        }}
                                        className={`kv-slide ${position === index ? 'is-active' : ''}`}
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
                        })}
                    </motion.div>
                </motion.div>
                <div className="kv-slider-arrows">
                    <button
                        type="button"
                        aria-label="Previous categories"
                        disabled={index === 0}
                        onClick={() => go(-1)}
                    >
                        <CaretLeft size={18} weight="bold" />
                    </button>
                    <button
                        type="button"
                        aria-label="Next categories"
                        disabled={index >= items.length - 1 || min === 0}
                        onClick={() => go(1)}
                    >
                        <CaretRight size={18} weight="bold" />
                    </button>
                </div>
                <hr className="kv-divider" />
            </div>
        </section>
    );
}
