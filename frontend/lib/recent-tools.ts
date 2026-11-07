'use client';

import { useEffect, useState } from 'react';
import { catalog } from './catalog';
import type { CatalogTool } from './catalog';

// The tools this browser opened most recently. Stored locally only, never sent anywhere.
const KEY = 'kivel:recent-tools';
const LIMIT = 8;
const EVENT = 'kivel:recent-tools';

function read(): string[] {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

export function recordToolVisit(toolId: string) {
    try {
        const next = [toolId, ...read().filter((id) => id !== toolId)].slice(0, LIMIT);
        localStorage.setItem(KEY, JSON.stringify(next));
        dispatchEvent(new Event(EVENT));
    } catch {}
}

export function clearRecentTools() {
    try {
        localStorage.removeItem(KEY);
        dispatchEvent(new Event(EVENT));
    } catch {}
}

/** Recently opened tools that are still available, newest first. Empty on the server and first render. */
export function useRecentTools(): CatalogTool[] {
    const [ids, setIds] = useState<string[]>([]);
    useEffect(() => {
        const sync = () => setIds(read());
        sync();
        addEventListener(EVENT, sync);
        addEventListener('storage', sync);
        return () => {
            removeEventListener(EVENT, sync);
            removeEventListener('storage', sync);
        };
    }, []);
    return ids
        .map((id) => catalog.find((tool) => tool.id === id))
        .filter((tool): tool is CatalogTool => !!tool && tool.status === 'available');
}
