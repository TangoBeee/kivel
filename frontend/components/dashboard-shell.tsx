'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LiveLogo } from './live-logo';
import { siteOrigin } from '../lib/site';
import { Button, DropdownMenu } from '@radix-ui/themes';
import {
    Toolbox,
    Key,
    ShieldCheck,
    UsersThree,
    CreditCard,
    Plus,
    CaretDown,
    CaretUpDown,
    SignOut,
    UploadSimple,
    WebhooksLogo,
    BracketsCurly,
    Check,
    BookOpen,
    House,
    Robot,
    Pulse,
    GearSix,
    EnvelopeSimple,
    File,
    Database,
    Lightning,
    SquaresFour,
    ChartBar,
    ChatCircleDots,
} from '@phosphor-icons/react';
import type { UsageItem } from '@kivel.io/tools/plans';
import { categoryTints } from '../lib/catalog';
import type { Icon } from '@phosphor-icons/react';
import type { WorkspaceTone } from './workspace-ui';

const panelTones: Partial<Record<DashboardPanel, WorkspaceTone>> = {
    email: 'email',
    webhooks: 'webhooks',
    mocks: 'mocks',
    monitors: 'monitors',
    approvals: 'approvals',
};

type Section = {
    id: string;
    label: string;
    description: string;
    icon: Icon;
    /** Tool pages: the catalog category that gives the icon its colour. */
    category?: keyof typeof categoryTints;
    /** Resource kinds listed on the page. */
    kinds?: string[];
    /** Tools the page's New button can open. */
    create?: string[];
    group: 'main' | 'tools' | 'more' | 'settings';
};
// The sidebar, top to bottom. Tool pages list what you made with that tool and its limits.
export const dashboardPanels = [
    {
        id: 'overview',
        group: 'main',
        label: 'Home',
        description: 'What needs you, and how your tools are doing.',
        icon: House,
    },
    {
        id: 'catalog',
        group: 'main',
        label: 'Tools',
        description: 'Everything your agents can use. Open one to see what they made with it.',
        icon: SquaresFour,
    },
    {
        id: 'agents',
        group: 'main',
        label: 'Agents & keys',
        description: 'Who is connected, what they asked you and what they did.',
        icon: Robot,
    },
    {
        id: 'email',
        group: 'tools',
        label: 'Email',
        description: 'Real addresses your agents use to sign up, get codes and send mail.',
        icon: EnvelopeSimple,
        category: 'email',
        kinds: ['email'],
        create: ['email-temporary-email-inbox', 'email-mock-smtp'],
    },
    {
        id: 'webhooks',
        group: 'tools',
        label: 'Webhooks',
        description: 'URLs that catch any request, so you can see exactly what a service sends.',
        icon: WebhooksLogo,
        category: 'network',
        kinds: ['inbox'],
        create: ['webhooks'],
    },
    {
        id: 'mocks',
        group: 'tools',
        label: 'Mock APIs',
        description: 'Mock HTTP APIs, WebSocket servers, sign in providers and MCP servers.',
        icon: BracketsCurly,
        category: 'mock-apis',
        kinds: ['mock', 'mcp'],
        create: [
            'mock-apis-mock-rest-api',
            'mock-apis-graphql-mock',
            'mock-apis-mock-websocket-server',
            'mock-apis-stateful-crud-api',
            'mock-apis-mock-oauth-provider',
            'agents-mock-mcp-server',
            'agents-mock-llm-endpoint',
        ],
    },
    {
        id: 'files',
        group: 'tools',
        label: 'Files',
        description: 'Files you or your agents shared, behind private links that expire.',
        icon: File,
        category: 'files',
        kinds: ['file'],
        create: ['files-temporary-file-transfer'],
    },
    {
        id: 'monitors',
        group: 'tools',
        label: 'Monitors',
        description: 'Checks that email you when a site, certificate or cron job breaks.',
        icon: Pulse,
        category: 'monitoring',
    },
    {
        id: 'memory',
        group: 'tools',
        label: 'Memory',
        description: 'What your agents saved to remember between sessions.',
        icon: Database,
        category: 'databases',
    },
    {
        id: 'payments',
        group: 'tools',
        label: 'Payments (test)',
        kinds: ['mock'],
        description: 'Test wallets, x402 paywalls and checkouts with fake money.',
        icon: CreditCard,
        category: 'agents',
        create: ['agents-test-wallet', 'agents-test-x402-paywall', 'agents-test-checkout'],
    },
    {
        id: 'vault',
        group: 'tools',
        label: 'Credentials',
        create: ['agents-password-vault'],
        description: 'Account credentials, with a human approval before agents reveal passwords.',
        icon: Key,
        category: 'agents',
    },
    {
        id: 'authenticators',
        group: 'tools',
        label: 'Authenticators',
        description: 'Sign in codes your agents can use to sign in.',
        icon: ShieldCheck,
        category: 'agents',
    },
    {
        id: 'approvals',
        group: 'tools',
        label: 'Approvals',
        description: 'Review questions and actions that need your answer.',
        icon: ChatCircleDots,
    },
    {
        id: 'automation',
        group: 'tools',
        label: 'Scheduled jobs',
        description: 'Send scheduled requests and check their delivery history.',
        icon: Lightning,
        category: 'automation',
        kinds: ['job'],
        create: ['automation-temporary-scheduled-jobs'],
    },
    {
        id: 'status',
        group: 'tools',
        label: 'Status pages',
        description: 'Publish the current status of your services.',
        icon: Pulse,
        category: 'monitoring',
        kinds: ['status'],
        create: ['monitoring-public-status-page'],
    },
    {
        id: 'tools',
        group: 'more',
        label: 'Utilities',
        description: 'Run any tool here. Your agents run the same ones with run_tool.',
        icon: Toolbox,
    },
    {
        id: 'usage',
        group: 'more',
        label: 'Usage & billing',
        description: 'What your plan includes and how much of it you used.',
        icon: ChartBar,
    },
    {
        id: 'workspace',
        group: 'settings',
        label: 'Workspace',
        description: 'Your workspace, keys, plan and sign-in.',
        icon: GearSix,
    },
    {
        id: 'keys',
        group: 'settings',
        label: 'API keys',
        description: 'Your workspace, keys, plan and sign-in.',
        icon: Key,
    },
    {
        id: 'billing',
        group: 'settings',
        label: 'Plan',
        description: 'Your workspace, keys, plan and sign-in.',
        icon: CreditCard,
    },
    {
        id: 'security',
        group: 'settings',
        label: 'Security',
        description: 'Your workspace, keys, plan and sign-in.',
        icon: ShieldCheck,
    },
] as const satisfies readonly Section[];
export type DashboardPanel = (typeof dashboardPanels)[number]['id'];
export const panelInfo = (panel: DashboardPanel): Section =>
    dashboardPanels.find((item) => item.id === panel)!;
