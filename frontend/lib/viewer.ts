'use client';

import { useEffect, useState } from 'react';

// Who is looking at the page. Asked once per visit and shared by every component that needs it.
export type Viewer =
    | { status: 'loading' }
    | { status: 'guest' }
    | { status: 'user'; username: string; workspace: string };

let pending: Promise<Viewer> | null = null;
const listeners = new Set<(viewer: Viewer) => void>();

function load(): Promise<Viewer> {
    pending ??= fetch('/api/account', { cache: 'no-store', credentials: 'same-origin' })
        .then(async (response): Promise<Viewer> => {
            if (!response.ok) return { status: 'guest' };
            const account = await response.json();
            return {
                status: 'user',
                username: account.user.username,
                workspace: account.account.name,
            };
        })
        .catch((): Viewer => ({ status: 'guest' }));
    return pending;
}

/** Ask again after signing in or out, and tell every listening component. */
export function refreshViewer() {
    pending = null;
    void load().then((viewer) => listeners.forEach((listener) => listener(viewer)));
}

export function useViewer(): Viewer {
    const [viewer, setViewer] = useState<Viewer>({ status: 'loading' });
    useEffect(() => {
        let live = true;
        void load().then((value) => live && setViewer(value));
        listeners.add(setViewer);
        return () => {
            live = false;
            listeners.delete(setViewer);
        };
    }, []);
    return viewer;
}
