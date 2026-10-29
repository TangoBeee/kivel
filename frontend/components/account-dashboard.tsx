'use client';
import { AppSelect, SelectOption } from './app-select';
import {
    Button,
    TextField,
    IconButton,
    DropdownMenu,
    Dialog,
    AlertDialog,
    Tabs,
    Badge,
} from '@radix-ui/themes';
import {
    FolderSimple,
    HardDrives,
    Lightning,
    MagnifyingGlass,
    ArrowsClockwise,
    DotsThree,
    ArrowUpRight,
    File,
    WebhooksLogo,
    EnvelopeSimple,
    BracketsCurly,
    Plugs,
    ShieldCheck,
    ArrowRight,
    Check,
    Key as KeyIcon,
    UsersThree,
    WarningCircle,
} from '@phosphor-icons/react';
import { DashboardShell, isDashboardPanel, Meter, SettingsSection } from './dashboard-shell';
import { DashboardTools, RecentTools, SavedTools } from './dashboard-tools';
import { LogoMark } from './logo';
import { AgentActivity } from './agent-activity';
import { AgentOverview } from './agent-overview';
import { MonitorsPanel } from './monitors-panel';
import { refreshViewer } from '../lib/viewer';
import type { DashboardPanel } from './dashboard-shell';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { catalog, toolPageHref } from '../lib/catalog';
import { PasswordRecovery, AccountSecurity } from './account-security';
import { clearPrivateSession } from '../lib/private-session';
import { api, ApiError } from '../lib/api';
import { SharingControl } from './sharing-control';
import type { Visibility } from './sharing-control';
import { RemoteFilePreview } from './file-preview';
import { ResultPreview } from './result-preview';
import { CopyButton } from './copy-button';
type Session = {
    user: { username: string };
    account: { id: string; name: string; effectivePlan: string; planValidUntil: string | null };
    role: string;
    scopes: string[];
};
type Key = { id: string; name: string; prefix: string; scopes: string[]; expiresAt: string };
type Resource = {
    toolId?: string;
    id: string;
    kind: 'inbox' | 'mock' | 'file' | 'mcp' | 'email';
    visibility: Visibility;
    name?: string;
    expiresAt: string;
    persistent: boolean;
    storedBytes: number;
    available?: boolean;
};
const paths = {
    inbox: 'inboxes',
    mock: 'mocks',
    file: 'files',
    mcp: 'mcp-servers',
    email: 'email-inboxes',
};
const resourceTools = {
    inbox: 'webhooks',
    mock: 'mock-apis-mock-rest-api',
    file: 'files-temporary-file-transfer',
    mcp: 'agents-mock-mcp-server',
    email: 'email-temporary-email-inbox',
};
const formatBytes = (value: number) =>
    value < 1048576 ? `${Math.ceil(value / 1024)} KiB` : `${(value / 1048576).toFixed(1)} MiB`;