// Old links (#resources) land on the overview.
export const isDashboardPanel = (value: string): value is DashboardPanel =>
    dashboardPanels.some((item) => item.id === value);

// What "New" offers everywhere: the tool opens inside its dashboard page.
export const quickCreate: { panel: DashboardPanel; toolId: string; name: string; icon: Icon }[] = [
    {
        panel: 'email',
        toolId: 'email-temporary-email-inbox',
        name: 'Email inbox',
        icon: EnvelopeSimple,
    },
    { panel: 'webhooks', toolId: 'webhooks', name: 'Webhook URL', icon: WebhooksLogo },
    {
        panel: 'mocks',
        toolId: 'mock-apis-mock-rest-api',
        name: 'Mock API',
        icon: BracketsCurly,
    },
    {
        panel: 'files',
        toolId: 'files-temporary-file-transfer',
        name: 'Upload a file',
        icon: UploadSimple,
    },
    { panel: 'monitors', toolId: '', name: 'Monitor', icon: Pulse },
];

export function NewResourceMenu({
    onCreate,
}: {
    onCreate: (panel: DashboardPanel, toolId: string) => void;
}) {
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
                {quickCreate.map((item) => (
                    <DropdownMenu.Item
                        key={item.name}
                        onSelect={() => onCreate(item.panel, item.toolId)}
                    >
                        <item.icon size={16} />
                        {item.name}
                    </DropdownMenu.Item>
                ))}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

/** One settings block: what it is on the left, the controls on the right. */
export function SettingsSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="settings-section">
            <div className="settings-intro">
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            <div className="settings-card">{children}</div>
        </section>
    );
}

