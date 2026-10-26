'use client';

// Remembers where a tool was opened from, so the tool page can offer a way straight back.
const KEY = 'socket-help:return';
const normalise = (path: string) => path.replace(/\/?$/, '/');

export function rememberReturn(targetPath: string, backHref: string, label: string) {
    try {
        sessionStorage.setItem(
            KEY,
            JSON.stringify({ target: normalise(targetPath), back: backHref, label }),
        );
    } catch {}
}

export function readReturn(currentPath: string): { back: string; label: string } | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
        return saved && saved.target === normalise(currentPath)
            ? { back: saved.back, label: saved.label }
            : null;
    } catch {
        return null;
    }
}
