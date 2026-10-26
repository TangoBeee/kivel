let sourceId: string | undefined;
export const sessionSource = () => (sourceId ??= crypto.randomUUID());
export function clearPrivateSession(broadcast = true) {
    try {
        for (const key of Object.keys(sessionStorage))
            if (key === 'socket-webhook-inbox' || /^socket-.+-resource$/.test(key))
                sessionStorage.removeItem(key);
    } catch {}
    if (broadcast && typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('socket-help-session');
        channel.postMessage({ type: 'clear-session', source: sessionSource() });
        channel.close();
    }
}
