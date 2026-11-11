export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
    const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
    return (
        <span
            className={`usage-bar ${ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-near' : ''}`}
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(used, limit)}
            aria-valuetext={`${used.toLocaleString()} of ${limit.toLocaleString()}`}
        >
            <i style={{ width: `${ratio * 100}%` }} />
        </span>
    );
}
