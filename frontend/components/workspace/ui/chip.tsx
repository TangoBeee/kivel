import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './chip.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    pressed?: boolean;
    count?: number | string;
};

/** A filter pill with an optional count. */
export function Chip({ pressed = false, count, className, children, ...props }: Props) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            className={cx(styles.chip, className)}
            {...props}
        >
            {children}
            {count !== undefined && <small>{count}</small>}
        </button>
    );
}

/** A row of chips that scrolls sideways when it runs out of room. */
export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div role="group" aria-label={label} className={styles.row}>
            {children}
        </div>
    );
}
