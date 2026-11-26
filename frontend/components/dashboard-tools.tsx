'use client';
import { useState } from 'react';
import { ArrowLeft, MagnifyingGlass } from '@phosphor-icons/react';
import { catalog, categories, categoryTints, searchTools } from '../lib/catalog';
import type { CatalogTool } from '../lib/catalog';
import { Icon } from './icons';
import { useRecentTools } from '../lib/recent-tools';
import { useSavedTools } from '../lib/saved-tools';
import { EmbeddedTool } from './tool-page';

const available = catalog.filter((tool) => tool.status === 'available');

export function DashboardTools({
    selected,
    onSelect,
    onBack,
    glyphs = {},
}: {
    selected?: string;
    onSelect: (toolId: string) => void;
    onBack: () => void;
    glyphs?: Record<string, React.ReactNode>;
}) {
    const [query, setQuery] = useState('');
    // One category at a time, from /utilities/?category=..., instead of all tools at once.
    const [category, setCategory] = useState(() => {
        if (typeof location === 'undefined') return '';
        const id = new URLSearchParams(location.search).get('category') ?? '';
        return categories.some((entry) => entry.id === id) ? id : '';
    });
    const pickCategory = (id: string) => {
        setCategory(id);
        const url = new URL(location.href);
        if (id) url.searchParams.set('category', id);
        else url.searchParams.delete('category');
        history.replaceState(null, '', url.pathname + url.search);
    };
    const saved = useSavedTools().tools;
    const recent = useRecentTools();
    const searching = query.trim().length > 0;
    const row = (tool: CatalogTool, note?: string) => (
        <button
            key={tool.id}
            type="button"
            className="utility-item"
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
    if (tool) {
        return (
            <EmbeddedTool
                key={tool.id}
                toolId={tool.id}
                backLabel="All utilities"
                onBack={onBack}
            />
        );
    }
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
                            {category ? (
                                (() => {
                                    const current = categories.find(
                                        (entry) => entry.id === category,
                                    )!;
                                    return (
                                        <div>
                                            <button
                                                type="button"
                                                className="utility-back"
                                                onClick={() => pickCategory('')}
                                            >
                                                <ArrowLeft size={14} />
                                                All categories
                                            </button>
                                            <p className="utility-group">{current.name}</p>
                                            {available
                                                .filter((entry) => entry.categoryId === category)
                                                .map((entry) => row(entry))}
                                        </div>
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
                                    <p className="utility-group">Categories</p>
                                    <div className="utility-categories">
                                        {categories.map((entry) => {
                                            const count = available.filter(
                                                (tool) => tool.categoryId === entry.id,
                                            ).length;
                                            if (!count) return null;
                                            return (
                                                <button
                                                    key={entry.id}
                                                    type="button"
                                                    className="catalog-card"
                                                    onClick={() => pickCategory(entry.id)}
                                                >
                                                    <span
                                                        className="nav-chip is-large"
                                                        style={
                                                            {
                                                                '--tint': categoryTints[entry.id],
                                                            } as React.CSSProperties
                                                        }
                                                    >
                                                        <Icon name={entry.icon} size={18} />
                                                    </span>
                                                    <span className="catalog-card-text">
                                                        <strong>{entry.name}</strong>
                                                        <small>
                                                            {count} {count === 1 ? 'tool' : 'tools'}
                                                        </small>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
