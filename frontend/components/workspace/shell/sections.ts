import type { DashboardPanel } from '../../dashboard-shell';

/** The top-level areas of the workspace, in navigation order. */
export type SectionId = 'start' | 'catalog' | 'connections' | 'activity' | 'team';

export interface SectionDef {
    id: SectionId;
    label: string;
    /** The page a section opens on. */
    home: DashboardPanel;
}

/**
 * Connections ships with the third-party catalog (docs/internal/catalog-pivot-plan.md §3).
 * Until then the tab stays out of the navigation.
 */
export const CONNECTIONS_ENABLED = false;

export const sections: SectionDef[] = [
    { id: 'start', label: 'Getting started', home: 'overview' },
    { id: 'catalog', label: 'Catalog', home: 'catalog' },
    ...(CONNECTIONS_ENABLED
        ? [{ id: 'connections' as const, label: 'Connections', home: 'catalog' as const }]
        : []),
    { id: 'activity', label: 'Activity', home: 'activity' },
    { id: 'team', label: 'Team', home: 'workspace' },
];

/** Tabs shown under the Team heading. */
export const teamTabs: DashboardPanel[] = [
    'workspace',
    'agents',
    'keys',
    'billing',
    'usage',
    'security',
];

/** Kivel tools that are no longer offered. Their routes still resolve for old links. */
export const retiredPanels: DashboardPanel[] = [
    'approvals',
    'memory',
    'monitors',
    'automation',
    'status',
    'files',
    'payments',
    'vault',
];

export function sectionOf(panel: DashboardPanel): SectionId {
    if (panel === 'overview') return 'start';
    if (panel === 'activity') return 'activity';
    if (teamTabs.includes(panel)) return 'team';
    return 'catalog';
}

/** Underline tabs for the current page, if its section has any. */
export function tabsFor(panel: DashboardPanel): DashboardPanel[] {
    return sectionOf(panel) === 'team' ? teamTabs : [];
}

export const tabLabels: Partial<Record<DashboardPanel, string>> = {
    workspace: 'Settings',
    agents: 'Agents',
    keys: 'API keys',
    billing: 'Billing',
    usage: 'Usage',
    security: 'Security',
};
