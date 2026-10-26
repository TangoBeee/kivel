'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Kbd } from '@radix-ui/themes';
import { Icon } from '../icons';
import { useToolbox } from '../toolbox-provider';
import { catalog, categories, featuredIds, searchTools } from '../../lib/catalog';
import type { CatalogTool } from '../../lib/catalog';
import { useRecentTools } from '../../lib/recent-tools';

const tasks = [
    { text: 'merge two PDFs', query: 'pdf' },
    { text: 'mock an MCP server', query: 'mcp' },
    { text: 'check DNS propagation', query: 'dns' },
    { text: 'spin up a test database', query: 'database' },
    { text: 'compress a video', query: 'video' },
    { text: 'catch a webhook', query: 'webhook' },
];
const demoResults = tasks.map((task) => searchTools(task.query).slice(0, 4));
const popular = featuredIds.map((id) => catalog.find((tool) => tool.id === id)!);
const rows = 4;

function Highlight({ text, query }: { text: string; query: string }) {
    const word = query.trim().split(/\s+/)[0] ?? '';
    const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
    if (at < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, at)}
            <mark>{text.slice(at, at + word.length)}</mark>
            {text.slice(at + word.length)}
        </>
    );
}

// A real search box. While nobody is using it, it types example tasks to show what it can find.
export function CommandBar({ total }: { total: number }) {
    const router = useRouter();
    const { previewTool } = useToolbox();
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const recent = useRecentTools();
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(0);
    const [index, setIndex] = useState(0);
    const [typed, setTyped] = useState(tasks[0]!.text.length);
    const [deleting, setDeleting] = useState(false);
    const demo = !focused && query === '';
    const task = tasks[index]!;
    const complete = typed === task.text.length && !deleting;

    useEffect(() => {
        if (!demo) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const timer = setTimeout(() => {
                const next = (index + 1) % tasks.length;
                setIndex(next);
                setTyped(tasks[next]!.text.length);
            }, 3200);
            return () => clearTimeout(timer);
        }
        const timer = setTimeout(
            () => {
                if (complete) setDeleting(true);
                else if (deleting && typed > 0) setTyped(typed - 1);
                else if (deleting) {
                    setDeleting(false);
                    setIndex((index + 1) % tasks.length);
                } else setTyped(typed + 1);
            },
            complete ? 2600 : deleting ? 24 : 64,
        );
        return () => clearTimeout(timer);
    }, [demo, complete, deleting, typed, index]);

    const matches = query.trim() ? searchTools(query) : [];
    const suggestions = recent.length ? recent.slice(0, rows) : popular;
    const results: CatalogTool[] = demo
        ? demoResults[index]!
        : query.trim()
          ? matches.slice(0, rows)
          : suggestions;
    const shown = demo ? complete : true;

    function open(tool: CatalogTool | undefined) {
        if (!tool) return;
        if (tool.href) router.push(tool.href);
        else previewTool(tool);
    }
    function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((value) => (value + step + results.length) % Math.max(results.length, 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            open(results[active]);
        } else if (event.key === 'Escape') {
            if (query) setQuery('');
            else input.current?.blur();
        }
    }

    return (
        <div className={`lp-command ${focused ? 'is-focused' : ''}`}>
            <div className="lp-command-bar" onClick={() => input.current?.focus()}>
                <Icon name="search" size={20} />
                <label htmlFor={`${id}-input`} className="lp-sr-only">
                    Search {total} tools
                </label>
                <input
                    ref={input}
                    id={`${id}-input`}
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={!demo}
                    aria-controls={`${id}-results`}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        !demo && results[active] ? `${id}-option-${active}` : undefined
                    }
                    placeholder={focused ? `Search ${total} tools` : ''}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActive(0);
                    }}
                    onFocus={() => {
                        setFocused(true);
                        setActive(0);
                    }}
                    onBlur={() => setFocused(false)}
                    onKeyDown={onKey}
                />
                {demo && (
                    <span className="lp-command-demo" aria-hidden="true">
                        {task.text.slice(0, typed)}
                        <span className="lp-caret" />
                    </span>
                )}
                {!demo && results.length > 0 ? (
                    <Kbd>Enter</Kbd>
                ) : (
                    demo && <span className="lp-command-hint">Try it</span>
                )}
            </div>
            <div className="lp-command-label" aria-hidden="true">
                {demo
                    ? 'Example search'
                    : query.trim()
                      ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
                      : recent.length
                        ? 'Recently used'
                        : 'Popular tools'}
            </div>
            <ul
                id={`${id}-results`}
                role="listbox"
                aria-label="Matching tools"
                aria-hidden={demo}
                className={`lp-command-results ${shown ? 'is-shown' : ''}`}
            >
                {results.map((tool, position) => (
                    <li
                        key={tool.id}
                        id={`${id}-option-${position}`}
                        role="option"
                        aria-selected={!demo && position === active}
                        className={!demo && position === active ? 'is-active' : ''}
                        onMouseEnter={() => !demo && setActive(position)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => open(tool)}
                    >
                        <span className="lp-command-icon">
                            <Icon name={tool.icon} size={16} />
                        </span>
                        <span className="lp-command-name">
                            <Highlight text={tool.name} query={demo ? task.query : query} />
                        </span>
                        <span className="lp-command-category">
                            {categories.find((category) => category.id === tool.categoryId)?.name}
                        </span>
                    </li>
                ))}
                {!demo && query.trim() && results.length === 0 && (
                    <li className="lp-command-empty" role="presentation">
                        No tool matches “{query.trim()}”. Try pdf, dns, or mock.
                    </li>
                )}
            </ul>
        </div>
    );
}
