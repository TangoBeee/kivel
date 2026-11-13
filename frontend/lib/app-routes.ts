import { appOrigin } from './site';

export const workspaceRoutes = {
    overview: '/',
    webhooks: '/webhooks/',
    email: '/email/',
    mocks: '/mocks/',
    payments: '/payments/',
    monitors: '/monitors/',
    automation: '/jobs/',
    status: '/status-pages/',
    approvals: '/approvals/',
    vault: '/credentials/',
    authenticators: '/authenticators/',
    memory: '/memory/',
    files: '/files/',
    tools: '/utilities/',
    agents: '/agents/',
    keys: '/agents/?tab=keys',
    usage: '/usage/',
    billing: '/usage/?tab=billing',
    workspace: '/settings/',
    security: '/settings/?tab=security',
} as const;
export type WorkspacePanel = keyof typeof workspaceRoutes;
const paths = [...new Set(Object.values(workspaceRoutes).map((path) => path.split('?')[0]!))];
const authPaths = ['/login/', '/signup/', '/recovery/'];
export const workspaceSections = [...paths.filter((path) => path !== '/'), ...authPaths].map(
    (path) => path.slice(1, -1),
);

export function workspacePanel(path: string, query: URLSearchParams): WorkspacePanel {
    const base = path.endsWith('/') ? path : `${path}/`;
    const tab = query.get('tab');
    if (base === '/monitors/' && tab === 'jobs') return 'automation';
    if (base === '/monitors/' && tab === 'status-pages') return 'status';
    if (base === '/credentials/' && tab === 'authenticators') return 'authenticators';
    const matched =
        Object.entries(workspaceRoutes).find(([, route]) => route === `${base}?tab=${tab}`) ??
        Object.entries(workspaceRoutes).find(([, route]) => route === base);
    return (matched?.[0] as WorkspacePanel | undefined) ?? 'overview';
}

export function workspaceHref(
    panel: WorkspacePanel,
    target: { resource?: string; tool?: string } = {},
) {
    const url = new URL(workspaceRoutes[panel], appOrigin);
    if (target.resource) url.searchParams.set(panel === 'email' ? 'inbox' : 'id', target.resource);
    if (target.tool) url.searchParams.set('tool', target.tool);
    return url.pathname + url.search;
}

export function workspaceResource(search: string) {
    const query = new URLSearchParams(search);
    return query.get('id') ?? query.get('resource');
}

export function appLink(path = '/') {
    return `${appOrigin}${path}`;
}

export function returnPath(value: string | null) {
    if (!value?.startsWith('/') || value.startsWith('//')) return null;
    const url = new URL(value, appOrigin);
    if (
        url.origin !== appOrigin ||
        ![...paths, '/approve/', '/link/', '/phone/'].includes(url.pathname)
    )
        return null;
    return url.pathname + url.search;
}

export function legacyWorkspaceLink(search: string, hash: string) {
    const query = new URLSearchParams(search);
    const section = hash.slice(1);
    const mode = section === 'register' ? '/signup/' : section === 'signin' ? '/login/' : '';
    const panel = query.has('billing')
        ? 'billing'
        : Object.hasOwn(workspaceRoutes, section)
          ? (section as WorkspacePanel)
          : 'overview';
    const url = new URL(
        mode ||
            workspaceHref(panel, {
                resource: query.get('resource') ?? query.get('id') ?? undefined,
                tool: query.get('tool') ?? undefined,
            }),
        appOrigin,
    );
    for (const key of [
        'billing',
        'status',
        'tab',
        'inbox',
        'thread',
        'route',
        ...(mode ? ['resource', 'id', 'tool'] : []),
    ]) {
        const value = query.get(key);
        if (value !== null) url.searchParams.set(key, value);
    }
    return url.href;
}

export function legacyAccountLink(href: string) {
    const url = new URL(href, appOrigin);
    return legacyWorkspaceLink(url.search, url.hash);
}
