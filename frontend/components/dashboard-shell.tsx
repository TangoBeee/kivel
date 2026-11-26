'use client';
import type { ReactNode } from 'react';
import { Button, DropdownMenu } from '@radix-ui/themes';
import {
    Toolbox,
    Key,
    ShieldCheck,
    CreditCard,
    Plus,
    CaretDown,
    WebhooksLogo,
    BracketsCurly,
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
        label: 'Getting started',
        description: 'Connect your agent and try your first tool.',
        icon: House,
    },
    {
        id: 'catalog',
        group: 'main',
        label: 'Catalog',
        description: 'Every tool your agents can call through one connection.',
        icon: SquaresFour,
    },
    {
        id: 'activity',
        group: 'main',
        label: 'Activity',
        description: 'Every call your agents made, newest first.',
        icon: Pulse,
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
        label: '2FA codes',
        description: 'Authenticator codes for accounts you let your agent use.',
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
