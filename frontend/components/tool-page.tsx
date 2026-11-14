'use client';
import { DropdownMenu, Button } from '@radix-ui/themes';
import { ArrowLeft, CaretDown, Plus } from '@phosphor-icons/react';
import { catalog } from '../lib/catalog';
import type { WorkspaceUsage } from '../lib/workspace-usage';
import { formatBytes } from '../lib/workspace-usage';
import { panelInfo } from './dashboard-shell';
import type { DashboardPanel } from './dashboard-shell';
import { resourceTool } from './dashboard-resources';
import type { Resource } from './dashboard-resources';
import { ToolWorkbench } from './tool-workbench';
import { DashboardToolSnippets } from './dashboard-tool-snippets';
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

type Reading = { label: string; used: number; limit: number; show: string; note?: string };

const productAllowances: Record<ToolPanel, UsageKey[]> = {
    email: [
        'email.inboxes',
        'email.storage',
        'smtp.active',
        'smtp.storage',
        'email.sent_today',
        'email.sent_month',
    ],
    webhooks: ['webhooks.active', 'webhooks.storage'],
    mocks: ['mocks.active', 'mocks.storage', 'mocks.oauth'],
    files: ['files.active', 'files.storage'],
    monitors: ['monitors.active'],
    memory: ['memory.bytes'],
    payments: ['payments.active', 'payments.storage'],
    vault: ['vault.entries'],
    authenticators: ['authenticators.entries'],
    automation: ['jobs.active', 'jobs.storage'],
    status: ['status.active', 'status.storage'],
};

export function readings(panel: ToolPanel, usage: WorkspaceUsage): Reading[] {
    return productAllowances[panel].flatMap((key) => {
        const item = usage.items?.find((entry) => entry.key === key);
        if (!item) return [];
        const format =
            item.unit === 'bytes' ? formatBytes : (value: number) => value.toLocaleString();
        return [
            {
                label: item.label,
                used: item.used,
                limit: item.max,
                show: `${format(item.used)} / ${format(item.max)}`,
                note: item.resetsAt
                    ? `Resets ${new Date(item.resetsAt).toLocaleString()}`
                    : undefined,
            },
        ];
    });
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

function fullAllowances(panel: ToolPanel, usage: WorkspaceUsage) {
    return (usage.items ?? []).filter(
        (item) =>
            productAllowances[panel].includes(item.key) &&
            !item.key.startsWith('email.sent_') &&
            item.max > 0 &&
            item.used >= item.max,
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
    if (
        full.some(
            ({ key }) =>
                ![
                    'email.inboxes',
                    'email.storage',
                    'smtp.active',
                    'smtp.storage',
                    'mocks.oauth',
                ].includes(key),
        )
    )
        return null;
    const create = (panelInfo(panel).create ?? []) as string[];
    const tools = create
        .filter(
            (id) =>
                !full.some(
                    ({ key }) =>
                        (['email.inboxes', 'email.storage'].includes(key) &&
                            id === 'email-temporary-email-inbox') ||
                        (key.startsWith('smtp.') && id === 'email-mock-smtp') ||
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
    const tool = catalog.find((entry) => entry.id === toolId);
    return (
        <div className="dashboard-embed">
            {onBack && (
                <button type="button" className="dashboard-back" onClick={onBack}>
                    <ArrowLeft size={14} />
                    {backLabel}
                </button>
            )}
            {tool && onBack && (
                <div className="dashboard-workbench-heading">
                    <h2>{tool.name}</h2>
                    <p>{tool.description}</p>
                </div>
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
    details,
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
    details?: (resource: Resource) => React.ReactNode;
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
                <>
                    <EmbeddedTool
                        key={`${open.resource ?? ''}-${toolId}`}
                        toolId={toolId}
                        backLabel={`Back to ${info.label}`}
                        onBack={onBack}
                    />
                    {opened && details?.(opened)}
                </>
            ) : (
                <>
                    {list}
                    {children}
                </>
            )}
            <DashboardToolSnippets panel={panel} resource={opened} />
        </div>
    );
}
