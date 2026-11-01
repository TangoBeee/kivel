'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog, VisuallyHidden } from '@radix-ui/themes';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { catalog, categoryTints, searchTools } from '../lib/catalog';
import { Icon } from './icons';
import { dashboardPanels } from './dashboard-shell';
import type { DashboardPanel } from './dashboard-shell';
import { resourceTool } from './dashboard-resources';
import type { Resource } from './dashboard-resources';

type Result = {
    key: string;
    title: string;
    where: string;
    tint?: string;
    icon?: React.ReactNode;
    go: () => void;
};

/** ⌘K inside the dashboard: your resources, dashboard pages and every tool. */
export function DashboardSearch({
    resources,
    onPanel,
    onResource,
    onTool,
}: {
    resources: Resource[];
    onPanel: (panel: DashboardPanel) => void;
    onResource: (resource: Resource) => void;
    onTool: (toolId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    // Runs before the site-wide tool search, which listens on the same shortcut.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                event.stopImmediatePropagation();
                setOpen(true);
            }
        };
        addEventListener('keydown', onKey, true);
        return () => removeEventListener('keydown', onKey, true);
    }, []);
    const text = query.trim().toLowerCase();
    const close = () => {
        setOpen(false);
        setQuery('');
        setActive(0);
    };
    const results: Result[] = [
        ...resources
            .filter(
                (resource) =>
                    text &&
                    `${resource.name ?? ''} ${resourceTool(resource).name} ${resource.id}`
                        .toLowerCase()
                        .includes(text),
            )
            .slice(0, 5)
            .map((resource) => ({
                key: resource.id,
                title: resource.name ?? resourceTool(resource).name,
                where: resourceTool(resource).name,
                tint: categoryTints[resourceTool(resource).categoryId],
                icon: <Icon name={resourceTool(resource).icon} size={13} />,
                go: () => onResource(resource),
            })),
        ...dashboardPanels
            .filter((panel) => !text || panel.label.toLowerCase().includes(text))
            .slice(0, text ? 4 : 8)
            .map((panel) => ({
                key: panel.id,
                title: panel.label,
                where: 'Go to',
                icon: <panel.icon size={14} />,
                go: () => onPanel(panel.id),
            })),
        ...(text
            ? searchTools(
                  query,
                  catalog.filter((tool) => tool.status === 'available'),
              )
                  .slice(0, 6)
                  .map((tool) => ({
                      key: tool.id,
                      title: tool.name,
                      where: 'Utilities',
                      tint: categoryTints[tool.categoryId],
                      icon: <Icon name={tool.icon} size={13} />,
                      go: () => onTool(tool.id),
                  }))
            : []),
    ];
    const pick = (result?: Result) => {
        if (!result) return;
        close();
        result.go();
    };
    return (
        <>
            <button type="button" className="dashboard-search" onClick={() => setOpen(true)}>
                <MagnifyingGlass size={15} />
                Search everything
                <kbd>⌘K</kbd>
            </button>
            <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
                <Dialog.Content
                    className="dashboard-palette"
                    maxWidth="640px"
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        input.current?.focus();
                    }}
                >
                    <VisuallyHidden>
                        <Dialog.Title>Search</Dialog.Title>
                    </VisuallyHidden>
                    <label className="palette-input">
                        <MagnifyingGlass size={19} />
                        <input
                            ref={input}
                            value={query}
                            placeholder="Search your inboxes, files, pages and tools"
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActive(0);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    setActive((index) => Math.min(results.length - 1, index + 1));
                                } else if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    setActive((index) => Math.max(0, index - 1));
                                } else if (event.key === 'Enter') pick(results[active]);
                            }}
                        />
                    </label>
                    <div className="palette-results" role="listbox">
                        {results.length ? (
                            results.map((result, index) => (
                                <button
                                    key={result.key}
                                    type="button"
                                    role="option"
                                    aria-selected={index === active}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => pick(result)}
                                >
                                    <span
                                        className="nav-chip"
                                        style={
                                            {
                                                '--tint': result.tint ?? '#5b5b5b',
                                            } as React.CSSProperties
                                        }
                                    >
                                        {result.icon}
                                    </span>
                                    <span className="palette-title">{result.title}</span>
                                    <small>{result.where}</small>
                                </button>
                            ))
                        ) : (
                            <p className="utility-empty">Nothing matches “{query.trim()}”.</p>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Root>
        </>
    );
}
