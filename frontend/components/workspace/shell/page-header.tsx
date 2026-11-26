import type { ReactNode } from 'react';
import styles from './page-header.module.css';

/** Title, one-line description and the page's actions. */
export function PageHeader({
    title,
    description,
    actions,
    eyebrow,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    eyebrow?: ReactNode;
}) {
    return (
        <header className={styles.header}>
            <div>
                {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
                <h1>{title}</h1>
                {description && <p>{description}</p>}
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
