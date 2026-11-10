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
import { UsageMeter } from './app/usage-meter';
import { LimitCard } from './app/limit-card';
import type { UsageKey } from '@kivel.io/tools/plans';

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
export function readings(panel: ToolPanel, usage: WorkspaceUsage): Reading[] {
    const active = usage.items?.find((item) => item.key === 'resources.active');
    const stored = usage.items?.find((item) => item.key === 'resources.storage');
    const inboxes = usage.items?.find((item) => item.key === 'email.inboxes');
    const oauth = usage.items?.find((item) => item.key === 'mocks.oauth');
    const pool = active && {
        label: 'All resources',
        used: active.used,
        limit: active.max,
        show: `${active.used} / ${active.max}`,
        note: 'Shared across products',
    };
    const storage = stored && {
        label: 'Storage',
        used: stored.used,
        limit: stored.max,
        show: `${formatBytes(stored.used)} / ${formatBytes(stored.max)}`,
    };
    const list: (Reading | undefined)[] =
        panel === 'email'
            ? [
                  inboxes && {
                      label: 'Inboxes',
                      used: inboxes.used,
                      limit: inboxes.max,
                      show: `${inboxes.used} / ${inboxes.max}`,
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
                  ? [
                        pool,
                        oauth && {
                            label: oauth.label,
                            used: oauth.used,
                            limit: oauth.max,
                            show: `${oauth.used} / ${oauth.max}`,
                        },
                    ]
                  : panel === 'files'
                    ? [storage, pool]
                    : panel === 'automation' || panel === 'status'
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

function Meters({ items, onPlans }: { items: Reading[]; onPlans: () => void }) {
    if (!items.length) return null;
    return (
        <div className="tool-meters">
            {items.map((item) => {
                const full = !!item.limit && item.used >= item.limit;
                const near = !!item.limit && item.used >= item.limit * 0.8;
                return (
                    <div key={item.label}>
                        <span className="tool-meter-row">
                            <small>{item.label}</small>
                            <strong>{item.show}</strong>
                        </span>
                        {item.limit !== undefined && (
                            <UsageMeter label={item.label} used={item.used} limit={item.limit} />
                        )}
                        {full ? (
                            <button
                                type="button"
                                className="tool-meter-note is-full"
                                onClick={onPlans}
                            >
                                At your limit. See plans
                            </button>
                        ) : near ? (
                            <span className="tool-meter-note is-near">Near your limit</span>
                        ) : (
                            item.note && <span className="tool-meter-note">{item.note}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const productAllowances: Partial<Record<ToolPanel, UsageKey[]>> = {
    email: ['email.inboxes', 'resources.active', 'resources.storage'],
    webhooks: ['resources.active', 'resources.storage'],
    mocks: ['resources.active', 'resources.storage', 'mocks.oauth'],
    files: ['resources.storage', 'resources.active'],
    monitors: ['monitors.active'],
    memory: ['memory.bytes'],
    payments: ['resources.active', 'resources.storage'],
    vault: ['vault.entries'],
    authenticators: ['authenticators.entries'],
    automation: ['resources.active', 'resources.storage'],
    status: ['resources.active', 'resources.storage'],
};

function fullAllowances(panel: ToolPanel, usage: WorkspaceUsage) {
    return (usage.items ?? []).filter(
        (item) =>
            productAllowances[panel]?.includes(item.key) && item.max > 0 && item.used >= item.max,
    );
}

/** The New button of a tool page: one tool, or a short menu when the page covers several. */
export function ToolNew({
    panel,
    usage,
    onNew,
}: {
    panel: ToolPanel;
    usage: WorkspaceUsage;
    onNew: (toolId: string) => void;
}) {
    const full = fullAllowances(panel, usage);
    if (full.some(({ key }) => !['email.inboxes', 'mocks.oauth'].includes(key))) return null;
    const create = (panelInfo(panel).create ?? []) as string[];
    const tools = create
        .filter(
            (id) =>
                !full.some(
                    ({ key }) =>
                        (key === 'email.inboxes' && id === 'email-temporary-email-inbox') ||
                        (key === 'mocks.oauth' && id === 'mock-apis-mock-oauth-provider'),
                ),
        )
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
            <Meters items={readings(panel, usage)} onPlans={onPlans} />
            {!toolId &&
                usage.plan &&
                fullAllowances(panel, usage).map((item) => (
                    <LimitCard key={item.key} item={item} plan={usage.plan!} onPlans={onPlans} />
                ))}
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
                    const limit = readings(panel, usage)[0];
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
                            {main?.limit !== undefined && (
                                <UsageMeter
                                    label={main.label}
                                    used={main.used}
                                    limit={main.limit}
                                />
                            )}
                            <small>{main?.label ?? ''}</small>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
