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

/** Every available tool, searchable and grouped by category. */
export function DashboardTools({ glyphs = {} }: { glyphs?: Record<string, React.ReactNode> }) {
    const [query, setQuery] = useState('');
    const matches = query.trim() ? searchTools(query, available) : available;
    const groups = categories
        .map((category) => ({
            category,
            tools: matches.filter((tool) => tool.categoryId === category.id),
        }))
        .filter((group) => group.tools.length);
    return (
        <>
            <SavedTools />
            <RecentTools />
            <QuickCreate />
            <section className="dashboard-block" aria-labelledby="all-tools-title">
                <div className="dashboard-block-head">
                    <h2 id="all-tools-title" className="dashboard-block-title">
                        All tools <span className="dashboard-count">{matches.length}</span>
                    </h2>
                    <TextField.Root
                        className="dashboard-tool-search"
                        placeholder={`Search ${available.length} tools…`}
                        aria-label="Search tools"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    >
                        <TextField.Slot>
                            <MagnifyingGlass size={16} />
                        </TextField.Slot>
                    </TextField.Root>
                </div>
                {groups.length ? (
                    groups.map(({ category, tools }) => (
                        <div key={category.id} className="tool-launch-group">
                            <h3>{category.name}</h3>
                            <div className="tool-launch-grid">
                                {tools.map((tool) => (
                                    <Link
                                        key={tool.id}
                                        href={toolPageHref(tool)}
                                        className="tool-launch"
                                        style={
                                            {
                                                '--tint': categoryTints[tool.categoryId],
                                            } as React.CSSProperties
                                        }
                                    >
                                        <span className="tool-launch-icon">
                                            {glyphs[tool.id] ?? <Icon name={tool.icon} size={18} />}
                                        </span>
                                        <span>
                                            <strong>{tool.name}</strong>
                                            {tool.minimumPlan && tool.minimumPlan !== 'free' && (
                                                <small>
                                                    {tool.minimumPlan === 'pro' ? 'Pro' : 'Team'}{' '}
                                                    plan
                                                </small>
                                            )}
                                            <small>{tool.description}</small>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="dashboard-empty">
                        <span className="dashboard-empty-icon">
                            <MagnifyingGlass size={24} />
                        </span>
                        <h3>No tool matches “{query.trim()}”</h3>
                        <p>Try a shorter word, like pdf, json, or webhook.</p>
                    </div>
                )}
            </section>
        </>
    );
}
