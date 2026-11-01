'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LiveLogo } from './live-logo';
import { SearchLaunch } from './toolbox-provider';
import { rememberReturn } from '../lib/return-path';
import { Button, DropdownMenu, IconButton } from '@radix-ui/themes';
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
    Plugs,
    Check,
    BookOpen,
    House,
    List,
    Robot,
    Pulse,
    X,
    GearSix,
    EnvelopeSimple,
    File,
    Database,
    Lightning,
    ChartBar,
} from '@phosphor-icons/react';
import { categoryTints } from '../lib/catalog';
import type { Icon } from '@phosphor-icons/react';

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
        label: 'Overview',
        description: 'What needs you, and how your tools are doing.',
        icon: House,
    },
    {
        id: 'agents',
        group: 'main',
        label: 'Agents',
        description: 'Who is connected, what they asked you and what they did.',
        icon: Robot,
    },
    {
        id: 'email',
        group: 'tools',
        label: 'Email inboxes',
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
        description: 'Fake APIs, sign-in providers and MCP servers for your tests.',
        icon: BracketsCurly,
        category: 'mock-apis',
        kinds: ['mock', 'mcp'],
        create: [
            'mock-apis-mock-rest-api',
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
        id: 'authenticators',
        group: 'tools',
        label: 'Authenticators',
        description: 'Two-factor codes your agents can use to sign in.',
        icon: ShieldCheck,
        category: 'agents',
    },
    {
        id: 'automation',
        group: 'tools',
        label: 'Jobs & status pages',
        description: 'Scheduled jobs and public status pages.',
        icon: Lightning,
        category: 'automation',
        kinds: ['job', 'status'],
        create: ['automation-temporary-scheduled-jobs', 'monitoring-public-status-page'],
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
        label: 'Usage & plan',
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
const settingsTabs: DashboardPanel[] = ['workspace', 'keys', 'billing', 'security'];
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

export function DashboardShell({
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
    search: ReactNode;
    title?: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    const current = panelInfo(panel);
    const settings = settingsTabs.includes(panel);
    const [navOpen, setNavOpen] = useState(false);
    useEffect(() => {
        if (!navOpen) return;
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false);
        addEventListener('keydown', onKey);
        return () => removeEventListener('keydown', onKey);
    }, [navOpen]);
    // Links to public pages offer a way back to this exact panel.
    function onLinkClick(event: React.MouseEvent) {
        const link = (event.target as Element).closest('a[href^="/tools/"]');
        if (!link) return;
        const target = new URL(link.getAttribute('href')!, location.origin).pathname;
        rememberReturn(target, location.pathname + location.hash, 'Back to dashboard');
    }
    const go = (next: DashboardPanel) => {
        onPanelChange(next);
        setNavOpen(false);
    };
    const item = (entry: Section) => {
        const active = entry.id === 'workspace' ? settings : panel === entry.id;
        const badge = badges[entry.id as DashboardPanel];
        if (badge?.hidden && !active) return null;
        return (
            <button
                key={entry.id}
                aria-current={active ? 'page' : undefined}
                onClick={() => go(entry.id as DashboardPanel)}
            >
                {entry.category ? (
                    <span
                        className="nav-chip"
                        style={{ '--tint': categoryTints[entry.category] } as React.CSSProperties}
                    >
                        <entry.icon size={13} />
                    </span>
                ) : (
                    <entry.icon size={18} weight={active ? 'fill' : 'regular'} />
                )}
                {entry.id === 'workspace' ? 'Settings' : entry.label}
                {badge && !badge.hidden && (
                    <span className={`nav-count ${badge.full ? 'is-full' : ''}`}>{badge.text}</span>
                )}
            </button>
        );
    };
    const group = (name: Section['group']) =>
        (dashboardPanels as readonly Section[]).filter((entry) => entry.group === name).map(item);
    return (
        <div
            className={`dashboard-layout ${navOpen ? 'is-nav-open' : ''}`}
            onClickCapture={onLinkClick}
        >
            <aside className="dashboard-sidebar" aria-label="Dashboard">
                <div className="dashboard-sidebar-top">
                    <Link href="/" className="dashboard-brand">
                        <LiveLogo size={26} />
                        <span>
                            socket<span className="island-dot">.</span>help
                        </span>
                    </Link>
                    <IconButton
                        className="dashboard-close"
                        variant="ghost"
                        color="gray"
                        aria-label="Close navigation"
                        onClick={() => setNavOpen(false)}
                    >
                        <X size={18} />
                    </IconButton>
                </div>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        <button className="dashboard-workspace" disabled={busy}>
                            <span className="dashboard-workspace-mark">
                                {workspace.name[0]?.toUpperCase()}
                            </span>
                            <span>
                                <strong>{workspace.name}</strong>
                                <small>
                                    {plan[0]!.toUpperCase() + plan.slice(1)} plan · {role}
                                </small>
                            </span>
                            <CaretUpDown size={16} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" className="dashboard-workspace-menu">
                        <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
                        {workspaces.map((space) => (
                            <DropdownMenu.Item
                                key={space.id}
                                onSelect={() =>
                                    space.id !== workspace.id && onSwitchWorkspace(space.id)
                                }
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
                {search}
                <nav className="dashboard-nav" aria-label="Workspace sections">
                    {group('main')}
                    <p className="nav-group">Your tools</p>
                    {group('tools')}
                    <p className="nav-group">Everything else</p>
                    {group('more')}
                    {item(dashboardPanels.find((entry) => entry.id === 'workspace')!)}
                </nav>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        <button className="dashboard-user" aria-label="Account menu">
                            <span className="dashboard-user-avatar">
                                {username[0]?.toUpperCase()}
                            </span>
                            <span>
                                <strong>{username}</strong>
                                <small>Signed in</small>
                            </span>
                            <CaretUpDown size={16} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" side="top">
                        <DropdownMenu.Label>{username}</DropdownMenu.Label>
                        <DropdownMenu.Item onSelect={() => go('security')}>
                            <ShieldCheck size={16} />
                            Security
                        </DropdownMenu.Item>
                        <DropdownMenu.Item asChild>
                            <Link href="/">
                                <House size={16} />
                                Back to the site
                            </Link>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item asChild>
                            <Link href="/docs/">
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
            </aside>
            <button
                className="dashboard-scrim"
                aria-label="Close navigation"
                tabIndex={navOpen ? 0 : -1}
                onClick={() => setNavOpen(false)}
            />
            <div className="dashboard-main">
                <div className="dashboard-topbar">
                    <IconButton
                        className="dashboard-menu"
                        variant="ghost"
                        color="gray"
                        aria-label="Open navigation"
                        aria-expanded={navOpen}
                        onClick={() => setNavOpen(true)}
                    >
                        <List size={20} />
                    </IconButton>
                    <span className="dashboard-breadcrumb">
                        {current.group === 'tools' && (
                            <>
                                <span>Your tools</span>
                                <span aria-hidden="true">/</span>
                            </>
                        )}
                        <strong>{settings ? 'Settings' : current.label}</strong>
                    </span>
                    <div className="dashboard-topbar-actions">
                        <Link className="dashboard-topbar-link" href="/docs/">
                            <BookOpen size={16} />
                            Docs
                        </Link>
                        <Link className="dashboard-topbar-link" href="/connect/">
                            <Plugs size={16} />
                            Connect an agent
                        </Link>
                    </div>
                </div>
                <div className="dashboard-content">
                    <header key={`h-${panel}`} className="dashboard-heading">
                        <div className="dashboard-heading-title">
                            {current.category && (
                                <span
                                    className="nav-chip is-large"
                                    style={
                                        {
                                            '--tint': categoryTints[current.category],
                                        } as React.CSSProperties
                                    }
                                >
                                    <current.icon size={19} />
                                </span>
                            )}
                            <div>
                                <h1>{title ?? (settings ? 'Settings' : current.label)}</h1>
                                <p>{current.description}</p>
                            </div>
                        </div>
                        {actions}
                    </header>
                    {settings && (
                        <nav className="dashboard-tabs" aria-label="Settings">
                            {settingsTabs.map((id) => (
                                <button
                                    key={id}
                                    aria-current={panel === id ? 'page' : undefined}
                                    onClick={() => go(id)}
                                >
                                    {panelInfo(id).label}
                                </button>
                            ))}
                        </nav>
                    )}
                    <div key={panel} className="dashboard-panel-enter">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
