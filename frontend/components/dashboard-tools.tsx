'use client';
import Link from 'next/link';
import { useState } from 'react';
import { TextField } from '@radix-ui/themes';
import { MagnifyingGlass, ArrowRight } from '@phosphor-icons/react';
import { catalog, categories, categoryTints, searchTools, toolPageHref } from '../lib/catalog';
import { Icon } from './icons';
import { quickCreate } from './dashboard-shell';
import { clearRecentTools, useRecentTools } from '../lib/recent-tools';
import { useSavedTools } from '../lib/saved-tools';
import { SaveToolButton } from './save-tool-button';

export function SavedTools() {
    const { tools } = useSavedTools();
    if (!tools.length) return null;
    return (
        <section className="dashboard-block" aria-labelledby="saved-tools-title">
            <div className="dashboard-block-head">
                <h2 id="saved-tools-title" className="dashboard-block-title">
                    Saved tools
                </h2>
                <span className="small muted">Saved in this browser</span>
            </div>
            <div className="recent-tools">
                {tools.map((tool) => (
                    <span className="saved-tool-chip" key={tool.id}>
                        <Link
                            href={toolPageHref(tool)}
                            className="recent-tool"
                            style={
                                { '--tint': categoryTints[tool.categoryId] } as React.CSSProperties
                            }
                        >
                            <Icon name={tool.icon} size={16} />
                            {tool.name}
                        </Link>
                        <SaveToolButton toolId={tool.id} name={tool.name} compact />
                    </span>
                ))}
            </div>
        </section>
    );
}

const available = catalog.filter((tool) => tool.status === 'available');

/** Tools this browser opened recently, as quick chips. Hidden until there is something to show. */
export function RecentTools() {
    const recent = useRecentTools();
    if (!recent.length) return null;
    return (
        <section className="dashboard-block" aria-labelledby="recent-tools-title">
            <div className="dashboard-block-head">
                <h2 id="recent-tools-title" className="dashboard-block-title">
                    Recently used
                </h2>
                <button className="text-link" onClick={clearRecentTools}>
                    Clear
                </button>
            </div>
            <div className="recent-tools">
                {recent.map((tool) => (
                    <Link
                        key={tool.id}
                        href={toolPageHref(tool)}
                        className="recent-tool"
                        style={{ '--tint': categoryTints[tool.categoryId] } as React.CSSProperties}
                    >
                        <Icon name={tool.icon} size={16} />
                        {tool.name}
                    </Link>
                ))}
            </div>
        </section>
    );
}

/** Big tiles for the resources people create most. */
export function QuickCreate() {
    return (
        <section className="dashboard-block" aria-labelledby="quick-create-title">
            <h2 id="quick-create-title" className="dashboard-block-title">
                Quick create
            </h2>
            <div className="quick-create">
                {quickCreate.map((item) => (
                    <Link key={item.href} href={item.href} className="quick-create-tile">
                        <span className="quick-create-icon">
                            <item.icon size={20} />
                        </span>
                        <span>
                            <strong>{item.name}</strong>
                            <small>{item.description}</small>
                        </span>
                        <ArrowRight size={16} className="quick-create-arrow" />
                    </Link>
                ))}
            </div>
        </section>
    );
}

/** Every available tool: search, or pick a category. Without either, a short preview of each. */
export function DashboardTools({ glyphs = {} }: { glyphs?: Record<string, React.ReactNode> }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const searching = query.trim().length > 0;
    const matches = searching ? searchTools(query, available) : available;
    const groups = categories
        .map((entry) => ({
            category: entry,
            tools: matches.filter((tool) => tool.categoryId === entry.id),
        }))
        .filter(
            (group) => group.tools.length && (category === 'all' || group.category.id === category),
        );
    // Browsing everything shows a few per category; searching or picking one shows them all.
    const preview = !searching && category === 'all';
    const launch = (tool: (typeof available)[number]) => (
        <Link
            key={tool.id}
            href={toolPageHref(tool)}
            className="tool-launch"
            style={{ '--tint': categoryTints[tool.categoryId] } as React.CSSProperties}
        >
            <span className="tool-launch-icon">
                {glyphs[tool.id] ?? <Icon name={tool.icon} size={18} />}
            </span>
            <span>
                <strong>{tool.name}</strong>
                {tool.minimumPlan && tool.minimumPlan !== 'free' && (
                    <small>{tool.minimumPlan === 'pro' ? 'Pro' : 'Team'} plan</small>
                )}
                <small>{tool.description}</small>
            </span>
        </Link>
    );
    return (
        <div className="home-panels">
            <div className="tool-finder">
                <TextField.Root
                    size="3"
                    className="dashboard-tool-search"
                    placeholder={`Search ${available.length} tools: pdf, jwt, dns, mock…`}
                    aria-label="Search tools"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                >
                    <TextField.Slot>
                        <MagnifyingGlass size={18} />
                    </TextField.Slot>
                </TextField.Root>
                <div className="filter-chips" role="group" aria-label="Category">
                    {[{ id: 'all', name: 'All' }, ...categories].map((entry) => {
                        const count =
                            entry.id === 'all'
                                ? matches.length
                                : matches.filter((tool) => tool.categoryId === entry.id).length;
                        if (entry.id !== 'all' && !count) return null;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                aria-pressed={category === entry.id}
                                onClick={() => setCategory(entry.id)}
                            >
                                {entry.name}
                                <span className="filter-chip-count">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {preview && (
                <>
                    <SavedTools />
                    <RecentTools />
                </>
            )}
            {groups.length ? (
                groups.map(({ category: entry, tools }) => (
                    <section key={entry.id} className="home-section tool-launch-group">
                        <div className="home-section-head">
                            <h2>
                                {entry.name} <span className="home-count">{tools.length}</span>
                            </h2>
                            {preview && tools.length > 6 && (
                                <button
                                    type="button"
                                    className="home-panel-link"
                                    onClick={() => {
                                        setCategory(entry.id);
                                        scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                >
                                    Show all
                                </button>
                            )}
                        </div>
                        <div className="tool-launch-grid">
                            {(preview ? tools.slice(0, 6) : tools).map(launch)}
                        </div>
                    </section>
                ))
            ) : (
                <p className="home-empty">
                    No tool matches “{query.trim()}”. Try a shorter word, like pdf, json or webhook.
                </p>
            )}
        </div>
    );
}
