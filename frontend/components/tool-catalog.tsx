'use client';
import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { catalog, categories, categoryTints, searchTools } from '../lib/catalog';
import { Icon } from './icons';
import { panelInfo, type DashboardPanel } from './dashboard-shell';

type Badge = { text: string; full?: boolean; hidden?: boolean };

/** How the Tools page groups the dashboard's tools. Utilities come last, by catalog category. */
const groups: { id: string; name: string; description: string; panels: DashboardPanel[] }[] = [
    {
        id: 'inbox',
        name: 'Inbox',
        description: 'Where email and requests from the outside world land for your agents.',
        panels: ['email', 'webhooks'],
    },
    {
        id: 'build',
        name: 'Build and test',
        description: 'Stand ins for APIs, sign in providers and payments that are not ready yet.',
        panels: ['mocks', 'payments'],
    },
    {
        id: 'monitoring',
        name: 'Monitoring',
        description: 'Know when a site, certificate or scheduled job breaks, and tell your users.',
        panels: ['monitors', 'automation', 'status'],
    },
    {
        id: 'safety',
        name: 'Safety',
        description: 'Keep a person in the loop and keep passwords out of your agents’ hands.',
        panels: ['approvals', 'vault', 'authenticators'],
    },
    {
        id: 'storage',
        name: 'Storage',
        description: 'What your agents remember between sessions and the files they share.',
        panels: ['memory', 'files'],
    },
];

const tones: Partial<Record<DashboardPanel, string>> = {
    email: 'email',
    webhooks: 'webhooks',
    mocks: 'mocks',
    monitors: 'monitors',
    approvals: 'approvals',
};

const available = catalog.filter((tool) => tool.status === 'available');
const utilityGroups = categories
    .map((category) => ({
        ...category,
        count: available.filter((tool) => tool.categoryId === category.id).length,
    }))
    .filter((category) => category.count > 0);

function usageLine(panel: DashboardPanel, badge?: Badge) {
    if (panel === 'approvals') return 'Questions your agents ask you';
    if (!badge) return 'Ready to use';
    if (panel === 'memory') return `${badge.text} saved`;
    const [used, max] = badge.text.split('/');
    return max ? `${used} of ${max} in use` : badge.text;
}

export function ToolCatalog({
    badges,
    onOpen,
    onUtilities,
    onUtility,
}: {
    badges: Partial<Record<DashboardPanel, Badge>>;
    onOpen: (panel: DashboardPanel) => void;
    onUtilities: (category?: string) => void;
    onUtility: (toolId: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('all');
    const needle = query.trim().toLowerCase();
    const shown = useMemo(
        () =>
            groups
                .map((group) => ({
                    ...group,
                    panels: group.panels.filter((panel) => {
                        if (badges[panel]?.hidden) return false;
                        if (!needle) return true;
                        const info = panelInfo(panel);
                        return `${info.label} ${info.description}`.toLowerCase().includes(needle);
                    }),
                }))
                .filter((group) => group.panels.length && (tab === 'all' || tab === group.id)),
        [badges, needle, tab],
    );
    const utilities = needle ? searchTools(query, available).slice(0, 12) : [];
    const showUtilities = tab === 'all' || tab === 'utilities';
    const counts = Object.fromEntries(
        groups.map((group) => [
            group.id,
            group.panels.filter((panel) => !badges[panel]?.hidden).length,
        ]),
    );
    const tabs = [
        { id: 'all', name: 'All' },
        ...groups.map(({ id, name }) => ({ id, name })),
        { id: 'utilities', name: 'Utilities' },
    ];
    const tabCount = (id: string) =>
        id === 'all'
            ? Object.values(counts).reduce((sum, value) => sum + value, 0) + available.length
            : id === 'utilities'
              ? available.length
              : counts[id];
    return (
        <div className="catalog">
            <label className="catalog-search">
                <MagnifyingGlass size={18} />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tools, or describe what your agent needs to do"
                    aria-label="Search tools"
                />
            </label>
            <div className="catalog-tabs" role="tablist" aria-label="Tool categories">
                {tabs.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        onClick={() => setTab(entry.id)}
                    >
                        {entry.name}
                        <small>{tabCount(entry.id)}</small>
                    </button>
                ))}
            </div>
            {shown.map((group) => (
                <section key={group.id} className="catalog-section">
                    <h2>
                        {group.name}
                        <small>{group.panels.length}</small>
                    </h2>
                    <p>{group.description}</p>
                    <div className="catalog-grid">
                        {group.panels.map((panel) => {
                            const info = panelInfo(panel);
                            const badge = badges[panel];
                            return (
                                <button
                                    key={panel}
                                    type="button"
                                    className="catalog-card"
                                    onClick={() => onOpen(panel)}
                                >
                                    <span
                                        className="nav-chip is-large"
                                        data-tone={tones[panel]}
                                        style={
                                            {
                                                '--tint': info.category
                                                    ? categoryTints[info.category]
                                                    : undefined,
                                            } as React.CSSProperties
                                        }
                                    >
                                        <info.icon size={19} />
                                    </span>
                                    <span className="catalog-card-text">
                                        <strong>{info.label}</strong>
                                        <small className={badge?.full ? 'is-full' : undefined}>
                                            {usageLine(panel, badge)}
                                        </small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}
            {showUtilities && (needle ? utilities.length > 0 : true) && (
                <section className="catalog-section">
                    <h2>
                        Utilities
                        <small>{needle ? utilities.length : available.length}</small>
                    </h2>
                    <p>
                        Small tools for JSON, JWT, DNS, SSL, test data and more. Your agents run the
                        same ones with run_tool.
                    </p>
                    <div className="catalog-grid">
                        {needle
                            ? utilities.map((tool) => (
                                  <button
                                      key={tool.id}
                                      type="button"
                                      className="catalog-card"
                                      onClick={() => onUtility(tool.id)}
                                  >
                                      <span
                                          className="nav-chip is-large"
                                          style={
                                              {
                                                  '--tint': categoryTints[tool.categoryId],
                                              } as React.CSSProperties
                                          }
                                      >
                                          <Icon name={tool.icon} size={18} />
                                      </span>
                                      <span className="catalog-card-text">
                                          <strong>{tool.name}</strong>
                                          <small>
                                              {
                                                  categories.find(
                                                      (category) => category.id === tool.categoryId,
                                                  )?.name
                                              }
                                          </small>
                                      </span>
                                  </button>
                              ))
                            : utilityGroups.map((category) => (
                                  <button
                                      key={category.id}
                                      type="button"
                                      className="catalog-card"
                                      onClick={() => onUtilities(category.id)}
                                  >
                                      <span
                                          className="nav-chip is-large"
                                          style={
                                              {
                                                  '--tint': categoryTints[category.id],
                                              } as React.CSSProperties
                                          }
                                      >
                                          <Icon name={category.icon} size={18} />
                                      </span>
                                      <span className="catalog-card-text">
                                          <strong>{category.name}</strong>
                                          <small>
                                              {category.count}{' '}
                                              {category.count === 1 ? 'tool' : 'tools'}
                                          </small>
                                      </span>
                                  </button>
                              ))}
                    </div>
                </section>
            )}
            {!shown.length && !(showUtilities && utilities.length) && (
                <p className="catalog-empty">Nothing matches. Try email, webhook, json or dns.</p>
            )}
        </div>
    );
}
