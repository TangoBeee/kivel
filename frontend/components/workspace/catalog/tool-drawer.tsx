'use client';
import { useMemo, useState } from 'react';
import { Tabs } from 'radix-ui';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { siteOrigin } from '../../../lib/site';
import { Button, CopyButton, Drawer, LogoTile, Tag } from '../ui';
import { EndpointItem } from './endpoint-item';
import { mcpExample, type KivelTool } from './kivel-tools';
import styles from './tool-drawer.module.css';

/** Details for one Kivel tool: what it can do, and how an agent calls it. */
export function ToolDrawer({
    tool,
    usage,
    onClose,
    onOpenPage,
}: {
    tool: KivelTool | null;
    usage?: string;
    onClose: () => void;
    onOpenPage: (tool: KivelTool) => void;
}) {
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const endpoints = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return (tool?.endpoints ?? []).filter(
            (endpoint) =>
                !needle || `${endpoint.label} ${endpoint.id}`.toLowerCase().includes(needle),
        );
    }, [tool, query]);
    if (!tool) return null;
    const Icon = tool.icon;
    const first = tool.endpoints[0]!;
    return (
        <Drawer
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            title={tool.name}
            description={tool.description}
            header={
                <div className={styles.header}>
                    <LogoTile size="lg">
                        <Icon color={tool.color} />
                    </LogoTile>
                    <div className={styles.titles}>
                        <span className={styles.crumb}>Kivel tools</span>
                        <h2>
                            {tool.name}
                            <Tag tone={tool.note ? 'warn' : 'accent'}>
                                {tool.note ?? 'Included'}
                            </Tag>
                        </h2>
                    </div>
                    <p className={styles.intro}>{tool.description}</p>
                    <div className={styles.stats}>
                        <span>Included in your plan</span>
                        {usage && <span>{usage}</span>}
                        <span>{tool.endpoints.length} tools</span>
                    </div>
                </div>
            }
            footer={
                <>
                    <span className={styles.note}>Your agent calls these through MCP.</span>
                    <CopyButton value={first.id} label="Copy id" />
                    {tool.panel && (
                        <Button variant="primary" onClick={() => onOpenPage(tool)}>
                            Open {tool.name.toLowerCase()}
                        </Button>
                    )}
                </>
            }
        >
            <Tabs.Root defaultValue="tools" className={styles.tabs}>
                <Tabs.List className={styles.tabList} aria-label={`${tool.name} details`}>
                    <Tabs.Trigger value="tools">
                        Tools <small>{tool.endpoints.length}</small>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="setup">Setup</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="tools" className={styles.panel}>
                    <label className={styles.search}>
                        <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={`Search ${tool.endpoints.length} tools`}
                            aria-label={`Search ${tool.name} tools`}
                        />
                    </label>
                    <div className={styles.endpoints}>
                        {endpoints.map((endpoint) => (
                            <EndpointItem
                                key={endpoint.id}
                                endpoint={endpoint}
                                open={expanded === endpoint.id}
                                onOpenChange={(open) => setExpanded(open ? endpoint.id : null)}
                            />
                        ))}
                        {endpoints.length === 0 && (
                            <p className={styles.empty}>No tool matches “{query}”.</p>
                        )}
                    </div>
                </Tabs.Content>
                <Tabs.Content value="setup" className={styles.panel}>
                    <Snippet label="From your agent (MCP)" code={mcpExample(first)} />
                    <Snippet
                        label="Connect the MCP server"
                        code={`claude mcp add --transport http kivel ${siteOrigin}/mcp`}
                    />
                    <Snippet label="Instructions for any agent" code={`${siteOrigin}/SKILL.md`} />
                </Tabs.Content>
            </Tabs.Root>
        </Drawer>
    );
}

function Snippet({ label, code }: { label: string; code: string }) {
    return (
        <div className={styles.snippet}>
            <span className={styles.snippetLabel}>{label}</span>
            <div className={styles.code}>
                <code>{code}</code>
                <CopyButton value={code} tone="dark" />
            </div>
        </div>
    );
}
