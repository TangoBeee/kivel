'use client';

import { useEffect, useState } from 'react';
import { catalog } from './catalog';

const KEY = 'kivel:saved-tools';
const EVENT = 'kivel:saved-tools';
const available = new Set(
    catalog.filter((tool) => tool.status === 'available').map((tool) => tool.id),
);

function read(): string[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(value)
            ? [
                  ...new Set(
                      value.filter(
                          (id): id is string => typeof id === 'string' && available.has(id),
                      ),
                  ),
              ].slice(0, 100)
            : [];
    } catch {
        return [];
    }
}

export function useSavedTools() {
    const [ids, setIds] = useState<string[]>([]);
    const [error, setError] = useState('');
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

    function toggle(id: string) {
        if (!available.has(id)) return;
        const current = read();
        const next = current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id];
        if (next.length > 100) {
            setError('You can save up to 100 tools. Remove one to save another.');
            return;
        }
        try {
            localStorage.setItem(KEY, JSON.stringify(next));
            setIds(next);
            setError('');
            dispatchEvent(new Event(EVENT));
        } catch {
            setError('Your browser could not save this tool. Allow site storage and try again.');
        }
    }

    return {
        ids,
        tools: ids.flatMap((id) => catalog.find((tool) => tool.id === id) ?? []),
        toggle,
        error,
    };
}
