'use client';
import { Popover } from 'radix-ui';
import type { UsageItem } from '@kivel.io/tools/plans';
import { Button } from '../ui';
import styles from './usage-menu.module.css';

const resetTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The plan meter in the top bar. Today it shows hosted tool runs; when credits ship
 * (catalog-pivot-plan.md §4) it shows credits left instead, with the same shape.
 */
export function UsageMenu({
    plan,
    runs,
    onOpenUsage,
    onUpgrade,
}: {
    plan: string;
    runs?: UsageItem;
    onOpenUsage: () => void;
    onUpgrade?: () => void;
}) {
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    const used = runs?.used ?? 0;
    const max = runs?.max ?? 0;
    const ratio = max > 0 ? Math.min(1, used / max) : 0;
    return (
        <Popover.Root>
            <Popover.Trigger className={styles.trigger} aria-label={`${planName} plan usage`}>
                <span className={styles.ring} style={{ '--p': ratio } as React.CSSProperties} />
                <b>{planName}</b>
                {max > 0 && (
                    <span className={styles.count}>
                        {used.toLocaleString()} / {max.toLocaleString()}
                    </span>
                )}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content className={`kv-portal ${styles.panel}`} align="end" sideOffset={8}>
                    <div className={styles.head}>
                        <small>Tool runs today</small>
                        <strong>
                            {used.toLocaleString()} <span>of {max.toLocaleString()}</span>
                        </strong>
                        <div className={styles.meter}>
                            <i style={{ width: `${Math.max(ratio * 100, used > 0 ? 3 : 0)}%` }} />
                        </div>
                        <small>
                            {planName} plan
                            {runs?.resetsAt &&
                                ` · resets at ${resetTime.format(new Date(runs.resetsAt))}`}
                        </small>
                    </div>
                    <div className={styles.actions}>
                        <Popover.Close asChild>
                            <Button onClick={onOpenUsage}>See all usage</Button>
                        </Popover.Close>
                        {onUpgrade && (
                            <Popover.Close asChild>
                                <Button variant="primary" onClick={onUpgrade}>
                                    Upgrade
                                </Button>
                            </Popover.Close>
                        )}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
