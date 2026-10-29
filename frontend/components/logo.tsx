// The socket.help mark: an outline wall socket in the text colour. The filled tile version
// (white socket on ink) is the favicon in app/icon.svg; keep the two in sync.
export function LogoMark({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17.5" fill="none" stroke={color} strokeWidth="3.5" />
            <rect x="13.25" y="14.5" width="3.5" height="11" rx="1.75" fill={color} />
            <rect x="23.25" y="14.5" width="3.5" height="11" rx="1.75" fill={color} />
        </svg>
    );
}
