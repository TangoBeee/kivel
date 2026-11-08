'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
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
import { Reveal } from './reveal';

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
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(false);
    const dragged = useRef(false);

    // The track may move left until the last card's right edge meets the screen edge (less an
    // 18px gutter). It never moves past either end.
    useEffect(() => {
        const measure = () => {
            if (!track.current || !mask.current) return;
            const visible =
                document.documentElement.clientWidth -
                mask.current.getBoundingClientRect().left -
                18;
            // Measured from the last card itself, not the track's own width, which browsers
            // size differently for a max-content row.
            const cards = track.current.children;
            const first = cards[0] as HTMLElement | undefined;
            const last = cards[cards.length - 1] as HTMLElement | undefined;
            const span = first && last ? last.offsetLeft + last.offsetWidth - first.offsetLeft : 0;
            const limit = Math.min(0, visible - span);
            setMin(limit);
            if (x.get() < limit) x.set(limit);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (mask.current) observer.observe(mask.current);
        if (track.current) observer.observe(track.current);
        addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            removeEventListener('resize', measure);
        };
    }, [items.length, x]);

    useEffect(() => {
        const update = (value: number) => {
            setAtStart(value >= -1);
            setAtEnd(value <= min + 1);
        };
        update(x.get());
        return x.on('change', update);
    }, [x, min]);

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
    // Arrows move to the next or previous card edge.
    const go = (direction: number) => {
        const cards = [...(track.current?.children ?? [])] as HTMLElement[];
        const current = -x.get();
        const edges = cards.map((card) => card.offsetLeft - (cards[0]?.offsetLeft ?? 0));
        const next =
            direction > 0
                ? edges.find((edge) => edge > current + 2)
                : [...edges].reverse().find((edge) => edge < current - 2);
        glide(-(next ?? (direction > 0 ? -min : 0)));
    };

    // Trackpads: a sideways swipe moves the row; vertical scrolling still scrolls the page.
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
                {/* The whole row fades in as one block, so cards that start off screen are never
                    left hidden. */}
                <Reveal>
                    <div ref={mask} className="kv-slider-mask">
                        <motion.div
                            ref={track}
                            className="kv-slider-track"
                            style={{ x }}
                            drag="x"
                            dragConstraints={{ left: min, right: 0 }}
                            dragElastic={0}
                            dragMomentum
                            dragTransition={{
                                power: 0.25,
                                timeConstant: 260,
                                bounceStiffness: 600,
                                bounceDamping: 60,
                            }}
                            onDragStart={() => (dragged.current = true)}
                            onDragEnd={() => setTimeout(() => (dragged.current = false), 0)}
                            onClickCapture={(event) => {
                                // A drag that ends over a card should not open it.
                                if (dragged.current) event.preventDefault();
                            }}
                        >
                            {items.map((item) => {
                                const Icon = icons[item.id] ?? Code;
                                return (
                                    <div key={item.id} className="kv-slide-slot">
                                        <Link
                                            href={item.href}
                                            className="kv-slide"
                                            draggable={false}
                                            onFocus={(event) => {
                                                // Keyboard users: bring a focused card into view.
                                                const card = event.currentTarget.parentElement!;
                                                const first =
                                                    (
                                                        track.current
                                                            ?.firstElementChild as HTMLElement | null
                                                    )?.offsetLeft ?? 0;
                                                const left = card.offsetLeft - first + x.get();
                                                const width = mask.current?.offsetWidth ?? 0;
                                                if (left < 0 || left + card.offsetWidth > width)
                                                    glide(-(card.offsetLeft - first));
                                            }}
                                        >
                                            <span className="kv-slide-glow" aria-hidden="true" />
                                            <span className="kv-slide-icon" aria-hidden="true">
                                                <Icon size={20} weight="duotone" />
                                            </span>
                                            <strong>{item.name}</strong>
                                            <span className="kv-slide-text">
                                                {item.description}
                                            </span>
                                            <span className="kv-slide-count">
                                                {item.count} tools
                                            </span>
                                        </Link>
                                    </div>
                                );
                            })}
                        </motion.div>
                    </div>
                </Reveal>
                <div className="kv-slider-arrows">
                    <button
                        type="button"
                        aria-label="Previous categories"
                        disabled={atStart}
                        onClick={() => go(-1)}
                    >
                        <CaretLeft size={18} weight="bold" />
                    </button>
                    <button
                        type="button"
                        aria-label="Next categories"
                        disabled={atEnd}
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
