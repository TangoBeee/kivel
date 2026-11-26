'use client';
import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { catalog, categories, categoryTints } from '../../../lib/catalog';
import { Icon } from '../../icons';
import type { DashboardPanel } from '../../dashboard-shell';
import { PageHeader } from '../shell/page-header';
import { Chip, ChipRow, ListEmpty, ListGroup, ListRow, LogoTile, Tag } from '../ui';
import { kivelTools, type KivelTool } from './kivel-tools';
import { ToolDrawer } from './tool-drawer';
import styles from './catalog-page.module.css';

type Badge = { text: string; full?: boolean; hidden?: boolean };
const utilities = catalog.filter((tool) => tool.status === 'available');
const utilityGroups = categories
    .map((category) => ({
        ...category,
        count: utilities.filter((tool) => tool.categoryId === category.id).length,
    }))
    .filter((category) => category.count > 0);
const kivelToolCount = kivelTools.reduce((sum, tool) => sum + tool.endpoints.length, 0);

type Filter = 'all' | 'kivel' | 'utilities';

/** Usage like "3/10" reads better as "3 of 10 in use". */
function usageLabel(badge?: Badge) {
    if (!badge) return undefined;
    const [used, max] = badge.text.split('/');
    return max ? `${used} of ${max} in use` : badge.text;
}

/**
 * Every tool an agent can call. Kivel tools first, then utilities. Third-party providers join
 * as the catalog engine lands (catalog-pivot-plan.md §3), in the same grouped list.
 */
export function CatalogPage({
    badges,
    onOpenPanel,
    onOpenUtilities,
}: {
    badges: Partial<Record<DashboardPanel, Badge>>;
    onOpenPanel: (panel: DashboardPanel) => void;
    onOpenUtilities: (category?: string) => void;
}) {
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<KivelTool | null>(null);
    const needle = query.trim().toLowerCase();
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
    const shownTools = kivelTools.filter((tool) => matches(`${tool.name} ${tool.description}`));
    const shownUtilities = utilityGroups.filter((group) =>
        matches(`${group.name} ${group.description}`),
    );
    const total = kivelToolCount + utilities.length;
    const showKivel = filter !== 'utilities' && shownTools.length > 0;
    const showUtilities = filter !== 'kivel' && shownUtilities.length > 0;
    return (
        <>
            <PageHeader
                title="Catalog"
                description={`${total.toLocaleString()} tools your agents can call through one connection.`}
                actions={
                    <label className={styles.search}>
                        <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search, or describe a job"
                            aria-label="Search the catalog"
                        />
                    </label>
                }
            />
            <ChipRow label="Filter the catalog">
                <Chip pressed={filter === 'all'} count={total} onClick={() => setFilter('all')}>
                    All
                </Chip>
                <Chip
                    pressed={filter === 'kivel'}
                    count={kivelToolCount}
                    onClick={() => setFilter('kivel')}
                >
                    Kivel tools
                </Chip>
                <Chip
                    pressed={filter === 'utilities'}
                    count={utilities.length}
                    onClick={() => setFilter('utilities')}
                >
                    Utilities
                </Chip>
            </ChipRow>
            {showKivel && (
                <ListGroup label="Kivel tools" meta={`${kivelToolCount} tools`}>
                    {shownTools.map((tool) => {
                        const ToolIcon = tool.icon;
                        const badge = tool.usage ? badges[tool.usage] : undefined;
                        return (
                            <ListRow
                                key={tool.id}
                                icon={
                                    <LogoTile>
                                        <ToolIcon color={tool.color} />
                                    </LogoTile>
                                }
                                name={tool.name}
                                description={tool.description}
                                meta={
                                    tool.note ? (
                                        <Tag tone="warn">{tool.note}</Tag>
                                    ) : (
                                        <span className={badge?.full ? styles.full : undefined}>
                                            {usageLabel(badge) ?? `${tool.endpoints.length} tools`}
                                        </span>
                                    )
                                }
                                onClick={() => setSelected(tool)}
                            />
                        );
                    })}
                </ListGroup>
            )}
            {showUtilities && (
                <ListGroup label="Utilities" meta={`${utilities.length} tools`}>
                    {shownUtilities.map((group) => (
                        <ListRow
                            key={group.id}
                            icon={
                                <LogoTile>
                                    <span
                                        style={{ color: categoryTints[group.id], display: 'grid' }}
                                    >
                                        <Icon name={group.icon} size={14} />
                                    </span>
                                </LogoTile>
                            }
                            name={group.name}
                            description={group.description}
                            meta={`${group.count} tools`}
                            onClick={() => onOpenUtilities(group.id)}
                        />
                    ))}
                </ListGroup>
            )}
            {!showKivel && !showUtilities && (
                <ListGroup label="No results">
                    <ListEmpty>Nothing matches “{query}”. Try email, webhook or json.</ListEmpty>
                </ListGroup>
            )}
            <ToolDrawer
                tool={selected}
                usage={selected?.usage ? usageLabel(badges[selected.usage]) : undefined}
                onClose={() => setSelected(null)}
                onOpenPage={(tool) => {
                    setSelected(null);
                    if (tool.panel) onOpenPanel(tool.panel);
                }}
            />
        </>
    );
}
