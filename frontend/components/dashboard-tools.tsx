'use client';
import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { catalog, categories, categoryTints, searchTools } from '../lib/catalog';
import type { CatalogTool } from '../lib/catalog';
import { Icon } from './icons';
import { useRecentTools } from '../lib/recent-tools';
import { useSavedTools } from '../lib/saved-tools';
import { EmbeddedTool } from './tool-page';

const available = catalog.filter((tool) => tool.status === 'available');

/** Utilities: pick a tool on the left, it runs on the right. Saved and recent come first. */
export function DashboardTools({
    selected,
    onSelect,
    glyphs = {},
}: {
    selected?: string;
    onSelect: (toolId: string) => void;
    glyphs?: Record<string, React.ReactNode>;
}) {
    const [query, setQuery] = useState('');
    const saved = useSavedTools().tools;
    const recent = useRecentTools();
    const searching = query.trim().length > 0;
    const row = (tool: CatalogTool, note?: string) => (
        <button
            key={tool.id}
            type="button"
            className="utility-item"
            aria-current={selected === tool.id ? 'true' : undefined}
            onClick={() => onSelect(tool.id)}
        >
            <span
                className="nav-chip"
                style={{ '--tint': categoryTints[tool.categoryId] } as React.CSSProperties}
            >
                {glyphs[tool.id] ?? <Icon name={tool.icon} size={13} />}
            </span>
            <span className="utility-name">{tool.name}</span>
            {note && <small>{note}</small>}
        </button>
    );
    const tool = catalog.find((entry) => entry.id === selected);
    return (
        <div className="utilities">
            <div className="utility-list">
                <label className="utility-search">
                    <MagnifyingGlass size={16} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={`Search ${available.length} tools`}
                        aria-label="Search tools"
                    />
                </label>
                <div className="utility-scroll">
                    {searching ? (
                        (() => {
                            const found = searchTools(query, available);
                            return found.length ? (
                                found.map((entry) => row(entry))
                            ) : (
                                <p className="utility-empty">
                                    Nothing matches. Try pdf, json or dns.
                                </p>
                            );
                        })()
                    ) : (
                        <>
                            {saved.length > 0 && (
                                <>
                                    <p className="utility-group">Saved</p>
                                    {saved.map((entry) => row(entry))}
                                </>
                            )}
                            {recent.length > 0 && (
                                <>
                                    <p className="utility-group">Recent</p>
                                    {recent.slice(0, 5).map((entry) => row(entry))}
                                </>
                            )}
                            {categories.map((category) => {
                                const tools = available.filter(
                                    (entry) => entry.categoryId === category.id,
                                );
                                if (!tools.length) return null;
                                return (
                                    <div key={category.id}>
                                        <p className="utility-group">{category.name}</p>
                                        {tools.map((entry) => row(entry))}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
            <div className="utility-run">
                {tool ? (
                    <EmbeddedTool key={tool.id} toolId={tool.id} />
                ) : (
                    <div className="utility-pick">
                        <strong>Pick a tool on the left</strong>
                        <p>
                            It runs right here. Tools you open often show up under Recent, and the
                            ones you save stay at the top.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
