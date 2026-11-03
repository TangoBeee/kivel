'use client';

import Link from 'next/link';
import { toolCapability, toolAvailability } from '../lib/catalog';
import { clearPrivateSession, sessionSource } from '../lib/private-session';
import { useRouter } from 'next/navigation';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Badge,
    Button,
    Dialog,
    Flex,
    IconButton,
    Kbd,
    Theme,
    VisuallyHidden,
} from '@radix-ui/themes';
import { Command } from 'cmdk';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
    catalog,
    categories,
    categoryHref,
    categoryRoadmap,
    searchTools,
    toolPageHref,
} from '../lib/catalog';
import type { CatalogTool } from '../lib/catalog';
import { Icon } from './icons';
import { useRecentTools } from '../lib/recent-tools';

interface ToolboxContext {
    openSearch: () => void;
    previewTool: (tool: CatalogTool) => void;
    shortcut: string;
    capabilities: {
        emailReceiving: boolean;
        smtpCapture: boolean;
        phones: boolean;
        authenticators?: boolean;
        oauthProviders?: boolean;
    } | null;
}
const Context = createContext<ToolboxContext | null>(null);
export function useToolbox() {
    const value = useContext(Context);
    if (!value) throw new Error('Toolbox provider is missing.');
    return value;
}

export function ToolboxProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [capabilities, setCapabilities] = useState<ToolboxContext['capabilities']>(null);
    useEffect(() => {
        const controller = new AbortController();
        void fetch('/api/capabilities', { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then(setCapabilities)
            .catch(() => {});
        return () => controller.abort();
    }, []);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [planned, setPlanned] = useState<CatalogTool | null>(null);
    const [shortcut, setShortcut] = useState('Ctrl K');
    const [secret, setSecret] = useState<'ping' | 'tea' | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const previewFocus = useRef<HTMLElement | null>(null);
    const reduceMotion = useReducedMotion();
    const recent = useRecentTools();

    const openSearch = useCallback(() => {
        returnFocus.current = document.activeElement as HTMLElement;
        setQuery('');
        setSecret(null);
        setSearchOpen(true);
    }, []);
    const previewTool = useCallback(
        (tool: CatalogTool) => {
            previewFocus.current = searchOpen
                ? returnFocus.current
                : (document.activeElement as HTMLElement);
            setSearchOpen(false);
            setPlanned(tool);
        },
        [searchOpen],
    );
    const context = useMemo(
        () => ({ openSearch, previewTool, shortcut, capabilities }),
        [openSearch, previewTool, shortcut, capabilities],
    );
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel('socket-help-session');
        channel.onmessage = (event: MessageEvent) => {
            if (event.data?.type === 'clear-session' && event.data.source !== sessionSource()) {
                clearPrivateSession(false);
                location.reload();
            }
        };
        return () => channel.close();
    }, []);
    useEffect(() => {
        setShortcut(/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K');
        function keyboard(event: KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                if (!searchOpen) returnFocus.current = document.activeElement as HTMLElement;
                setQuery('');
                setSecret(null);
                setSearchOpen((open) => !open);
            }
        }
        window.addEventListener('keydown', keyboard);
        return () => {
            window.removeEventListener('keydown', keyboard);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [searchOpen]);
    function visit(tool: CatalogTool) {
        if (tool.status === 'coming-soon') {
            previewTool(tool);
            return;
        }
        setSearchOpen(false);
        router.push(tool.href!);
    }
    const matches = searchTools(query).map((tool) =>
        capabilities ? toolAvailability(tool, capabilities) : tool,
    );
    const matchingCategories = categories.filter(
        (category) =>
            !query.trim() ||
            `${category.name} ${category.description}`
                .toLowerCase()
                .includes(query.trim().toLowerCase()) ||
            (!matches.length &&
                categoryRoadmap(category.id)
                    .join(' ')
                    .toLowerCase()
                    .includes(query.trim().toLowerCase())),
    );
    const activeCategory = categories.find((category) => category.id === planned?.categoryId);

    return (
        <Theme
            appearance="light"
            accentColor="green"
            grayColor="gray"
            radius="large"
            scaling="100%"
        >
            <MotionConfig
                reducedMotion="user"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
                <Context.Provider value={context}>
                    {children}
                    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
                        <Dialog.Content
                            className="command-dialog"
                            maxWidth="640px"
                            onOpenAutoFocus={(event) => {
                                event.preventDefault();
                                input.current?.focus();
                            }}
                            onCloseAutoFocus={(event) => {
                                event.preventDefault();
                                if (!planned) returnFocus.current?.focus();
                            }}
                        >
                            <VisuallyHidden>
                                <Dialog.Title>Search tools and categories</Dialog.Title>
                                <Dialog.Description>
                                    Find available tools or explore the roadmap.
                                </Dialog.Description>
                            </VisuallyHidden>
                            <Command
                                shouldFilter={false}
                                loop
                                label="Tool search"
                                onKeyDown={(event) => {
                                    const command = query.trim().toLowerCase();
                                    if (
                                        event.key === 'Enter' &&
                                        ['/ping', '/tea'].includes(command)
                                    ) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setSecret(command === '/ping' ? 'ping' : 'tea');
                                        if (timer.current) clearTimeout(timer.current);
                                        timer.current = setTimeout(() => {
                                            setSecret(null);
                                            setQuery('');
                                        }, 2200);
                                    }
                                }}
                            >
                                <div className="command-input-row">
                                    <Icon name="search" size={22} />
                                    <Command.Input
                                        ref={input}
                                        value={query}
                                        onValueChange={(value) => {
                                            setSecret(null);
                                            setQuery(value);
                                        }}
                                        placeholder="Search tools and categories…"
                                        aria-label="Search tools and categories"
                                    />
                                    <Dialog.Close>
                                        <IconButton
                                            variant="ghost"
                                            color="gray"
                                            aria-label="Close search"
                                        >
                                            <Icon name="close" size={17} />
                                        </IconButton>
                                    </Dialog.Close>
                                </div>
                                <Command.List className="command-list">
                                    <AnimatePresence mode="wait">
                                        {secret ? (
                                            <motion.div
                                                key={secret}
                                                className="search-secret"
                                                initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                role="status"
                                            >
                                                <span
                                                    className={
                                                        secret === 'ping'
                                                            ? 'ping-ring'
                                                            : 'tea-steam'
                                                    }
                                                >
                                                    <Icon
                                                        name={
                                                            secret === 'ping' ? 'pulse' : 'coffee'
                                                        }
                                                        size={28}
                                                    />
                                                </span>
                                                <code>
                                                    {secret === 'ping'
                                                        ? 'pong'
                                                        : '418 · I’m a teapot.'}
                                                </code>
                                            </motion.div>
                                        ) : (
                                            <div key="results">
                                                {!query.trim() && recent.length > 0 && (
                                                    <Command.Group heading="Recently used">
                                                        {recent.slice(0, 5).map((tool) => (
                                                            <Command.Item
                                                                key={`recent-${tool.id}`}
                                                                value={`recent:${tool.id}`}
                                                                onSelect={() => visit(tool)}
                                                            >
                                                                <span className="search-result-icon">
                                                                    <Icon
                                                                        name={tool.icon}
                                                                        size={19}
                                                                    />
                                                                </span>
                                                                <span className="search-result-copy">
                                                                    <strong>{tool.name}</strong>
                                                                    <span>{tool.description}</span>
                                                                </span>
                                                                <Icon name="arrow-up" size={16} />
                                                            </Command.Item>
                                                        ))}
                                                    </Command.Group>
                                                )}
                                                {!query.trim() && (
                                                    <div className="command-section-label">
                                                        Explore categories
                                                    </div>
                                                )}
                                                {!!matchingCategories.length && (
                                                    <Command.Group
                                                        heading={
                                                            query.trim() ? 'Categories' : undefined
                                                        }
                                                    >
                                                        {matchingCategories
                                                            .slice(0, query ? 4 : 6)
                                                            .map((category) => (
                                                                <Command.Item
                                                                    key={category.id}
                                                                    value={`category:${category.id}`}
                                                                    onSelect={() => {
                                                                        setSearchOpen(false);
                                                                        router.push(
                                                                            categoryHref(
                                                                                category.id,
                                                                            ),
                                                                        );
                                                                    }}
                                                                >
                                                                    <span className="search-result-icon">
                                                                        <Icon
                                                                            name={category.icon}
                                                                            size={19}
                                                                        />
                                                                    </span>
                                                                    <span className="search-result-copy">
                                                                        <strong>
                                                                            {category.name}
                                                                        </strong>
                                                                        <span>
                                                                            {category.description}
                                                                        </span>
                                                                    </span>
                                                                    <Icon
                                                                        name="chevron"
                                                                        size={15}
                                                                    />
                                                                </Command.Item>
                                                            ))}
                                                    </Command.Group>
                                                )}
                                                {!!query.trim() && (
                                                    <Command.Group heading="Tools">
                                                        {matches.map((tool) => (
                                                            <Command.Item
                                                                key={tool.id}
                                                                value={tool.id}
                                                                onSelect={() => visit(tool)}
                                                            >
                                                                <span className="search-result-icon">
                                                                    <Icon
                                                                        name={tool.icon}
                                                                        size={19}
                                                                    />
                                                                </span>
                                                                <span className="search-result-copy">
                                                                    <strong>{tool.name}</strong>
                                                                    <span>
                                                                        {
                                                                            categories.find(
                                                                                (category) =>
                                                                                    category.id ===
                                                                                    tool.categoryId,
                                                                            )?.name
                                                                        }
                                                                    </span>
                                                                </span>
                                                                <Availability tool={tool} />
                                                            </Command.Item>
                                                        ))}
                                                    </Command.Group>
                                                )}
                                                {!query.trim() && (
                                                    <Command.Group heading="Available now">
                                                        {catalog
                                                            .filter(
                                                                (tool) =>
                                                                    tool.status === 'available',
                                                            )
                                                            .map((tool) => (
                                                                <Command.Item
                                                                    key={tool.id}
                                                                    value={tool.id}
                                                                    onSelect={() => visit(tool)}
                                                                >
                                                                    <span className="search-result-icon">
                                                                        <Icon
                                                                            name={tool.icon}
                                                                            size={19}
                                                                        />
                                                                    </span>
                                                                    <span className="search-result-copy">
                                                                        <strong>{tool.name}</strong>
                                                                        <span>
                                                                            {tool.local
                                                                                ? 'Runs in your browser'
                                                                                : 'A live endpoint, ready to use'}
                                                                        </span>
                                                                    </span>
                                                                    <Icon
                                                                        name="arrow-up"
                                                                        size={16}
                                                                    />
                                                                </Command.Item>
                                                            ))}
                                                    </Command.Group>
                                                )}
                                                {query.trim() &&
                                                    !matches.length &&
                                                    !matchingCategories.length && (
                                                        <Command.Empty>
                                                            <Icon name="search" size={24} />
                                                            <strong>No matching tools</strong>
                                                            <span>
                                                                Try a category, like “PDF”, “email”,
                                                                or “MCP”.
                                                            </span>
                                                        </Command.Empty>
                                                    )}
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </Command.List>
                                <div className="command-footer">
                                    <span>
                                        <Kbd>↑</Kbd>
                                        <Kbd>↓</Kbd> to navigate
                                    </span>
                                    <span>
                                        <Kbd>↵</Kbd> to open
                                    </span>
                                    <span>
                                        <Kbd>esc</Kbd> to close
                                    </span>
                                </div>
                            </Command>
                        </Dialog.Content>
                    </Dialog.Root>
                    <Dialog.Root
                        open={planned !== null}
                        onOpenChange={(open) => {
                            if (!open) setPlanned(null);
                        }}
                    >
                        <Dialog.Content
                            maxWidth="460px"
                            className="tool-preview"
                            onCloseAutoFocus={(event) => {
                                event.preventDefault();
                                previewFocus.current?.focus();
                            }}
                        >
                            {planned && (
                                <>
                                    <div className="preview-top">
                                        <span className="preview-icon">
                                            <Icon name={planned.icon} size={25} />
                                        </span>
                                        <Badge color="gray" variant="soft">
                                            Coming soon
                                        </Badge>
                                    </div>
                                    <Dialog.Title size="6">{planned.name}</Dialog.Title>
                                    <Dialog.Description size="3" color="gray">
                                        {planned.description}
                                    </Dialog.Description>
                                    <div className="preview-note">
                                        <Icon name="clock" size={17} />
                                        <p>
                                            Part of the socket.help roadmap. This tool isn’t
                                            available yet.
                                        </p>
                                    </div>
                                    {activeCategory && (
                                        <Link
                                            className="preview-category"
                                            href={toolPageHref(planned)}
                                            onClick={() => setPlanned(null)}
                                        >
                                            <Icon name={activeCategory.icon} size={18} />
                                            <span>About {planned.name.toLowerCase()}</span>
                                            <Icon name="arrow" size={16} />
                                        </Link>
                                    )}
                                    <Flex justify="end" mt="5">
                                        <Dialog.Close>
                                            <Button variant="soft" color="gray">
                                                Got it
                                            </Button>
                                        </Dialog.Close>
                                    </Flex>
                                </>
                            )}
                        </Dialog.Content>
                    </Dialog.Root>
                </Context.Provider>
            </MotionConfig>
        </Theme>
    );
}

export function ToolCapabilityNotice({ toolId }: { toolId: string }) {
    const { capabilities } = useToolbox();
    const capability = toolCapability(toolId);
    const pending = capability && capabilities && !capabilities[capability];
    return pending ? (
        <p className="tool-notice" role="status">
            This server has not enabled{' '}
            {toolId === 'agents-agent-authenticator'
                ? 'encrypted authenticator storage'
                : toolId === 'email-mock-smtp'
                  ? 'TLS SMTP capture'
                  : 'agent mail receiving'}{' '}
            yet. This page documents the feature; creating it will become available after operator
            setup.
        </p>
    ) : null;
}
export function Availability({ tool }: { tool: CatalogTool }) {
    const { capabilities } = useToolbox();
    const capability = toolCapability(tool.id);
    if (capability && !capabilities) return <span className="badge">Checking availability</span>;
    if (capabilities && 'availabilityReason' in toolAvailability(tool, capabilities))
        return <span className="badge">Not enabled</span>;
    return (
        <>
            {tool.minimumPlan && tool.minimumPlan !== 'free' && (
                <Badge color="gray" variant="outline">
                    {tool.minimumPlan === 'pro' ? 'Pro' : 'Team'}
                </Badge>
            )}
            <Badge
                variant="soft"
                color={tool.status === 'available' ? 'green' : 'gray'}
                className="availability-badge"
            >
                {tool.status === 'available' ? 'Available' : 'Coming soon'}
            </Badge>
        </>
    );
}

export function SearchLaunch({ compact = false }: { compact?: boolean }) {
    const { openSearch, shortcut } = useToolbox();
    return (
        <button
            className={compact ? 'header-search' : 'search-launch'}
            onClick={openSearch}
            aria-label="Open tool search"
            aria-keyshortcuts="Meta+K Control+K"
        >
            <Icon name="search" size={compact ? 17 : 21} />
            <span>{compact ? 'Search' : 'Search tools and categories'}</span>
            <Kbd>{shortcut}</Kbd>
        </button>
    );
}
