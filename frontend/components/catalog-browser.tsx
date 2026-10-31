'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, SegmentedControl, Select, TextField } from '@radix-ui/themes';
import {
    categories,
    categoryHref,
    categoryRoadmap,
    categoryTints,
    categoryTools,
    toolAvailability,
    searchTools,
} from '../lib/catalog';
import type { CatalogTool } from '../lib/catalog';
import { Icon } from './icons';
import { Availability, useToolbox } from './toolbox-provider';
import { SaveToolButton } from './save-tool-button';
import { useSavedTools } from '../lib/saved-tools';

function ToolRow({ tool, glyph }: { tool: CatalogTool; glyph?: React.ReactNode }) {
    const { previewTool } = useToolbox();
    const content = (
        <>
            <span
                className={`catalog-tool-icon ${tool.status === 'available' ? 'is-ready' : ''}`}
                style={{ '--tint': categoryTints[tool.categoryId] } as React.CSSProperties}
            >
                {glyph ?? <Icon name={tool.icon} size={20} />}
            </span>
            <span className="catalog-tool-copy">
                <strong>{tool.name}</strong>
                <span>{tool.description}</span>
            </span>
            <span className="catalog-tool-end">
                <Availability tool={tool} />
                <Icon name={tool.status === 'available' ? 'arrow-up' : 'info'} size={15} />
            </span>
        </>
    );
    return tool.status === 'available' ? (
        <div className="catalog-save-row">
            <Link className="catalog-tool-row" href={tool.href!}>
                {content}
            </Link>
            <SaveToolButton toolId={tool.id} name={tool.name} compact />
        </div>
    ) : (
        <button className="catalog-tool-row" onClick={() => previewTool(tool)}>
            {content}
        </button>
    );
}

