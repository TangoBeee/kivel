'use client';
import { useEffect, useState } from 'react';
import { Checkbox, Dialog, IconButton } from '@radix-ui/themes';
import { MagnifyingGlass, PencilSimple, X } from '@phosphor-icons/react';
import { catalog, categoryTints, searchTools } from '../lib/catalog';
import { useSavedTools } from '../lib/saved-tools';
import { Icon } from './icons';

// Which tool pages the sidebar hides. Kept in this browser, like saved tools.
const KEY = 'socket-help:hidden-nav';
const EVENT = 'socket-help:hidden-nav';
const read = (): string[] => {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

export function useHiddenNav() {
    const [hidden, setHidden] = useState<string[]>([]);
    useEffect(() => {
        const sync = () => setHidden(read());
        sync();
        addEventListener(EVENT, sync);
        return () => removeEventListener(EVENT, sync);
    }, []);
    const toggle = (id: string) => {
        const current = read();
        const next = current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id];
        try {
            localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        setHidden(next);
        dispatchEvent(new Event(EVENT));
    };
    return { hidden, toggle };
}

const available = catalog.filter((tool) => tool.status === 'available');

/** Choose which tool pages the sidebar shows, and pin any utility to it. */
export function NavCustomize({
    pages,
}: {
    pages: { id: string; label: string; icon: React.ReactNode }[];
}) {
    const { hidden, toggle } = useHiddenNav();
    const saved = useSavedTools();
    const [query, setQuery] = useState('');
    const matches = query.trim() ? searchTools(query, available) : available;
    const pinned = new Set(saved.ids);
    // Pinned first, so they are easy to remove.
    const list = [
        ...matches.filter((tool) => pinned.has(tool.id)),
        ...matches.filter((tool) => !pinned.has(tool.id)),
    ];
    return (
        <Dialog.Root onOpenChange={(open) => !open && setQuery('')}>
            <Dialog.Trigger>
                <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="Choose the tools in your sidebar"
                    className="nav-edit"
                >
                    <PencilSimple size={13} />
                </IconButton>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="520px" className="nav-customize">
                <div className="nav-customize-head">
                    <Dialog.Title size="4">Your tools</Dialog.Title>
                    <Dialog.Close>
                        <IconButton variant="ghost" color="gray" aria-label="Close">
                            <X size={16} />
                        </IconButton>
                    </Dialog.Close>
                </div>
                <Dialog.Description size="2" color="gray">
                    Pick what shows in your sidebar. This is saved in this browser.
                </Dialog.Description>
                <h3>Tool pages</h3>
                <div className="nav-customize-list">
                    {pages.map((page) => (
                        <label key={page.id}>
                            <Checkbox
                                checked={!hidden.includes(page.id)}
                                onCheckedChange={() => toggle(page.id)}
                            />
                            {page.icon}
                            {page.label}
                        </label>
                    ))}
                </div>
                <h3>Pinned utilities {saved.ids.length > 0 && <span>{saved.ids.length}</span>}</h3>
                <label className="utility-search nav-customize-search">
                    <MagnifyingGlass size={16} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={`Search ${available.length} tools to pin`}
                        aria-label="Search tools to pin"
                    />
                </label>
                <div className="nav-customize-list is-scroll">
                    {list.map((tool) => (
                        <label key={tool.id}>
                            <Checkbox
                                checked={pinned.has(tool.id)}
                                onCheckedChange={() => saved.toggle(tool.id)}
                            />
                            <span
                                className="nav-chip"
                                style={
                                    {
                                        '--tint': categoryTints[tool.categoryId],
                                    } as React.CSSProperties
                                }
                            >
                                <Icon name={tool.icon} size={12} />
                            </span>
                            {tool.name}
                        </label>
                    ))}
                </div>
                {saved.error && <p className="account-message error">{saved.error}</p>}
            </Dialog.Content>
        </Dialog.Root>
    );
}
