// The socket.help mark: a power socket face on a green tile. Kept in sync with app/icon.svg.
export function LogoMark({ size = 28 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="11" fill="#286747" />
            <circle cx="20" cy="20" r="12.5" fill="#edf5ed" />
            <rect x="14.5" y="13.5" width="3.5" height="8.5" rx="1.75" fill="#286747" />
            <rect x="22" y="13.5" width="3.5" height="8.5" rx="1.75" fill="#286747" />
            <circle cx="20" cy="26.5" r="2" fill="#286747" />
        </svg>
    );
}
