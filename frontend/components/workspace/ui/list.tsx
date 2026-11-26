import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { cx } from './cx';
import styles from './list.module.css';

/** A labelled group: a small heading above a hairline list. */
export function ListGroup({
    label,
    meta,
    children,
}: {
    label: ReactNode;
    meta?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={styles.group}>
            <header className={styles.groupHead}>
                <h2>{label}</h2>
                {meta && <span>{meta}</span>}
            </header>
            <div className={styles.list}>{children}</div>
        </section>
    );
}

type RowProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    name: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
};

/** One clickable row: icon, name, a one-line description and right-aligned meta. */
export function ListRow({ icon, name, description, meta, className, ...props }: RowProps) {
    return (
        <button type="button" className={cx(styles.row, className)} {...props}>
            {icon}
            <span className={styles.name}>{name}</span>
            <span className={styles.description}>{description}</span>
            <span className={styles.meta}>{meta}</span>
            <CaretRight className={styles.chevron} size={13} weight="bold" aria-hidden="true" />
        </button>
    );
}

/** A quiet message inside a list. */
export function ListEmpty({ children }: { children: ReactNode }) {
    return <p className={styles.empty}>{children}</p>;
}