const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
async function json(path: string, method = 'GET', body?: unknown) {
    const response = await api(path, {
        method,
        ...(body !== undefined
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
    });
    return response.status === 204 ? undefined : response.json();
}
export function AccountDashboard({ glyphs = {} }: { glyphs?: Record<string, React.ReactNode> }) {
    const [panel, setPanel] = useState<DashboardPanel>('overview');
    const [resourceQuery, setResourceQuery] = useState(''),
        [resourceKind, setResourceKind] = useState('all'),
        [deleteTarget, setDeleteTarget] = useState<Resource | null>(null),
        [recoveryEmail, setRecoveryEmail] = useState<{
            email: string | null;
            verifiedAt: string | null;
        }>({ email: null, verifiedAt: null });
    const [session, setSession] = useState<Session | null>(null),
        [loading, setLoading] = useState(true),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('');
    const [recovering, setRecovering] = useState(false),
        [emailEnabled, setEmailEnabled] = useState(false);
    const [mode, setMode] = useState<'login' | 'register'>('login'),
        [keys, setKeys] = useState<Key[]>([]),
        [secret, setSecret] = useState(''),
        [resources, setResources] = useState<Resource[]>([]),
        [usage, setUsage] = useState<{
            runsToday: number;
            limits: { runsPerDay: number; maxResources: number; storageBytes: number };
        } | null>(null);
    const [billing, setBilling] = useState<{
            enabled: boolean;
            prices: {
                plan: string;
                amount: number;
                currency: string;
                interval: string;
                intervalCount: number;
            }[];
        }>({ enabled: false, prices: [] }),
        [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]),
        [members, setMembers] = useState<{ userId: string; username: string; role: string }[]>([]),
        [detail, setDetail] = useState('');
    const [selectedResource, setSelectedResource] = useState<Resource | null>(null),
        [sharedAccess, setSharedAccess] = useState('');
    // Outcome of a Dodo checkout redirect. The plan itself only changes once the signed webhook lands.
    const [checkout, setCheckout] = useState<
        'activating' | 'active' | 'delayed' | 'failed' | 'cancelled' | null
    >(null);
    async function refresh() {
        try {
            const account = await json('/api/account');
            setSession(account);
            const [keyData, resourceData, meter, bill, spaces, people, recovery] =
                await Promise.all([
                    json('/api/account/keys'),
                    account.scopes.includes('resources:read')
                        ? json('/api/account/resources')
                        : Promise.resolve({ resources: [] }),
                    json('/api/usage'),
                    json('/api/billing').catch(() => ({ enabled: false, prices: [] })),
                    json('/api/account/workspaces'),
                    json('/api/account/members'),
                    json('/api/account/recovery'),
                ]);
            setKeys(keyData.keys);
            setResources(resourceData.resources);
            setUsage(meter);
            setBilling(bill);
            setWorkspaces(spaces.workspaces);
            setMembers(people.members);
            setRecoveryEmail(recovery);
        } catch (failure) {
            if (failure instanceof ApiError && failure.status === 401) {
                setSession(null);
                setSecret('');
                setDetail('');
                setSelectedResource(null);
                setSharedAccess('');
            } else
                setError(
                    failure instanceof Error ? failure.message : 'Unable to load your workspace.',
                );
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        const applyHash = () => {
            const hash = location.hash.slice(1);
            if (isDashboardPanel(hash)) setPanel(hash);
            if (hash === 'register') setMode('register');
            if (hash === 'signin') setMode('login');
        };
        const query = new URLSearchParams(location.search),
            returned = query.get('billing'),
            // Dodo appends the checkout status to the return URL; anything but a live or pending subscription failed.
            status = query.get('status');
        if (returned === 'returned' || returned === 'cancelled') {
            setCheckout(
                returned === 'cancelled'
                    ? 'cancelled'
                    : status && !['active', 'succeeded', 'processing', 'pending'].includes(status)
                      ? 'failed'
                      : 'activating',
            );
            history.replaceState(null, '', `${location.pathname}#billing`);
        }
        applyHash();
        addEventListener('hashchange', applyHash);
        void refresh();
        void api('/api/auth/recovery')
            .then((response) => response.json())
            .then((value) => setEmailEnabled(value.enabled))
            .catch(() => {});
        return () => removeEventListener('hashchange', applyHash);
    }, []);
    const plan = session?.account.effectivePlan ?? 'free',
        subscribed = plan === 'pro' || plan === 'team',
        planName = plan[0]!.toUpperCase() + plan.slice(1),
        signedIn = !!session;
    useEffect(() => {
        if (checkout !== 'activating' || !signedIn) return;
        if (subscribed) {
            setCheckout('active');
            refreshViewer();
            return;
        }
        // The webhook usually lands within seconds of the redirect; check for about half a minute.
        let tries = 0;
        const timer = setInterval(() => {
            if (++tries > 15) {
                clearInterval(timer);
                setCheckout('delayed');
            } else void refresh();
        }, 2000);
        return () => clearInterval(timer);
    }, [checkout, signedIn, subscribed]);
    // Refreshing updates the data in place; only the refresh icon shows that it is working.
    const [refreshing, setRefreshing] = useState(false);
    async function reload() {
        setRefreshing(true);
        try {
            await refresh();
        } finally {
            setRefreshing(false);
        }
    }
    async function action(work: () => Promise<void>) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await work();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Request failed.');
        } finally {
            setBusy(false);
        }
    }
    async function authenticate(form: HTMLFormElement) {
        const data = new FormData(form);
        await action(async () => {
            await json(`/api/auth/${mode}`, 'POST', {
                username: data.get('username'),
                password: data.get('password'),
                ...(mode === 'register' ? { email: data.get('email') } : {}),
            });
            form.reset();
            await refresh();
            refreshViewer();
            // Pages such as the agent approval page send people here to sign in, then take them back.
            try {
                const next = sessionStorage.getItem('socket-help:after-signin');
                sessionStorage.removeItem('socket-help:after-signin');
                if (next?.startsWith('/') && !next.startsWith('//')) {
                    location.assign(next);
                    return;
                }
            } catch {}
            if (mode === 'register')
                setNotice(
                    emailEnabled
                        ? 'Account created. Check your email and verify the code in Account security.'
                        : 'Account created. Your email is saved; email delivery must be configured before verification.',
                );
        });
    }
    function changePanel(next: DashboardPanel) {
        setPanel(next);
        history.replaceState(null, '', next === 'overview' ? location.pathname : `#${next}`);
        setError('');
        setNotice('');
    }
    function closeDetail() {
        setDetail('');
        setSelectedResource(null);
        setSharedAccess('');
    }
    async function inspect(resource: Resource) {
        await action(async () => {
            const value = await json(
                `/api/${paths[resource.kind]}/${resource.id}${resource.kind === 'inbox' ? '/requests' : ''}`,
            );
            setSelectedResource({ ...resource, name: value.name });
            setSharedAccess('');
            setDetail(JSON.stringify(value, null, 2));
        });
    }
    function renew(resource: Resource, persistent = resource.persistent) {
        void action(async () => {
            await json(`/api/${paths[resource.kind]}/${resource.id}/renew`, 'POST', { persistent });
            await refresh();
            setNotice('Retention updated.');
        });
    }
    function signOut() {
        void action(async () => {
            await json('/api/auth/logout', 'POST');
            clearPrivateSession();
            setSession(null);
            setSecret('');
            closeDetail();
            setPanel('overview');
            history.replaceState(null, '', location.pathname);
            refreshViewer();
        });
    }
    function switchWorkspace(accountId: string) {
        void action(async () => {
            await json('/api/account/workspace', 'POST', { accountId });
            clearPrivateSession();
            setSecret('');
            setDetail('');
            setSelectedResource(null);
            setSharedAccess('');
            await refresh();
            refreshViewer();
        });
    }
    const storedBytes = resources.reduce((sum, item) => sum + item.storedBytes, 0);
    const filteredResources = resources.filter(
        (item) =>
            (resourceKind === 'all' || item.kind === resourceKind) &&
            `${item.name ?? ''} ${item.kind} ${item.id}`
                .toLowerCase()
                .includes(resourceQuery.toLowerCase()),
    );
    const visibleResources = panel === 'overview' ? resources.slice(0, 5) : filteredResources;
    const resourceNames = {
        inbox: 'Webhook inbox',
        file: 'File',
        mock: 'Mock API',
        mcp: 'MCP server',
        email: 'Email inbox',
    };
    const bar = (value: number, max: number) => (
        <span className="metric-bar" aria-hidden="true">
            <span
                style={{
                    width: `${max > 0 ? Math.min(100, Math.max((value / max) * 100, value > 0 ? 3 : 0)) : 0}%`,
                }}
            />
        </span>
    );
    const resourceIcons = {
        inbox: WebhooksLogo,
        file: File,
        mock: BracketsCurly,
        mcp: Plugs,
        email: EnvelopeSimple,
    };
    const messages = (
        <>
            {error && (
                <p className="account-message error" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="account-message" role="status">
                    {notice}
                </p>
            )}
        </>
    );
    if (loading)
        return (
            <div className="dashboard-skeleton" role="status" aria-label="Loading your workspace">
                <div className="dashboard-skeleton-side">
                    <span className="skeleton" style={{ width: 140, height: 24 }} />
                    <span className="skeleton" style={{ height: 52 }} />
                    {[0, 1, 2, 3, 4].map((item) => (
                        <span key={item} className="skeleton" style={{ height: 32 }} />
                    ))}
                </div>
                <div className="dashboard-skeleton-main">
                    <span className="skeleton" style={{ width: 160, height: 36 }} />
                    <span className="skeleton" style={{ width: 320, height: 16 }} />
                    <span className="skeleton" style={{ height: 76 }} />
                    <span className="skeleton" style={{ height: 180 }} />
                    <span className="skeleton" style={{ height: 220 }} />
                </div>
            </div>
        );
    return (
        <div className={`page-width ${session ? 'dashboard-page' : 'account-page'}`}>
            {!session ? (
                <>
                    <div className="auth-layout">
                        <figure className="auth-art">
                            <img
                                src="/art/klint-childhood.webp"
                                alt="Hilma af Klint, The Ten Largest, No. 1, Childhood, 1907."
                                width={1275}
                                height={1690}
                            />
                        </figure>
                        <div className="auth-main">
                            <header className="auth-heading">
                                <h1>
                                    {recovering
                                        ? 'Let’s get you back in.'
                                        : mode === 'register'
                                          ? 'Create your account'
                                          : 'Sign in'}
                                </h1>
                                <p>
                                    {recovering
                                        ? 'Reset your password with a code sent to your recovery email.'
                                        : mode === 'register'
                                          ? 'Free for 3 agents. No card needed.'
                                          : 'Welcome back to socket.help.'}
                                </p>
                            </header>
                            {messages}
                            {recovering ? (
                                <PasswordRecovery
                                    onBack={() => {
                                        setRecovering(false);
                                        setMode('login');
                                        setError('');
                                        setNotice('');
                                    }}
                                />
                            ) : (
                                <section className="account-card account-auth-card">
                                    <div className="account-tabs">
                                        <button
                                            aria-pressed={mode === 'login'}
                                            onClick={() => {
                                                setMode('login');
                                                setError('');
                                                setNotice('');
                                                history.replaceState(null, '', location.pathname);
                                            }}
                                        >
                                            Sign in
                                        </button>
                                        <button
                                            aria-pressed={mode === 'register'}
                                            onClick={() => {
                                                setMode('register');
                                                setError('');
                                                setNotice('');
                                                history.replaceState(null, '', '#register');
                                            }}
                                        >
                                            Create account
                                        </button>
                                    </div>
                                    <form
                                        className="account-form"
                                        key={mode}
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void authenticate(event.currentTarget);
                                        }}
                                    >
                                        <label>
                                            Username
                                            <TextField.Root
                                                size="3"
                                                name="username"
                                                autoComplete="username"
                                                pattern="[a-z0-9][a-z0-9_.-]{2,31}"
                                                minLength={3}
                                                maxLength={32}
                                                required
                                            />
                                        </label>
                                        {mode === 'register' && (
                                            <label>
                                                Email
                                                <TextField.Root
                                                    size="3"
                                                    type="email"
                                                    name="email"
                                                    autoComplete="email"
                                                    maxLength={254}
                                                    required
                                                />
                                            </label>
                                        )}
                                        <label>
                                            Password
                                            <TextField.Root
                                                size="3"
                                                type="password"
                                                name="password"
                                                autoComplete={
                                                    mode === 'login'
                                                        ? 'current-password'
                                                        : 'new-password'
                                                }
                                                minLength={12}
                                                maxLength={256}
                                                required
                                            />
                                        </label>
                                        {mode === 'register' && (
                                            <p className="account-form-note">
                                                Use at least 12 characters. Usernames are lowercase.
                                                {emailEnabled
                                                    ? ' Verify your email after creating your account.'
                                                    : ''}
                                            </p>
                                        )}
                                        <button
                                            className="button button-primary"
                                            disabled={busy}
                                            type="submit"
                                        >
                                            {busy && <ArrowsClockwise size={16} className="spin" />}
                                            {busy
                                                ? mode === 'login'
                                                    ? 'Signing in…'
                                                    : 'Creating your account…'
                                                : mode === 'login'
                                                  ? 'Sign in'
                                                  : 'Create free account'}
                                        </button>
                                    </form>
                                    {mode === 'login' && (
                                        <button
                                            className="text-link account-forgot"
                                            onClick={() => {
                                                setRecovering(true);
                                                setError('');
                                                setNotice('');
                                            }}
                                        >
                                            Forgot password?
                                        </button>
                                    )}
                                </section>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <DashboardShell
                    panel={panel}
                    onPanelChange={changePanel}
                    workspace={{ id: session.account.id, name: session.account.name }}
                    workspaces={workspaces}
                    onSwitchWorkspace={switchWorkspace}
                    username={session.user.username}
                    plan={session.account.effectivePlan}
                    role={session.role}
                    onSignOut={signOut}
                    busy={busy}
                >
                    {messages}
                    {panel === 'overview' && (
                        <>
                            <AgentOverview
                                onOpen={changePanel}
                                plan={planName}
                                resources={resources.length}
                                maxResources={usage?.limits.maxResources ?? 0}
                            />
                            {!recoveryEmail.verifiedAt && (
                                <div className="dashboard-security-note">
                                    <ShieldCheck size={22} />
                                    <div>
                                        <strong>
                                            {recoveryEmail.email
                                                ? 'Verify your email'
                                                : 'Add a recovery email'}
                                        </strong>
                                        <p>
                                            {recoveryEmail.email
                                                ? `Recovery email: ${recoveryEmail.email}`
                                                : 'Keep access to your account if you forget your password.'}
                                        </p>
                                    </div>
                                    <Button variant="soft" onClick={() => changePanel('security')}>
                                        Review
                                        <ArrowRight size={15} />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {panel === 'tools' && <DashboardTools glyphs={glyphs} />}
                    {(panel === 'overview' || panel === 'resources') && (
                        <section className="account-card dashboard-resources">
                            <div className="account-section-heading">
                                <div>
                                    <h2>
                                        {panel === 'overview'
                                            ? 'Recent resources'
                                            : 'All resources'}
                                        <Badge variant="soft" color="gray">
                                            {resources.length}
                                        </Badge>
                                    </h2>
                                    <p>
                                        Your temporary files and endpoints, ready when you need
                                        them.
                                    </p>
                                </div>
                                <div className="dashboard-section-actions">
                                    {panel === 'overview' && resources.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            onClick={() => changePanel('resources')}
                                        >
                                            View all
                                        </Button>
                                    )}
                                    <IconButton
                                        aria-label={
                                            refreshing
                                                ? 'Refreshing resources'
                                                : 'Refresh resources'
                                        }
                                        variant="ghost"
                                        color="gray"
                                        disabled={refreshing}
                                        onClick={() => void reload()}
                                    >
                                        <ArrowsClockwise
                                            size={18}
                                            className={refreshing ? 'spin' : undefined}
                                        />
                                    </IconButton>
                                </div>
                            </div>
                            {panel === 'resources' && (
                                <div className="dashboard-resource-filters">
                                    <TextField.Root
                                        placeholder="Find a resource…"
                                        aria-label="Find a resource"
                                        value={resourceQuery}
                                        onChange={(event) => setResourceQuery(event.target.value)}
                                    >
                                        <TextField.Slot>
                                            <MagnifyingGlass size={16} />
                                        </TextField.Slot>
                                    </TextField.Root>
                                    <AppSelect
                                        aria-label="Resource type"
                                        value={resourceKind}
                                        onChange={(event) => setResourceKind(event.target.value)}
                                    >
                                        <SelectOption value="all">All types</SelectOption>
                                        <SelectOption value="file">Files</SelectOption>
                                        <SelectOption value="inbox">Webhooks</SelectOption>
                                        <SelectOption value="mock">Mock APIs</SelectOption>
                                        <SelectOption value="mcp">MCP servers</SelectOption>
                                    </AppSelect>
                                </div>
                            )}
                            {visibleResources.length ? (
                                <div className="account-table-wrap">
                                    <table className="account-table dashboard-resource-table">
                                        <thead>
                                            <tr>
                                                <th>Resource</th>
                                                <th>Access</th>
                                                <th>Expires</th>
                                                <th>Size</th>
                                                <th>
                                                    <span className="sr-only">Actions</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleResources.map((resource) => {
                                                const ResourceIcon = resourceIcons[resource.kind];
                                                return (
                                                    <tr key={resource.id}>
                                                        <td>
                                                            <div className="dashboard-resource-name">
                                                                <span className="dashboard-resource-icon">
                                                                    <ResourceIcon size={21} />
                                                                </span>
                                                                <div>
                                                                    <button
                                                                        onClick={() =>
                                                                            void inspect(resource)
                                                                        }
                                                                        disabled={busy}
                                                                    >
                                                                        {resource.name ??
                                                                            resourceNames[
                                                                                resource.kind
                                                                            ]}
                                                                    </button>
                                                                    <small>
                                                                        {
                                                                            resourceNames[
                                                                                resource.kind
                                                                            ]
                                                                        }{' '}
                                                                        · {resource.id.slice(0, 8)}
                                                                    </small>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <Badge
                                                                color={
                                                                    resource.visibility ===
                                                                    'private'
                                                                        ? 'green'
                                                                        : 'gray'
                                                                }
                                                                variant="soft"
                                                            >
                                                                {resource.available === false
                                                                    ? 'Used up'
                                                                    : resource.visibility ===
                                                                        'private'
                                                                      ? 'Private'
                                                                      : 'Public'}
                                                            </Badge>
                                                        </td>
                                                        <td>
                                                            <span title={date(resource.expiresAt)}>
                                                                {resource.persistent
                                                                    ? 'While subscribed'
                                                                    : `${Math.max(0, Math.ceil((Date.parse(resource.expiresAt) - Date.now()) / 60000))} min left`}
                                                            </span>
                                                        </td>
                                                        <td>{formatBytes(resource.storedBytes)}</td>
                                                        <td>
                                                            <div className="dashboard-resource-actions">
                                                                <Button
                                                                    asChild
                                                                    variant="soft"
                                                                    color="gray"
                                                                    size="1"
                                                                >
                                                                    <a
                                                                        href={`${toolPageHref(catalog.find((tool) => tool.id === resource.toolId) ?? catalog.find((tool) => tool.id === resourceTools[resource.kind])!)}?resource=${resource.id}`}
                                                                    >
                                                                        Open
                                                                        <ArrowUpRight size={13} />
                                                                    </a>
                                                                </Button>
                                                                <DropdownMenu.Root>
                                                                    <DropdownMenu.Trigger>
                                                                        <IconButton
                                                                            aria-label={`Actions for ${resource.name ?? resource.id}`}
                                                                            variant="ghost"
                                                                            color="gray"
                                                                            size="2"
                                                                            disabled={busy}
                                                                        >
                                                                            <DotsThree size={20} />
                                                                        </IconButton>
                                                                    </DropdownMenu.Trigger>
                                                                    <DropdownMenu.Content align="end">
                                                                        <DropdownMenu.Item
                                                                            onSelect={() =>
                                                                                void inspect(
                                                                                    resource,
                                                                                )
                                                                            }
                                                                        >
                                                                            View details
                                                                        </DropdownMenu.Item>
                                                                        <DropdownMenu.Item
                                                                            disabled={
                                                                                !session.scopes.includes(
                                                                                    'resources:write',
                                                                                )
                                                                            }
                                                                            onSelect={() =>
                                                                                renew(resource)
                                                                            }
                                                                        >
                                                                            Renew retention
                                                                        </DropdownMenu.Item>
                                                                        {['pro', 'team'].includes(
                                                                            session.account
                                                                                .effectivePlan,
                                                                        ) && (
                                                                            <DropdownMenu.Item
                                                                                disabled={
                                                                                    !session.scopes.includes(
                                                                                        'resources:write',
                                                                                    )
                                                                                }
                                                                                onSelect={() =>
                                                                                    renew(
                                                                                        resource,
                                                                                        !resource.persistent,
                                                                                    )
                                                                                }
                                                                            >
                                                                                {resource.persistent
                                                                                    ? 'Make temporary'
                                                                                    : 'Keep while subscribed'}
                                                                            </DropdownMenu.Item>
                                                                        )}
                                                                        <DropdownMenu.Separator />
                                                                        <DropdownMenu.Item
                                                                            color="red"
                                                                            disabled={
                                                                                !session.scopes.includes(
                                                                                    'resources:write',
                                                                                )
                                                                            }
                                                                            onSelect={() =>
                                                                                setDeleteTarget(
                                                                                    resource,
                                                                                )
                                                                            }
                                                                        >
                                                                            Delete resource
                                                                        </DropdownMenu.Item>
                                                                    </DropdownMenu.Content>
                                                                </DropdownMenu.Root>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="dashboard-empty">
                                    <span className="dashboard-empty-icon">
                                        <FolderSimple size={28} />
                                    </span>
                                    <h3>
                                        {resources.length
                                            ? 'No matching resources'
                                            : 'Your workspace is ready.'}
                                    </h3>
                                    <p>
                                        {resources.length
                                            ? 'Try another name or resource type.'
                                            : 'Create a webhook endpoint, mock an API, or share a file. Your resources will appear here.'}
                                    </p>
                                    {resources.length ? (
                                        <Button
                                            variant="soft"
                                            onClick={() => {
                                                setResourceQuery('');
                                                setResourceKind('all');
                                            }}
                                        >
                                            Clear filters
                                        </Button>
                                    ) : (
                                        <div className="dashboard-empty-links">
                                            <Link href="/tools/temporary-file-transfer/">
                                                Upload a file
                                                <ArrowUpRight size={14} />
                                            </Link>
                                            <Link href="/tools/webhook-inbox/">
                                                Create a webhook
                                                <ArrowUpRight size={14} />
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    )}
                    {panel === 'agents' && <AgentActivity keys={keys} />}
                    {panel === 'monitors' && (
                        <MonitorsPanel verifiedEmail={!!recoveryEmail?.verifiedAt} />
                    )}
                    {panel === 'keys' && (
                        <div className="settings-stack">
                            {secret && (
                                <div className="account-secret" role="status">
                                    <strong>Save your new key</strong>
                                    <code>{secret}</code>
                                    <div>
                                        <CopyButton text={secret} label="Copy key" />
                                        <button
                                            className="button button-small"
                                            onClick={() => setSecret('')}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            )}
                            <SettingsSection
                                title="Create a key"
                                description={
                                    <>
                                        Keys belong to this workspace and work with the API, CLI,
                                        SDK, and MCP. A new key is shown once.{' '}
                                        <Link className="text-link" href="/integrations/">
                                            Usage examples →
                                        </Link>
                                    </>
                                }
                            >
                                <form
                                    className="settings-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const form = event.currentTarget,
                                            data = new FormData(form);
                                        void action(async () => {
                                            const scope = data.get('scope');
                                            const value = await json('/api/account/keys', 'POST', {
                                                name: data.get('name'),
                                                scopes:
                                                    scope === 'read'
                                                        ? ['resources:read', 'account:read']
                                                        : scope === 'run'
                                                          ? ['tools:run', 'account:read']
                                                          : [
                                                                'tools:run',
                                                                'resources:read',
                                                                'resources:write',
                                                                'account:read',
                                                            ],
                                                expiresInDays: Number(data.get('days')),
                                            });
                                            setSecret(value.key);
                                            form.reset();
                                            await refresh();
                                        });
                                    }}
                                >
                                    <label>
                                        Key name
                                        <TextField.Root
                                            size="2"
                                            name="name"
                                            required
                                            maxLength={80}
                                            placeholder="My development machine"
                                        />
                                    </label>
                                    <div className="settings-form-row">
                                        <label>
                                            Access
                                            <AppSelect name="scope">
                                                {session.scopes.includes('resources:write') && (
                                                    <SelectOption value="all">
                                                        Full tool access
                                                    </SelectOption>
                                                )}
                                                {session.scopes.includes('resources:read') && (
                                                    <SelectOption value="read">
                                                        Read resources
                                                    </SelectOption>
                                                )}
                                                {session.scopes.includes('tools:run') && (
                                                    <SelectOption value="run">
                                                        Run utilities
                                                    </SelectOption>
                                                )}
                                            </AppSelect>
                                        </label>
                                        <label>
                                            Expires in
                                            <AppSelect name="days">
                                                <SelectOption value="90">90 days</SelectOption>
                                                <SelectOption value="30">30 days</SelectOption>
                                                <SelectOption value="7">7 days</SelectOption>
                                            </AppSelect>
                                        </label>
                                    </div>
                                    <div className="settings-actions">
                                        <button
                                            className="button button-primary"
                                            type="submit"
                                            disabled={busy}
                                        >
                                            Create key
                                        </button>
                                    </div>
                                </form>
                            </SettingsSection>
                            <SettingsSection
                                title="Active keys"
                                description="Revoke a key to stop it working immediately."
                            >
                                {keys.length ? (
                                    <ul className="settings-list">
                                        {keys.map((key) => (
                                            <li key={key.id}>
                                                <span className="settings-list-icon">
                                                    <KeyIcon size={16} />
                                                </span>
                                                <div>
                                                    <strong>{key.name}</strong>
                                                    <small>
                                                        <code>{key.prefix}…</code> ·{' '}
                                                        {key.scopes.join(', ')} · Expires{' '}
                                                        {date(key.expiresAt)}
                                                    </small>
                                                </div>
                                                <button
                                                    className="button button-small button-danger"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        action(async () => {
                                                            await json(
                                                                `/api/account/keys/${key.id}`,
                                                                'DELETE',
                                                            );
                                                            setSecret('');
                                                            await refresh();
                                                        })
                                                    }
                                                >
                                                    Revoke
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="settings-empty">
                                        <KeyIcon size={20} />
                                        <p>
                                            No keys yet. Create one to use socket.help from your
                                            code, terminal, or agent.
                                        </p>
                                    </div>
                                )}
                            </SettingsSection>
                        </div>
                    )}
                    {panel === 'security' && (
                        <div className="settings-stack">
                            <SettingsSection
                                title="Recovery email"
                                description="A verified email lets you reset your password if you forget it."
                            >
                                <AccountSecurity onVerified={refresh} />
                            </SettingsSection>
                            <SettingsSection
                                title="Password"
                                description="Passwords are reset with a single use code sent to your verified recovery email."
                            >
                                <p className="settings-text">
                                    To change your password, sign out and choose{' '}
                                    <strong>Forgot password?</strong> on the sign in screen.
                                    Resetting signs out every session and revokes API keys. Your
                                    resources stay.
                                </p>
                            </SettingsSection>
                            <SettingsSection
                                title="Session"
                                description="Signing out ends this browser session."
                            >
                                <div className="settings-row">
                                    <div>
                                        <strong>{session.user.username}</strong>
                                        <small>Signed in on this browser</small>
                                    </div>
                                    <button className="button" disabled={busy} onClick={signOut}>
                                        Sign out
                                    </button>
                                </div>
                            </SettingsSection>
                        </div>
                    )}
                    {panel === 'workspace' && (
                        <div className="settings-stack">
                            <SettingsSection
                                title="General"
                                description={`Your role here is ${session.role}. API keys stay with the workspace where they were created.`}
                            >
                                {['owner', 'admin'].includes(session.role) ? (
                                    <form
                                        className="settings-form"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            const data = new FormData(event.currentTarget);
                                            void action(async () => {
                                                await json('/api/account', 'PATCH', {
                                                    name: data.get('name'),
                                                });
                                                await refresh();
                                            });
                                        }}
                                    >
                                        <label>
                                            Workspace name
                                            <TextField.Root
                                                size="2"
                                                name="name"
                                                defaultValue={session.account.name}
                                                key={session.account.id}
                                                required
                                                maxLength={80}
                                            />
                                        </label>
                                        <div className="settings-actions">
                                            <button
                                                className="button button-primary"
                                                disabled={busy}
                                            >
                                                Save name
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="settings-row">
                                        <div>
                                            <small>Workspace name</small>
                                            <strong>{session.account.name}</strong>
                                        </div>
                                    </div>
                                )}
                                {workspaces.length > 1 && (
                                    <label className="settings-field">
                                        Switch workspace
                                        <AppSelect
                                            value={session.account.id}
                                            disabled={busy}
                                            onChange={(event) =>
                                                switchWorkspace(event.target.value)
                                            }
                                        >
                                            {workspaces.map((space) => (
                                                <SelectOption key={space.id} value={space.id}>
                                                    {space.name}
                                                </SelectOption>
                                            ))}
                                        </AppSelect>
                                    </label>
                                )}
                            </SettingsSection>
                            <SettingsSection
                                title="Members"
                                description="People who can use this workspace and its allowances."
                            >
                                <ul className="settings-list">
                                    {members.map((member) => (
                                        <li key={member.userId}>
                                            <span className="settings-avatar">
                                                {member.username[0]?.toUpperCase()}
                                            </span>
                                            <div>
                                                <strong>
                                                    {member.username}
                                                    {member.username === session.user.username && (
                                                        <span className="settings-you"> (you)</span>
                                                    )}
                                                </strong>
                                                <small>{member.role}</small>
                                            </div>
                                            <Badge
                                                variant="soft"
                                                color={member.role === 'owner' ? 'green' : 'gray'}
                                            >
                                                {member.role}
                                            </Badge>
                                            {session.role === 'owner' &&
                                                member.role !== 'owner' && (
                                                    <button
                                                        className="button button-small button-danger"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            action(async () => {
                                                                await json(
                                                                    `/api/account/members/${member.userId}`,
                                                                    'DELETE',
                                                                );
                                                                await refresh();
                                                            })
                                                        }
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                        </li>
                                    ))}
                                </ul>
                            </SettingsSection>
                            <SettingsSection
                                title="Invite people"
                                description="Invitations are tokens you share directly with one person. They expire after 24 hours."
                            >
                                {session.account.effectivePlan === 'team' &&
                                ['owner', 'admin'].includes(session.role) ? (
                                    <form
                                        className="settings-form"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            const data = new FormData(event.currentTarget);
                                            void action(async () => {
                                                const invite = await json(
                                                    '/api/account/invites',
                                                    'POST',
                                                    {
                                                        username: data.get('username'),
                                                        role: data.get('role'),
                                                    },
                                                );
                                                setDetail(
                                                    JSON.stringify(
                                                        {
                                                            invitationToken: invite.token,
                                                            expiresIn: '24 hours',
                                                            for: data.get('username'),
                                                        },
                                                        null,
                                                        2,
                                                    ),
                                                );
                                                setNotice(
                                                    'Share this invitation token directly with the named member.',
                                                );
                                            });
                                        }}
                                    >
                                        <div className="settings-form-row">
                                            <label>
                                                Username
                                                <TextField.Root
                                                    size="2"
                                                    name="username"
                                                    required
                                                    maxLength={32}
                                                />
                                            </label>
                                            <label>
                                                Role
                                                <AppSelect name="role">
                                                    <SelectOption value="member">
                                                        Member
                                                    </SelectOption>
                                                    <SelectOption value="viewer">
                                                        Viewer
                                                    </SelectOption>
                                                    {session.role === 'owner' && (
                                                        <SelectOption value="admin">
                                                            Admin
                                                        </SelectOption>
                                                    )}
                                                </AppSelect>
                                            </label>
                                        </div>
                                        <div className="settings-actions">
                                            <button
                                                className="button button-primary"
                                                disabled={busy}
                                            >
                                                Create invitation
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="settings-empty">
                                        <UsersThree size={20} />
                                        <p>
                                            {session.account.effectivePlan === 'team'
                                                ? 'Only owners and admins can invite members.'
                                                : 'Inviting members is part of the Team plan.'}
                                        </p>
                                        {session.account.effectivePlan !== 'team' && (
                                            <button
                                                className="text-link"
                                                onClick={() => changePanel('billing')}
                                            >
                                                See plans →
                                            </button>
                                        )}
                                    </div>
                                )}
                            </SettingsSection>
                            <SettingsSection
                                title="Join a workspace"
                                description="Paste an invitation token someone shared with you."
                            >
                                <form
                                    className="settings-form"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const form = event.currentTarget,
                                            data = new FormData(form);
                                        void action(async () => {
                                            await json('/api/account/invites/accept', 'POST', {
                                                token: data.get('token'),
                                            });
                                            form.reset();
                                            await refresh();
                                            setNotice(
                                                'Invitation accepted. Select the workspace above to switch.',
                                            );
                                        });
                                    }}
                                >
                                    <label>
                                        Invitation token
                                        <TextField.Root
                                            size="2"
                                            name="token"
                                            required
                                            maxLength={43}
                                            placeholder="Paste your invitation token"
                                            autoComplete="off"
                                        />
                                    </label>
                                    <div className="settings-actions">
                                        <button className="button" disabled={busy}>
                                            Join workspace
                                        </button>
                                    </div>
                                </form>
                            </SettingsSection>
                        </div>
                    )}
                    {panel === 'billing' && (
                        <div className="settings-stack">
                            {checkout && (
                                <section
                                    className={`checkout-result is-${checkout}`}
                                    role="status"
                                    aria-live="polite"
                                >
                                    <span className="checkout-result-icon" aria-hidden="true">
                                        {checkout === 'activating' ? (
                                            <ArrowsClockwise size={20} className="spin" />
                                        ) : checkout === 'active' ? (
                                            <Check size={20} weight="bold" />
                                        ) : checkout === 'failed' ? (
                                            <WarningCircle size={20} />
                                        ) : (
                                            <Lightning size={20} />
                                        )}
                                    </span>
                                    <div>
                                        <strong>
                                            {checkout === 'activating'
                                                ? 'Confirming your payment'
                                                : checkout === 'active'
                                                  ? `Welcome to ${planName}!`
                                                  : checkout === 'delayed'
                                                    ? 'Payment not confirmed yet'
                                                    : checkout === 'failed'
                                                      ? 'Payment didn’t go through'
                                                      : 'Checkout cancelled'}
                                        </strong>
                                        <p>
                                            {checkout === 'activating'
                                                ? 'Waiting for Dodo Payments to confirm. This usually takes a few seconds…'
                                                : checkout === 'active'
                                                  ? `Your workspace now has the ${planName} limits below. Dodo Payments will email your receipt, and you can change or cancel anytime from Manage billing.`
                                                  : checkout === 'delayed'
                                                    ? 'We haven’t received a successful payment yet. If you were charged, your plan switches automatically within a few minutes. If not, the payment didn’t complete and you can try again. Questions? Email support@socket.help.'
                                                    : checkout === 'failed'
                                                      ? 'You weren’t charged and your plan hasn’t changed. Try again, or use a different card.'
                                                      : 'No payment was taken and your plan has not changed.'}
                                        </p>
                                    </div>
                                    {checkout !== 'activating' && (
                                        <button
                                            className="text-button"
                                            onClick={() => setCheckout(null)}
                                        >
                                            Dismiss
                                        </button>
                                    )}
                                </section>
                            )}
                            <section className="plan-hero">
                                <div className="plan-hero-copy">
                                    <Badge color="green" variant="soft">
                                        {subscribed ? 'Subscribed' : 'Current plan'}
                                    </Badge>
                                    <h2>{planName} plan</h2>
                                    <p>
                                        {subscribed && session.account.planValidUntil
                                            ? `Paid through ${new Date(session.account.planValidUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}. `
                                            : ''}
                                        Your allowances are shared across the web app, API, SDK,
                                        CLI, and MCP.
                                    </p>
                                    <Link className="text-link" href="/plans/">
                                        Compare plan limits →
                                    </Link>
                                </div>
                                <div className="plan-hero-meters">
                                    <Meter
                                        label="Active resources"
                                        value={resources.length}
                                        max={usage?.limits.maxResources ?? 0}
                                        display={`${resources.length} / ${usage?.limits.maxResources ?? '-'}`}
                                    />
                                    <Meter
                                        label="Storage"
                                        value={storedBytes}
                                        max={usage?.limits.storageBytes ?? 0}
                                        display={`${formatBytes(storedBytes)} of ${formatBytes(usage?.limits.storageBytes ?? 0)}`}
                                    />
                                    <Meter
                                        label="Hosted runs today"
                                        value={usage?.runsToday ?? 0}
                                        max={usage?.limits.runsPerDay ?? 0}
                                        display={`${(usage?.runsToday ?? 0).toLocaleString()} / ${usage?.limits.runsPerDay.toLocaleString() ?? '-'}`}
                                    />
                                </div>
                            </section>
                            <SettingsSection
                                title="Subscription"
                                description="Paid plans are billed through Dodo Payments. Only workspace owners can change the plan."
                            >
                                {billing.enabled && subscribed ? (
                                    <>
                                        <p>
                                            {session.role === 'owner'
                                                ? `You're subscribed to ${planName}. Switch plans, update your card, download invoices or cancel in the billing portal.`
                                                : `This workspace is on ${planName}. Only the workspace owner can change the subscription.`}
                                        </p>
                                        {session.role === 'owner' && (
                                            <div className="account-row-actions">
                                                <button
                                                    className="button button-primary"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        action(async () => {
                                                            const result = await json(
                                                                '/api/billing/portal',
                                                                'POST',
                                                            );
                                                            location.assign(result.url);
                                                        })
                                                    }
                                                >
                                                    Manage billing
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : billing.enabled ? (
                                    <>
                                        <p>
                                            Subscriptions are billed monthly through Dodo Payments.
                                            You can switch plans or cancel anytime from the billing
                                            portal.
                                        </p>
                                        <div className="account-row-actions">
                                            {session.role === 'owner' &&
                                                billing.prices.map((price) => (
                                                    <button
                                                        className={`button ${price.plan === 'pro' ? 'button-primary' : ''}`}
                                                        key={price.plan}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            action(async () => {
                                                                const result = await json(
                                                                    '/api/billing/checkout',
                                                                    'POST',
                                                                    { plan: price.plan },
                                                                );
                                                                location.assign(result.url);
                                                            })
                                                        }
                                                    >
                                                        Upgrade to {price.plan[0]!.toUpperCase()}
                                                        {price.plan.slice(1)} ·{' '}
                                                        {new Intl.NumberFormat('en-US', {
                                                            style: 'currency',
                                                            currency: price.currency,
                                                        }).format(
                                                            price.amount /
                                                                10 **
                                                                    (new Intl.NumberFormat(
                                                                        undefined,
                                                                        {
                                                                            style: 'currency',
                                                                            currency:
                                                                                price.currency,
                                                                        },
                                                                    ).resolvedOptions()
                                                                        .maximumFractionDigits ??
                                                                        2),
                                                        )}
                                                        /
                                                        {price.intervalCount > 1
                                                            ? `${price.intervalCount} `
                                                            : ''}
                                                        {price.interval.toLowerCase()}
                                                    </button>
                                                ))}
                                        </div>
                                    </>
                                ) : (
                                    <p>
                                        You are using the free beta. No card is required, and this
                                        account will not be charged or upgraded automatically. Paid
                                        subscriptions are not open.
                                    </p>
                                )}
                            </SettingsSection>
                        </div>
                    )}
                    <Dialog.Root
                        open={!!detail}
                        onOpenChange={(open) => {
                            if (!open) closeDetail();
                        }}
                    >
                        <Dialog.Content className="dashboard-resource-dialog" maxWidth="700px">
                            <Dialog.Title>
                                {selectedResource?.name ??
                                    (selectedResource
                                        ? resourceNames[selectedResource.kind]
                                        : 'Workspace invitation')}
                            </Dialog.Title>
                            <Dialog.Description size="2">
                                {selectedResource
                                    ? `Manage access and inspect this ${resourceNames[selectedResource.kind].toLowerCase()}.`
                                    : 'Share this invitation only with the intended workspace member.'}
                            </Dialog.Description>
                            {selectedResource ? (
                                <Tabs.Root defaultValue="manage">
                                    <Tabs.List>
                                        <Tabs.Trigger value="manage">Manage access</Tabs.Trigger>
                                        <Tabs.Trigger value="response">
                                            Technical details
                                        </Tabs.Trigger>
                                    </Tabs.List>
                                    <Tabs.Content value="manage">
                                        {selectedResource.kind !== 'email' && (
                                            <SharingControl
                                                value={selectedResource.visibility}
                                                disabled={
                                                    busy ||
                                                    !session.scopes.includes('resources:write')
                                                }
                                                onChange={(visibility) =>
                                                    void action(async () => {
                                                        const result = await json(
                                                            `/api/${paths[selectedResource.kind]}/${selectedResource.id}/sharing`,
                                                            'POST',
                                                            { visibility },
                                                        );
                                                        setSelectedResource({
                                                            ...selectedResource,
                                                            visibility,
                                                        });
                                                        setSharedAccess(result.accessToken ?? '');
                                                        await refresh();
                                                        setNotice(
                                                            visibility === 'private'
                                                                ? 'Private sharing enabled. Previous access tokens are revoked.'
                                                                : 'Public sharing enabled.',
                                                        );
                                                    })
                                                }
                                            />
                                        )}
                                        {selectedResource.kind !== 'email' &&
                                            selectedResource.visibility === 'private' && (
                                                <div className="account-secret">
                                                    <p>
                                                        Private access requires a sharing token or
                                                        workspace access.
                                                    </p>
                                                    {selectedResource.kind === 'file' && (
                                                        <p>
                                                            Share the link and access token
                                                            separately.
                                                        </p>
                                                    )}
                                                    <div className="account-secret-actions">
                                                        {selectedResource.kind === 'file' && (
                                                            <CopyButton
                                                                text={`${location.origin}/share/?id=${selectedResource.id}`}
                                                                label="Copy share link"
                                                            />
                                                        )}
                                                        {sharedAccess ? (
                                                            <CopyButton
                                                                text={sharedAccess}
                                                                label="Copy access token"
                                                            />
                                                        ) : (
                                                            <Button
                                                                variant="soft"
                                                                disabled={
                                                                    busy ||
                                                                    !session.scopes.includes(
                                                                        'resources:write',
                                                                    )
                                                                }
                                                                onClick={() =>
                                                                    void action(async () => {
                                                                        const result = await json(
                                                                            `/api/${paths[selectedResource.kind]}/${selectedResource.id}/sharing`,
                                                                            'POST',
                                                                            {
                                                                                visibility:
                                                                                    'private',
                                                                            },
                                                                        );
                                                                        setSharedAccess(
                                                                            result.accessToken,
                                                                        );
                                                                    })
                                                                }
                                                            >
                                                                Rotate access token
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        {selectedResource.kind === 'file' && (
                                            <RemoteFilePreview
                                                id={selectedResource.id}
                                                name={selectedResource.name ?? 'download'}
                                                accessToken={sharedAccess || undefined}
                                            />
                                        )}
                                    </Tabs.Content>
                                    <Tabs.Content value="response">
                                        <ResultPreview
                                            text={detail}
                                            title="Resource data"
                                            filename="resource-data.json"
                                        />
                                    </Tabs.Content>
                                </Tabs.Root>
                            ) : (
                                <ResultPreview
                                    text={detail}
                                    title="Invitation details"
                                    filename="workspace-invitation.json"
                                />
                            )}
                            <div className="dashboard-dialog-footer">
                                <Dialog.Close>
                                    <Button variant="soft" color="gray">
                                        Done
                                    </Button>
                                </Dialog.Close>
                            </div>
                        </Dialog.Content>
                    </Dialog.Root>
                    <AlertDialog.Root
                        open={!!deleteTarget}
                        onOpenChange={(open) => {
                            if (!open) setDeleteTarget(null);
                        }}
                    >
                        <AlertDialog.Content maxWidth="440px">
                            <AlertDialog.Title>Delete this resource?</AlertDialog.Title>
                            <AlertDialog.Description>
                                This removes its contents and disables its endpoint or download
                                link.
                            </AlertDialog.Description>
                            <div className="dashboard-dialog-footer">
                                <AlertDialog.Cancel>
                                    <Button variant="soft" color="gray">
                                        Cancel
                                    </Button>
                                </AlertDialog.Cancel>
                                <Button
                                    color="red"
                                    disabled={busy}
                                    onClick={() =>
                                        void action(async () => {
                                            if (!deleteTarget) return;
                                            await json(
                                                `/api/${paths[deleteTarget.kind]}/${deleteTarget.id}`,
                                                'DELETE',
                                            );
                                            setDeleteTarget(null);
                                            closeDetail();
                                            await refresh();
                                        })
                                    }
                                >
                                    Delete resource
                                </Button>
                            </div>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                </DashboardShell>
            )}
        </div>
    );
}
