'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from './logo';
import { SearchLaunch } from './toolbox-provider';
import { rememberReturn } from '../lib/return-path';
import { Badge, Button, DropdownMenu, IconButton } from '@radix-ui/themes';
import {
    SquaresFour,
    Toolbox,
    FolderSimple,
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
} from '@phosphor-icons/react';

export const dashboardPanels = [
    {
        id: 'overview',
        group: 'Build',
        label: 'Overview',
        description: 'Your agents, what they need from you, and your usage.',
        icon: SquaresFour,
    },
    {
        id: 'tools',
        group: 'Build',
        label: 'Tools',
        description: 'Launch any available tool or create a resource.',
        icon: Toolbox,
    },
    {
        id: 'resources',
        group: 'Build',
        label: 'Resources',
        description: 'Manage the endpoints and files you create.',
        icon: FolderSimple,
    },
    {
        id: 'keys',
        group: 'Build',
        label: 'API keys',
        description: 'Connect your scripts, CLI, SDK, and agents.',
        icon: Key,
    },
    {
        id: 'monitors',
        group: 'Build',
        label: 'Monitors',
        description: 'Uptime, SSL and cron job heartbeats with alerts.',
        icon: Pulse,
    },
    {
        id: 'agents',
        group: 'Build',
        label: 'Agents',
        description: 'The agents connected to this workspace and what they did.',
        icon: Robot,
    },
    {
        id: 'workspace',
        group: 'Settings',
        label: 'Workspace',
        description: 'Name, members, and invitations.',
        icon: UsersThree,
    },
    {
        id: 'security',
        group: 'Settings',
        label: 'Security',
        description: 'Recovery email, password reset, and sign in.',
        icon: ShieldCheck,
    },
    {
        id: 'billing',
        group: 'Settings',
        label: 'Plan & billing',
        description: 'Your plan, allowances, and subscriptions.',
        icon: CreditCard,
    },
] as const;
export type DashboardPanel = (typeof dashboardPanels)[number]['id'];
export const isDashboardPanel = (value: string): value is DashboardPanel =>
    dashboardPanels.some((item) => item.id === value);

export const quickCreate = [
    {
        href: '/tools/temporary-file-transfer/',
        name: 'Upload a file',
        description: 'Share it privately or publicly.',
        icon: UploadSimple,
    },
    {
        href: '/tools/webhook-inbox/',
        name: 'Webhook inbox',
        description: 'Catch and inspect callbacks.',
        icon: WebhooksLogo,
    },
    {
        href: '/tools/mock-rest-api/',
        name: 'Mock REST API',
        description: 'Serve test responses.',
        icon: BracketsCurly,
    },
    {
        href: '/tools/mock-mcp-server/',
        name: 'Mock MCP server',
        description: 'Give an agent a sandbox.',
        icon: Plugs,
    },
];

export function NewResourceMenu() {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <Button size="2">
                    <Plus size={16} />
                    New resource
                    <CaretDown size={14} />
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                {quickCreate.map((item) => (
                    <DropdownMenu.Item asChild key={item.href}>
                        <Link href={item.href}>
                            <item.icon size={16} />
                            {item.name}
                        </Link>
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
    usage,
    onSignOut,
    busy,
    title,
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
    usage: {
        resources: number;
        maxResources: number;
        storedLabel: string;
        storedBytes: number;
        storageBytes: number;
    };
    onSignOut: () => void;
    busy: boolean;
    title?: string;
    children: ReactNode;
}) {
    const current = dashboardPanels.find((item) => item.id === panel)!;
    const [navOpen, setNavOpen] = useState(false);
    useEffect(() => {
        if (!navOpen) return;
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false);
        addEventListener('keydown', onKey);
        return () => removeEventListener('keydown', onKey);
    }, [navOpen]);
    // Tools opened from here offer a way back to this exact panel.
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
    const groups = ['Build', 'Settings'] as const;
    return (
        <div
            className={`dashboard-layout ${navOpen ? 'is-nav-open' : ''}`}
            onClickCapture={onLinkClick}
        >
            <aside className="dashboard-sidebar" aria-label="Dashboard">
                <div className="dashboard-sidebar-top">
                    <Link href="/" className="dashboard-brand">
                        <LogoMark size={28} />
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
                                    {plan} plan · {role}
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
                <nav className="dashboard-nav" aria-label="Workspace sections">
                    {groups.map((group) => (
                        <div key={group} className="dashboard-nav-group">
                            <span className="dashboard-nav-label">{group}</span>
                            {dashboardPanels
                                .filter((item) => item.group === group)
                                .map((item) => (
                                    <button
                                        key={item.id}
                                        aria-current={panel === item.id ? 'page' : undefined}
                                        onClick={() => go(item.id)}
                                    >
                                        <item.icon
                                            size={18}
                                            weight={panel === item.id ? 'fill' : 'regular'}
                                        />
                                        {item.label}
                                    </button>
                                ))}
                        </div>
                    ))}
                </nav>
                <div className="dashboard-usage">
                    <div className="dashboard-usage-head">
                        <Badge color="green" variant="soft">
                            {plan} plan
                        </Badge>
                        <button onClick={() => go('billing')}>Compare plans</button>
                    </div>
                    <Meter
                        label="Resources"
                        value={usage.resources}
                        max={usage.maxResources}
                        display={`${usage.resources} / ${usage.maxResources || '-'}`}
                    />
                    <Meter
                        label="Storage"
                        value={usage.storedBytes}
                        max={usage.storageBytes}
                        display={usage.storedLabel}
                    />
                </div>
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
                        <span>{workspace.name}</span>
                        <span aria-hidden="true">/</span>
                        <strong>{current.label}</strong>
                    </span>
                    <div className="dashboard-topbar-actions">
                        <SearchLaunch compact />
                        <IconButton asChild variant="ghost" color="gray" aria-label="Documentation">
                            <Link href="/docs/">
                                <BookOpen size={18} />
                            </Link>
                        </IconButton>
                    </div>
                </div>
                <div className="dashboard-content">
                    <header className="dashboard-heading">
                        <div>
                            <h1>{title ?? current.label}</h1>
                            <p>{current.description}</p>
                        </div>
                        {(panel === 'overview' || panel === 'resources' || panel === 'tools') && (
                            <NewResourceMenu />
                        )}
                    </header>
                    {children}
                </div>
            </div>
        </div>
    );
}
