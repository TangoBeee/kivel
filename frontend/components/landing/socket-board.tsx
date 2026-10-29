'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { useToolbox } from '../toolbox-provider';
import { catalog, categories, categoryTints as tints } from '../../lib/catalog';
import type { Category, CatalogTool } from '../../lib/catalog';

const board = categories.flatMap((category) =>
    catalog.filter((tool) => tool.categoryId === category.id),
);

// Every tool as one socket on a panel. Sockets light up in a wave the first time the board is seen,
// then a few at a time keep glowing, like a panel that is in use. Light ripples out from the pointer
// or the keyboard focus, and the arrow keys move around the board.
export function SocketBoard({ glyphs }: { glyphs: Record<string, React.ReactNode> }) {
    const router = useRouter();
    const { previewTool } = useToolbox();
    const [category, setCategory] = useState<Category['id'] | 'all'>('all');
    const [hovered, setHovered] = useState<CatalogTool | null>(null);
    const [focusIndex, setFocusIndex] = useState(0);
    const [powered, setPowered] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setPowered(true);
                observer.disconnect();
            },
            { rootMargin: '0px 0px -20% 0px' },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    function columns() {
        const grid = ref.current;
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1;
    }
    function ripple(center: number | null) {
        const sockets = ref.current?.children;
        if (!sockets) return;
        const width = columns();
        Array.from(sockets).forEach((socket, index) => {
            const element = socket as HTMLElement;
            if (center === null) return delete element.dataset.near;
            const distance = Math.max(
                Math.abs((index % width) - (center % width)),
                Math.abs(Math.floor(index / width) - Math.floor(center / width)),
            );
            if (distance > 0 && distance < 3) element.dataset.near = String(distance);
            else delete element.dataset.near;
        });
    }
    function point(index: number) {
        setHovered(board[index]!);
        ripple(index);
    }
    function open(tool: CatalogTool) {
        if (tool.href) router.push(tool.href);
        else previewTool(tool);
    }
    function onKey(event: React.KeyboardEvent, index: number) {
        const width = columns();
        const step = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: width,
            ArrowUp: -width,
            Home: -index,
            End: board.length - 1 - index,
        }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        const next = Math.min(board.length - 1, Math.max(0, index + step));
        setFocusIndex(next);
        (ref.current?.children[next] as HTMLElement | undefined)?.focus();
    }

    const selected = categories.find((entry) => entry.id === category);
    const count = selected
        ? board.filter((tool) => tool.categoryId === category).length
        : board.length;

    return (
        <div className="lp-board-wrap">
            <div className="lp-chips" role="group" aria-label="Filter tools by category">
                <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                    All tools
                </button>
                {categories.map((entry) => (
                    <button
                        key={entry.id}
                        aria-pressed={category === entry.id}
                        onClick={() => setCategory(entry.id)}
                        style={{ '--tint': tints[entry.id] } as React.CSSProperties}
                    >
                        <Icon name={entry.icon} size={14} />
                        {entry.name}
                    </button>
                ))}
            </div>
            <div className="lp-board-frame">
                <div
                    ref={ref}
                    className={`lp-board ${powered ? 'is-powered' : ''} ${selected ? 'is-filtered' : ''}`}
                    role="group"
                    aria-label={`${board.length} tools. Use the arrow keys to move between them.`}
                    onMouseLeave={() => {
                        setHovered(null);
                        ripple(null);
                    }}
                >
                    {board.map((tool, index) => (
                        <button
                            key={tool.id}
                            className={`lp-socket ${tool.categoryId === category ? 'is-match' : ''}`}
                            tabIndex={index === focusIndex ? 0 : -1}
                            aria-label={`${tool.name}: ${tool.description}`}
                            onMouseEnter={() => point(index)}
                            onFocus={() => {
                                setFocusIndex(index);
                                point(index);
                            }}
                            onBlur={() => ripple(null)}
                            onKeyDown={(event) => onKey(event, index)}
                            onClick={() => open(tool)}
                            style={
                                {
                                    '--tint': tints[tool.categoryId],
                                    animationDelay: `${index * 9}ms, ${1600 + ((index * 7919) % 14000)}ms`,
                                } as React.CSSProperties
                            }
                        >
                            {glyphs[tool.id]}
                        </button>
                    ))}
                </div>
                <div className="lp-board-caption" aria-live="polite">
                    {hovered ? (
                        <>
                            <strong>
                                <span
                                    className="lp-caption-dot"
                                    style={{ background: tints[hovered.categoryId] }}
                                />
                                {hovered.name}
                            </strong>
                            <span>{hovered.description}</span>
                        </>
                    ) : (
                        <>
                            <strong>
                                {count} {selected ? selected.name.toLowerCase() : 'tools'}
                            </strong>
                            <span>
                                {selected
                                    ? selected.description
                                    : 'Point at any socket, or use the arrow keys, to see what it does.'}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