/** A labelled usage bar. */
export function Meter({
    label,
    value,
    max,
    display,
}: {
    label: string;
    value: number;
    max: number;
    display: string;
}) {
    const ratio = max > 0 ? Math.min(1, value / max) : 0;
    return (
        <div className="meter">
            <div className="meter-label">
                <span>{label}</span>
                <span>{display}</span>
            </div>
            <div
                className={`meter-track ${ratio > 0.85 ? 'is-high' : ''}`}
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={value}
            >
                <span style={{ width: `${Math.max(ratio * 100, value > 0 ? 3 : 0)}%` }} />
            </div>
        </div>
    );
}

export function AppShell({
    panel,
    onPanelChange,
    workspace,
    workspaces,
    onSwitchWorkspace,
    username,
    plan,
    role,
    onSignOut,
    busy,
    badges,
    runs,
    search,
    title,
    actions,
    children,
}: {
    panel: DashboardPanel;
    onPanelChange: (panel: DashboardPanel) => void;
    workspace: { id: string; name: string };
    workspaces: { id: string; name: string }[];
    onSwitchWorkspace: (id: string) => void;
    username: string;
    plan: string;
    role: string;
    onSignOut: () => void;
    busy: boolean;
    /** Usage next to each sidebar item, such as "1/1"; full ones are highlighted. */
    badges: Partial<Record<DashboardPanel, { text: string; full?: boolean; hidden?: boolean }>>;
    runs?: UsageItem;
    search: ReactNode;
    title?: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    const current = panelInfo(panel);
    const section = sectionOf(panel);
    const tabs: DashboardPanel[] =
        section === 'workspace'
            ? workspaceTabs
            : section === 'agents'
              ? ['agents', 'keys']
              : ['vault', 'authenticators'].includes(panel)
                ? ['vault', 'authenticators']
                : ['monitors', 'automation', 'status'].includes(panel)
                  ? ['monitors', 'automation', 'status']
                  : [];
    const go = (next: DashboardPanel) => onPanelChange(next);
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    const inTools = section === 'tools' && panel !== 'catalog';
    const userMenu = (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <button className="topnav-avatar" aria-label="Account menu">
                    {username[0]?.toUpperCase()}
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                <DropdownMenu.Label>{username}</DropdownMenu.Label>
                <DropdownMenu.Item onSelect={() => go('security')}>
                    <ShieldCheck size={16} />
                    Security
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                    <Link href={siteOrigin}>
                        <House size={16} />
                        Back to the site
                    </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                    <Link href={`${siteOrigin}/docs/`}>
                        <BookOpen size={16} />
                        Documentation
                    </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="red" disabled={busy} onSelect={onSignOut}>
                    <SignOut size={16} />
                    Sign out
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
    const workspaceMenu = (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <button
                    className="topnav-workspace"
                    aria-label={`Workspace: ${workspace.name}`}
                    disabled={busy}
                >
                    <small>{role}</small>
                    <strong>{workspace.name}</strong>
                    <CaretUpDown size={14} />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" className="dashboard-workspace-menu">
                <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
                {workspaces.map((space) => (
                    <DropdownMenu.Item
                        key={space.id}
                        onSelect={() => space.id !== workspace.id && onSwitchWorkspace(space.id)}
                    >
                        <span className="dashboard-workspace-option">{space.name}</span>
                        {space.id === workspace.id && <Check size={15} />}
                    </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => go('workspace')}>
                    <UsersThree size={16} />
                    Workspace settings
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => go('workspace')}>
                    <Plus size={16} />
                    Join with an invitation
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
    const sectionLinks = (className: string) => (
        <nav className={className} aria-label="Workspace sections">
            {topSections.map((entry) => {
                const active = section === entry.id;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => go(entry.panel)}
                    >
                        <entry.icon size={20} weight={active ? 'fill' : 'regular'} />
                        <span>{entry.label}</span>
                    </button>
                );
            })}
        </nav>
    );
    const pending = badges.approvals;
    return (
        <div className="dashboard-layout topnav-layout">
            <header className="topnav">
                <div className="topnav-start">
                    <Link href="/" className="topnav-brand" aria-label="Kivel home">
                        <LiveLogo size={26} />
                        <span>Kivel</span>
                    </Link>
                    {workspaceMenu}
                </div>
                {sectionLinks('topnav-sections')}
                <div className="topnav-end">
                    {search}
                    {runs && (
                        <button
                            type="button"
                            className="topnav-plan"
                            onClick={() => go('usage')}
                            title="Tool runs used today"
                        >
                            <span>{planName}</span>
                            <strong>
                                {runs.used.toLocaleString()} / {runs.max.toLocaleString()}
                            </strong>
                        </button>
                    )}
                    {userMenu}
                </div>
            </header>
            <div className="dashboard-main dashboard-content topnav-content">
                {panel === 'overview' ? (
                    actions && <div className="topnav-page-actions">{actions}</div>
                ) : (
                    <header key={`h-${panel}`} className="topnav-heading">
                        <div>
                            {inTools && (
                                <nav className="topnav-crumbs" aria-label="Breadcrumb">
                                    <button type="button" onClick={() => go('catalog')}>
                                        Tools
                                    </button>
                                    <span aria-hidden="true">/</span>
                                    <span aria-current="page">{current.label}</span>
                                </nav>
                            )}
                            <div className="topnav-title">
                                {(current.category || panelTones[panel]) && (
                                    <span
                                        className="nav-chip is-large"
                                        data-tone={panelTones[panel]}
                                        style={
                                            {
                                                '--tint': current.category
                                                    ? categoryTints[current.category]
                                                    : undefined,
                                            } as React.CSSProperties
                                        }
                                    >
                                        <current.icon size={19} />
                                    </span>
                                )}
                                <h1>{title ?? sectionTitle(panel)}</h1>
                            </div>
                            <p>{current.description}</p>
                        </div>
                        {actions && <div className="topnav-heading-actions">{actions}</div>}
                    </header>
                )}
                {tabs.length > 0 && (
                    <nav className="dashboard-tabs" aria-label="Section tabs">
                        {tabs.map((id) => (
                            <button
                                key={id}
                                aria-current={panel === id ? 'page' : undefined}
                                onClick={() => go(id)}
                            >
                                {tabLabel(id)}
                                {id === 'approvals' && pending && !pending.hidden && (
                                    <span className="nav-count">{pending.text}</span>
                                )}
                            </button>
                        ))}
                    </nav>
                )}
                <div key={panel} className="dashboard-panel-enter">
                    {children}
                </div>
            </div>
            {sectionLinks('topnav-mobile-tabs')}
        </div>
    );
}

/** The top level of the dashboard: a few sections instead of one long list. */
type TopSection = 'home' | 'tools' | 'agents' | 'workspace';
const topSections: { id: TopSection; label: string; panel: DashboardPanel; icon: Icon }[] = [
    { id: 'home', label: 'Home', panel: 'overview', icon: House },
    { id: 'tools', label: 'Tools', panel: 'catalog', icon: SquaresFour },
    { id: 'agents', label: 'Agents', panel: 'agents', icon: Robot },
    { id: 'workspace', label: 'Workspace', panel: 'usage', icon: GearSix },
];
const workspaceTabs: DashboardPanel[] = ['usage', 'billing', 'workspace', 'security'];
export function sectionOf(panel: DashboardPanel): TopSection {
    if (panel === 'overview') return 'home';
    if (panel === 'agents' || panel === 'keys') return 'agents';
    if (workspaceTabs.includes(panel)) return 'workspace';
    return 'tools';
}
const tabLabel = (panel: DashboardPanel) =>
    panel === 'workspace' ? 'Settings' : panel === 'usage' ? 'Usage' : panelInfo(panel).label;
const sectionTitle = (panel: DashboardPanel) =>
    sectionOf(panel) === 'workspace'
        ? 'Workspace'
        : sectionOf(panel) === 'agents'
          ? 'Agents'
          : panelInfo(panel).label;
