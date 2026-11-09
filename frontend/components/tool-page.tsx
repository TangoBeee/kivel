'use client';
import { DropdownMenu, Button } from '@radix-ui/themes';
import { ArrowLeft, CaretDown, Plus } from '@phosphor-icons/react';
import { catalog, categoryTints } from '../lib/catalog';
import type { WorkspaceUsage } from '../lib/workspace-usage';
import { formatBytes } from '../lib/workspace-usage';
import { panelInfo } from './dashboard-shell';
import type { DashboardPanel } from './dashboard-shell';
import { resourceTool } from './dashboard-resources';
import type { Resource } from './dashboard-resources';
import { ToolWorkbench } from './tool-workbench';

export type ToolPanel = Extract<
    DashboardPanel,
    | 'email'
    | 'webhooks'
    | 'mocks'
    | 'files'
    | 'monitors'
    | 'memory'
    | 'payments'
    | 'vault'
    | 'authenticators'
    | 'automation'
    | 'status'
>;
export const toolPanels: ToolPanel[] = [
    'email',
    'webhooks',
    'mocks',
    'files',
    'monitors',
    'memory',
    'payments',
    'vault',
    'authenticators',
    'automation',
    'status',
];
export const isToolPanel = (panel: DashboardPanel): panel is ToolPanel =>
    (toolPanels as string[]).includes(panel);

export const panelResources = (panel: ToolPanel, resources: Resource[]) => {
    const kinds = (panelInfo(panel).kinds ?? []) as string[];
    return resources.filter((resource) =>
        panel === 'payments'
            ? resource.toolId?.startsWith('agents-test-')
            : kinds.includes(resource.kind) && !resource.toolId?.startsWith('agents-test-'),
    );
};

type Reading = { label: string; used: number; limit?: number; show: string; note?: string };

/** The limits that matter for one tool, as label, amount used and the plan limit. */
export function readings(
    panel: ToolPanel,
    resources: Resource[],
    usage: WorkspaceUsage,
): Reading[] {
    const mine = panelResources(panel, resources);
    const limits = usage.limits;
    const stored = resources.reduce((sum, item) => sum + item.storedBytes, 0);
    const pool = limits && {
        label: 'All resources',
        used: resources.length,
        limit: limits.maxResources,
        show: `${resources.length} / ${limits.maxResources}`,
        note: 'Webhooks, mocks and files share this',
    };
    const storage = limits && {
        label: 'Storage',
        used: stored,
        limit: limits.storageBytes,
        show: `${formatBytes(stored)} / ${formatBytes(limits.storageBytes)}`,
    };
    const list: (Reading | undefined)[] =
        panel === 'email'
            ? [
                  limits && {
                      label: 'Inboxes',
                      used: mine.length,
                      limit: limits.emailInboxes,
                      show: `${mine.length} / ${limits.emailInboxes}`,
                  },
                  usage.email && {
                      label: 'Sent this month',
                      used: usage.email.month,
                      limit: usage.email.perMonth,
                      show: `${usage.email.month} / ${usage.email.perMonth}`,
                      note: 'Resets on the 1st (UTC)',
                  },
                  usage.email && {
                      label: 'Sent today',
                      used: usage.email.day,
                      limit: usage.email.perDay,
                      show: `${usage.email.day} / ${usage.email.perDay}`,
                      note: 'Resets at midnight UTC',
                  },
              ]
            : panel === 'webhooks'
              ? [pool, storage]
              : panel === 'payments'
                ? [pool, storage]
                : panel === 'mocks'
                  ? [pool]
                  : panel === 'files'
                    ? [storage, pool]
                    : panel === 'automation'
                      ? [pool]
                      : panel === 'monitors'
                        ? [
                              usage.monitors && {
                                  label: 'Monitors',
                                  used: usage.monitors.used,
                                  limit: usage.monitors.limit,
                                  show: `${usage.monitors.used} / ${usage.monitors.limit}`,
                              },
                          ]
                        : panel === 'memory'
                          ? [
                                usage.memory && {
                                    label: 'Memory used',
                                    used: usage.memory.used,
                                    limit: usage.memory.limit,
                                    show: `${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.limit)}`,
                                },
                            ]
                          : panel === 'vault'
                            ? [
                                  usage.vault && {
                                      label: 'Vault entries',
                                      used: usage.vault.used,
                                      limit: usage.vault.limit,
                                      show: `${usage.vault.used} / ${usage.vault.limit}`,
                                  },
                              ]
                            : [
                                  usage.authenticators && {
                                      label: 'Authenticators',
                                      used: usage.authenticators.used,
                                      limit: usage.authenticators.limit,
                                      show: `${usage.authenticators.used} / ${usage.authenticators.limit}`,
                                  },
                              ];
    return list.filter((item): item is Reading => !!item);
}

export function UsageBar({ used, limit }: { used: number; limit?: number }) {
    const ratio = limit ? Math.min(1, used / limit) : 0;
    return (
        <span
            className={`usage-bar ${limit && ratio >= 1 ? 'is-full' : ''}`}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={limit ?? 0}
            aria-valuenow={used}
        >
            <i style={{ width: `${limit ? Math.max(ratio * 100, used > 0 ? 3 : 0) : 0}%` }} />
        </span>
    );
}