export function CatalogBrowser({
    categoryId = 'all',
    glyphs = {},
}: {
    categoryId?: string;
    glyphs?: Record<string, React.ReactNode>;
}) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [availability, setAvailability] = useState('all');
    const { ids: saved } = useSavedTools();
    const { capabilities } = useToolbox();
    const category = categories.find((item) => item.id === categoryId);
    const source = useMemo(
        () =>
            categoryTools(categoryId).map((tool) =>
                capabilities ? toolAvailability(tool, capabilities) : tool,
            ),
        [categoryId, capabilities],
    );
    const filtered = searchTools(query, source).filter(
        (tool) =>
            availability === 'all' ||
            (availability === 'saved'
                ? saved.includes(tool.id)
                : tool.status === (availability === 'available' ? 'available' : 'coming-soon')),
    );
    const visibleGroups = categories
        .map((group) => ({
            ...group,
            tools: filtered
                .filter((tool) => tool.categoryId === group.id)
                .sort(
                    (a, b) => Number(b.status === 'available') - Number(a.status === 'available'),
                ),
        }))
        .filter((group) => group.tools.length);
    const available = source.filter((tool) => tool.status === 'available').length;
    return (
        <div className="page-width catalog-page">
            <div className="breadcrumb">
                <Link href="/">Home</Link>
                <Icon name="chevron" size={12} />
                <Link href="/catalog/">Tool catalog</Link>
                {category && (
                    <>
                        <Icon name="chevron" size={12} />
                        <span>{category.name}</span>
                    </>
                )}
            </div>
            <div className="catalog-title">
                <span className="catalog-title-icon">
                    <Icon name={category?.icon ?? 'grid'} size={28} />
                </span>
                <div>
                    <h1>{category?.name ?? 'The whole toolbox.'}</h1>
                    <p>
                        {category?.description ??
                            'Find something useful today. See what is on the way.'}
                    </p>
                </div>
            </div>
            <div className="catalog-layout">
                <aside className="catalog-sidebar">
                    <span className="sidebar-label">Categories</span>
                    <nav aria-label="Tool categories">
                        <Link
                            href="/catalog/"
                            className={categoryId === 'all' ? 'selected' : ''}
                            aria-current={categoryId === 'all' ? 'page' : undefined}
                        >
                            <Icon name="grid" size={17} /> All tools{' '}
                            <span>{categoryTools('all').length}</span>
                        </Link>
                        {categories.map((item) => (
                            <Link
                                key={item.id}
                                href={categoryHref(item.id)}
                                className={categoryId === item.id ? 'selected' : ''}
                                aria-current={categoryId === item.id ? 'page' : undefined}
                            >
                                <Icon name={item.icon} size={17} /> {item.name}
                            </Link>
                        ))}
                    </nav>
                    <div className="sidebar-note">
                        <Icon name="shield" size={18} />
                        <p>
                            No ads. No account needed.
                            <br />
                            Just a useful set of tools.
                        </p>
                    </div>
                </aside>
                <div className="catalog-main">
                    <div className="mobile-category-select">
                        <Select.Root
                            value={categoryId}
                            onValueChange={(value) =>
                                router.push(
                                    value === 'all'
                                        ? '/catalog/'
                                        : categoryHref(value as (typeof categories)[number]['id']),
                                )
                            }
                        >
                            <Select.Trigger aria-label="Choose a category" />
                            <Select.Content>
                                <Select.Item value="all">All tools</Select.Item>
                                {categories.map((item) => (
                                    <Select.Item key={item.id} value={item.id}>
                                        {item.name}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>
                    </div>
                    <div className="catalog-controls">
                        <TextField.Root
                            size="3"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            aria-label="Filter catalog tools"
                            placeholder={
                                category ? `Search ${category.name.toLowerCase()}…` : 'Find a tool…'
                            }
                        >
                            <TextField.Slot>
                                <Icon name="search" size={18} />
                            </TextField.Slot>
                            {query && (
                                <TextField.Slot>
                                    <button
                                        className="clear-field"
                                        onClick={() => setQuery('')}
                                        aria-label="Clear catalog search"
                                    >
                                        <Icon name="close" size={15} />
                                    </button>
                                </TextField.Slot>
                            )}
                        </TextField.Root>
                        <SegmentedControl.Root
                            size="2"
                            value={availability}
                            onValueChange={setAvailability}
                            aria-label="Tool availability"
                        >
                            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
                            <SegmentedControl.Item value="available">
                                Available
                            </SegmentedControl.Item>
                            <SegmentedControl.Item value="coming-soon">
                                Planned
                            </SegmentedControl.Item>
                            <SegmentedControl.Item value="saved">Saved</SegmentedControl.Item>
                        </SegmentedControl.Root>
                    </div>
                    <div className="catalog-results-meta" aria-live="polite">
                        <span>
                            {filtered.length} {filtered.length === 1 ? 'tool' : 'tools'}
                            {query && ` matching “${query}”`}
                        </span>
                        <span>{available} available now</span>
                    </div>
                    {visibleGroups.map((group) => (
                        <section
                            key={group.id}
                            className="catalog-group"
                            aria-labelledby={`group-${group.id}`}
                        >
                            {categoryId === 'all' && (
                                <div className="catalog-group-heading">
                                    <Link id={`group-${group.id}`} href={categoryHref(group.id)}>
                                        <Icon name={group.icon} size={18} />
                                        <h2>{group.name}</h2>
                                        <Icon name="arrow" size={15} />
                                    </Link>
                                    <span>{group.tools.length}</span>
                                </div>
                            )}
                            {categoryId !== 'all' && (
                                <h2 className="sr-only" id={`group-${group.id}`}>
                                    {group.name} tools
                                </h2>
                            )}
                            <div className="catalog-tools-grid">
                                {group.tools.map((tool) => (
                                    <ToolRow tool={tool} key={tool.id} glyph={glyphs[tool.id]} />
                                ))}
                            </div>
                        </section>
                    ))}
                    {!filtered.length && (
                        <div className="catalog-empty">
                            <Icon name={category?.icon ?? 'search'} size={30} />
                            <h2>
                                {query
                                    ? 'No matching tools'
                                    : availability === 'saved'
                                      ? 'Your useful tools, kept close.'
                                      : 'Nothing available here just yet.'}
                            </h2>
                            <p>
                                {query
                                    ? 'Try a different name or a broader search.'
                                    : availability === 'saved'
                                      ? 'Use the bookmark beside a tool to save it here. Saved tools stay in this browser; inputs and credentials are never saved with them.'
                                      : 'You can still explore what is planned for this category.'}
                            </p>
                            <Button
                                variant="soft"
                                color="gray"
                                onClick={() => {
                                    setQuery('');
                                    setAvailability('all');
                                }}
                            >
                                {query ? 'Reset search' : 'Explore all tools'}
                            </Button>
                        </div>
                    )}
                    {category && (
                        <details className="category-roadmap">
                            <summary>
                                <span>Full category roadmap</span>
                                <Icon name="plus" size={16} />
                            </summary>
                            <p>
                                All the capabilities planned for this category. Availability is
                                shown on each tool above.
                            </p>
                            <ul>
                                {categoryRoadmap(category.id).map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                    <div className="catalog-bottom-note">
                        <Icon name="info" size={16} />
                        <p>
                            “Coming soon” means planned, not available. We’ll only mark a tool ready
                            when you can actually use it.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
