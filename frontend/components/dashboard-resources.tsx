'use client';
import { useState } from 'react';
import { DropdownMenu, IconButton, TextField } from '@radix-ui/themes';
import {
    ArrowsClockwise,
    BracketsCurly,
    DotsThree,
    EnvelopeSimple,
    File,
    Lightning,
    LockKey,
    MagnifyingGlass,
    Plugs,
    Robot,
    ShieldCheck,
    WebhooksLogo,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { catalog, toolPageHref } from '../lib/catalog';
import { timeLeft } from '../lib/activity-labels';
import { siteOrigin } from '../lib/site';
import { CopyButton } from './copy-button';
import type { Visibility } from './sharing-control';

export type Resource = {
    toolId?: string;
    id: string;
    kind: 'inbox' | 'mock' | 'file' | 'mcp' | 'email' | 'status' | 'job';
    visibility: Visibility;
    name?: string;
    expiresAt: string;
    persistent: boolean;
    status?: 'active' | 'paused';
    storedBytes: number;
    available?: boolean;
};

// The tool each kind opens in when the resource does not name a more specific one.
const kindTools: Record<Resource['kind'], string> = {
    inbox: 'webhooks',
    mock: 'mock-apis-mock-rest-api',
    file: 'files-temporary-file-transfer',
    mcp: 'agents-mock-mcp-server',
    email: 'email-temporary-email-inbox',
    status: 'monitoring-public-status-page',
    job: 'automation-temporary-scheduled-jobs',
};
const kindIcons: Record<Resource['kind'], Icon> = {
    inbox: WebhooksLogo,
    file: File,
    mock: BracketsCurly,
    mcp: Plugs,
    email: EnvelopeSimple,
    status: ShieldCheck,
    job: Lightning,
};
const toolIcons: Record<string, Icon> = {
    'mock-apis-mock-oauth-provider': LockKey,
    'mock-apis-mock-websocket-server': Plugs,
    'agents-mock-llm-endpoint': Robot,
};

export const resourceTool = (resource: Resource) =>
    catalog.find((tool) => tool.id === resource.toolId) ??
    catalog.find((tool) => tool.id === kindTools[resource.kind])!;

export const resourceHref = (resource: Resource) =>
    `${toolPageHref(resourceTool(resource))}?resource=${resource.id}`;

const formatBytes = (value: number) =>
    value < 1048576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1048576).toFixed(1)} MB`;

/** The address people copy most: the email address or the webhook URL. */
function address(resource: Resource) {
    if (resource.kind === 'email' && resource.name?.includes('@')) return resource.name;
    if (resource.kind === 'inbox') return `${siteOrigin}/hooks/${resource.id}`;
    if (resource.toolId === 'mock-apis-mock-websocket-server')
        return `${siteOrigin.replace(/^http/, 'ws')}/ws/${resource.id}`;
    return '';
}

function expiry(resource: Resource) {
    if (resource.status === 'paused') return 'Paused';
    if (resource.available === false) return 'Used up';
    if (resource.persistent) return 'Kept while subscribed';
    const left = timeLeft(resource.expiresAt);
    return left === 'expired' ? 'Expired' : `Expires ${left}`;
}

export function ResourceList({
    resources,
    compact = false,
    canWrite,
    canKeep,
    busy,
    refreshing,
    onRefresh,
    onViewAll,
    onDetails,
    onRenew,
    onDelete,
    onOpen,
    heading,
    empty,
}: {
    resources: Resource[];
    /** Home shows the newest few without filters. */
    compact?: boolean;
    canWrite: boolean;
    canKeep: boolean;
    busy: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    onViewAll?: () => void;
    onDetails: (resource: Resource) => void;
    onRenew: (resource: Resource, persistent?: boolean) => void;
    onDelete: (resource: Resource) => void;
    /** Opens the resource inside the dashboard. */
    onOpen: (resource: Resource) => void;
    heading?: string;
    empty: React.ReactNode;
}) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState('all');
    // Filter chips come from what the workspace actually has, so new tools need no changes here.
    const types = [...new Map(resources.map((item) => [resourceTool(item).id, resourceTool(item)]))]
        .map(([, tool]) => tool)
        .sort((left, right) => left.name.localeCompare(right.name));
    const shown = compact
        ? resources.slice(0, 5)
        : resources.filter(
              (item) =>
                  (type === 'all' || resourceTool(item).id === type) &&
                  `${item.name ?? ''} ${resourceTool(item).name} ${item.id}`
                      .toLowerCase()
                      .includes(query.trim().toLowerCase()),
          );
    return (
        <section className="home-section" aria-labelledby="resources-heading">
            <div className="home-section-head">
                <h2 id="resources-heading">
                    {heading ? (
                        <>
                            {heading} <span className="home-count">{resources.length}</span>
                        </>
                    ) : compact ? (
                        <>
                            Recent resources <span className="home-count">{resources.length}</span>
                        </>
                    ) : (
                        `${shown.length === resources.length ? resources.length : `${shown.length} of ${resources.length}`} resource${resources.length === 1 ? '' : 's'}`
                    )}
                </h2>
                <div className="home-section-actions">
                    {compact && resources.length > 0 && onViewAll && (
                        <button type="button" className="home-panel-link" onClick={onViewAll}>
                            View all
                        </button>
                    )}
                    <IconButton
                        aria-label={refreshing ? 'Refreshing resources' : 'Refresh resources'}
                        variant="ghost"
                        color="gray"
                        size="1"
                        disabled={refreshing}
                        onClick={onRefresh}
                    >
                        <ArrowsClockwise size={16} className={refreshing ? 'spin' : undefined} />
                    </IconButton>
                </div>
            </div>
            {!compact && resources.length > 0 && (
                <div className="resource-filters">
                    <TextField.Root
                        placeholder="Find by name, address or ID"
                        aria-label="Find a resource"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    >
                        <TextField.Slot>
                            <MagnifyingGlass size={16} />
                        </TextField.Slot>
                    </TextField.Root>
                    {types.length > 1 && (
                        <div className="filter-chips" role="group" aria-label="Resource type">
                            {[{ id: 'all', name: 'All' }, ...types].map((tool) => (
                                <button
                                    key={tool.id}
                                    type="button"
                                    aria-pressed={type === tool.id}
                                    onClick={() => setType(tool.id)}
                                >
                                    {tool.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {shown.length ? (
                <ul className="resource-rows">
                    {shown.map((resource) => {
                        const tool = resourceTool(resource);
                        const ResourceIcon = toolIcons[tool.id] ?? kindIcons[resource.kind];
                        const copy = address(resource);
                        const title =
                            resource.name && resource.name !== copy ? resource.name : tool.name;
                        return (
                            <li key={resource.id}>
                                <span className="resource-icon" aria-hidden="true">
                                    <ResourceIcon size={18} />
                                </span>
                                <div className="resource-main">
                                    <button
                                        type="button"
                                        className="resource-title"
                                        onClick={() => onOpen(resource)}
                                    >
                                        {title}
                                    </button>
                                    {copy ? (
                                        <span className="resource-address">
                                            <code title={copy}>{copy}</code>
                                            <CopyButton
                                                text={copy}
                                                label={`Copy ${resource.kind === 'email' ? 'address' : 'URL'}`}
                                                compact
                                            />
                                        </span>
                                    ) : (
                                        <small>
                                            {tool.name}
                                            {resource.visibility === 'private' && ' · Private'}
                                            {resource.storedBytes > 0 &&
                                                ` · ${formatBytes(resource.storedBytes)}`}
                                        </small>
                                    )}
                                </div>
                                <span
                                    className={`resource-expiry ${resource.status === 'paused' || resource.available === false ? 'is-warning' : ''}`}
                                    title={new Date(resource.expiresAt).toLocaleString()}
                                >
                                    {expiry(resource)}
                                </span>
                                <div className="resource-actions">
                                    <button
                                        type="button"
                                        className="button button-small"
                                        onClick={() => onOpen(resource)}
                                    >
                                        Open
                                    </button>
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger>
                                            <IconButton
                                                aria-label={`More actions for ${title}`}
                                                variant="ghost"
                                                color="gray"
                                                size="2"
                                                disabled={busy}
                                            >
                                                <DotsThree size={20} />
                                            </IconButton>
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Content align="end">
                                            <DropdownMenu.Item onSelect={() => onDetails(resource)}>
                                                Manage access and view data
                                            </DropdownMenu.Item>
                                            {!['email', 'job'].includes(resource.kind) && (
                                                <DropdownMenu.Item
                                                    disabled={!canWrite}
                                                    onSelect={() => onRenew(resource)}
                                                >
                                                    Extend expiry
                                                </DropdownMenu.Item>
                                            )}
                                            {!['email', 'job'].includes(resource.kind) &&
                                                canKeep && (
                                                    <DropdownMenu.Item
                                                        disabled={!canWrite}
                                                        onSelect={() =>
                                                            onRenew(resource, !resource.persistent)
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
                                                disabled={!canWrite}
                                                onSelect={() => onDelete(resource)}
                                            >
                                                Delete
                                            </DropdownMenu.Item>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Root>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : resources.length ? (
                <p className="home-empty">
                    Nothing matches.{' '}
                    <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                            setQuery('');
                            setType('all');
                        }}
                    >
                        Clear filters
                    </button>
                </p>
            ) : (
                empty
            )}
        </section>
    );
}