function Meters({ items, onPlans }: { items: Reading[]; onPlans: () => void }) {
    if (!items.length) return null;
    return (
        <div className="tool-meters">
            {items.map((item) => {
                const full = !!item.limit && item.used >= item.limit;
                return (
                    <div key={item.label}>
                        <span className="tool-meter-row">
                            <small>{item.label}</small>
                            <strong>{item.show}</strong>
                        </span>
                        {item.limit !== undefined && (
                            <UsageBar used={item.used} limit={item.limit} />
                        )}
                        {full ? (
                            <button
                                type="button"
                                className="tool-meter-note is-full"
                                onClick={onPlans}
                            >
                                At your limit. See plans
                            </button>
                        ) : (
                            item.note && <span className="tool-meter-note">{item.note}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** The New button of a tool page: one tool, or a short menu when the page covers several. */
export function ToolNew({ panel, onNew }: { panel: ToolPanel; onNew: (toolId: string) => void }) {
    const create = (panelInfo(panel).create ?? []) as string[];
    const tools = create
        .map((id) => catalog.find((tool) => tool.id === id))
        .filter((tool) => !!tool);
    if (!tools.length) return null;
    if (tools.length === 1)
        return (
            <Button size="2" onClick={() => onNew(tools[0]!.id)}>
                <Plus size={16} />
                New
            </Button>
        );
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <Button size="2">
                    <Plus size={16} />
                    New
                    <CaretDown size={14} />
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                {tools.map((tool) => (
                    <DropdownMenu.Item key={tool.id} onSelect={() => onNew(tool.id)}>
                        {tool.name}
                    </DropdownMenu.Item>
                ))}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

/** A tool opened inside the dashboard, with a way back to its list. */
export function EmbeddedTool({
    toolId,
    backLabel,
    onBack,
}: {
    toolId: string;
    backLabel?: string;
    onBack?: () => void;
}) {
    return (
        <div className="dashboard-embed">
            {onBack && (
                <button type="button" className="dashboard-back" onClick={onBack}>
                    <ArrowLeft size={14} />
                    {backLabel}
                </button>
            )}
            <ToolWorkbench toolId={toolId} />
        </div>
    );
}

export function ToolPage({
    panel,
    resources,
    usage,
    open,
    onNew,
    onBack,
    onPlans,
    list,
    children,
}: {
    panel: ToolPanel;
    resources: Resource[];
    usage: WorkspaceUsage;
    /** What is open: a resource, or a tool to create something new. */
    open: { resource?: string; tool?: string };
    onNew: (toolId: string) => void;
    onBack: () => void;
    onPlans: () => void;
    /** The page's own list when nothing is open. */
    list: React.ReactNode;
    children?: React.ReactNode;
}) {
    const info = panelInfo(panel);
    const opened = open.resource
        ? resources.find((resource) => resource.id === open.resource)
        : undefined;
    const toolId = opened ? resourceTool(opened).id : open.tool;
    return (
        <div className="tool-page">
            <Meters items={readings(panel, resources, usage)} onPlans={onPlans} />
            {toolId ? (
                <EmbeddedTool
                    key={`${open.resource ?? ''}-${toolId}`}
                    toolId={toolId}
                    backLabel={`Back to ${info.label}`}
                    onBack={onBack}
                />
            ) : (
                <>
                    {list}
                    {children}
                </>
            )}
        </div>
    );
}

/** Overview cards: one per tool, with what it holds and how full it is. */
export function ToolCards({
    resources,
    usage,
    onOpen,
}: {
    resources: Resource[];
    usage: WorkspaceUsage;
    onOpen: (panel: ToolPanel) => void;
}) {
    return (
        <section className="home-section" aria-labelledby="tools-heading">
            <div className="home-section-head">
                <h2 id="tools-heading">Your tools</h2>
            </div>
            <div className="tool-cards">
                {toolPanels.map((panel) => {
                    const info = panelInfo(panel);
                    const limit = readings(panel, resources, usage)[0];
                    const listed = info.kinds ? panelResources(panel, resources).length : undefined;
                    if (panel === 'automation' && !listed) return null;
                    const main =
                        listed === undefined
                            ? limit
                            : {
                                  label: limit ? `${limit.label}: ${limit.show}` : '',
                                  used: limit?.used ?? 0,
                                  limit: limit?.limit,
                                  show: String(listed),
                              };
                    return (
                        <button
                            key={panel}
                            type="button"
                            className="tool-card"
                            onClick={() => onOpen(panel)}
                        >
                            <span className="tool-card-name">
                                <span
                                    className="nav-chip"
                                    style={
                                        {
                                            '--tint': categoryTints[info.category!],
                                        } as React.CSSProperties
                                    }
                                >
                                    <info.icon size={14} />
                                </span>
                                {info.label}
                            </span>
                            <strong>{main?.show ?? '–'}</strong>
                            <UsageBar used={main?.used ?? 0} limit={main?.limit} />
                            <small>{main?.label ?? ''}</small>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
