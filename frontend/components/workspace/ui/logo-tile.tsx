import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './logo-tile.module.css';

/** The square tile that holds a tool's icon, brand logo or monogram. */
export function LogoTile({
    size = 'md',
    children,
}: {
    size?: 'sm' | 'md' | 'lg';
    children: ReactNode;
}) {
    return (
        <span className={cx(styles.tile, styles[size])} aria-hidden="true">
            {children}
        </span>
    );
}
