import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';

export type WorkspaceTone = 'email' | 'webhooks' | 'mocks' | 'monitors' | 'approvals';

export function WorkspaceIcon({ icon: Icon, tone }: { icon: Icon; tone: WorkspaceTone }) {
    return (
        <span className="workspace-icon" data-tone={tone}>
            <Icon size={17} aria-hidden="true" />
        </span>
    );
}

export function WorkspaceCard({
    title,
    icon,
    action,
    children,
}: {
    title: string;
    icon?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="workspace-card">
            <header>
                {icon}
                <h2>{title}</h2>
                {action && <div>{action}</div>}
            </header>
            {children}
        </section>
    );
}

export function WorkspaceEmpty({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="workspace-empty">
            <strong>{title}</strong>
            <p>{children}</p>
        </div>
    );
}

export function WorkspaceStat({
    icon,
    tone,
    title,
    value,
    note = 'Last 7 days',
    series,
    max,
    onOpen,
}: {
    icon: Icon;
    tone: WorkspaceTone;
    title: string;
    value: string;
    note?: string;
    series: (number | null)[];
    max?: number;
    onOpen: () => void;
}) {
    const empty =
        max === undefined ? !series.some(Boolean) : series.every((point) => point === null);
    const peak = max ?? Math.max(1, ...series.map((point) => point ?? 0));
    const points = series.map(
        (point, index) =>
            [
                index * (200 / (series.length - 1)),
                point === null ? null : 26 - (22 * point) / peak,
            ] as const,
    );
    return (
        <button type="button" className="workspace-stat" data-tone={tone} onClick={onOpen}>
            <span className="workspace-stat-title">
                <WorkspaceIcon icon={icon} tone={tone} />
                {title}
            </span>
            <span className="workspace-stat-value">
                <strong>{value}</strong>
                <small>{empty ? 'No activity yet' : note}</small>
            </span>
            <svg viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true">
                {empty ? (
                    <line
                        className="workspace-stat-baseline"
                        x1="0"
                        x2="200"
                        y1="24"
                        y2="24"
                        vectorEffect="non-scaling-stroke"
                    />
                ) : (
                    points.map(([x, y], i) => {
                        const previous = points[i - 1];
                        if (y === null) return null;
                        if (!previous || previous[1] === null)
                            return <circle key={x} cx={x} cy={y} r="1.6" />;
                        return (
                            <line
                                key={x}
                                x1={previous[0]}
                                y1={previous[1]}
                                x2={x}
                                y2={y}
                                vectorEffect="non-scaling-stroke"
                            />
                        );
                    })
                )}
            </svg>
        </button>
    );
}
