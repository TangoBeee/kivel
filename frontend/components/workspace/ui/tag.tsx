import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './tag.module.css';

export type TagTone = 'neutral' | 'ok' | 'warn' | 'accent' | 'bad';

/** A small status pill, such as "Your key" or "Needs your key". */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
    return <span className={cx(styles.tag, styles[tone])}>{children}</span>;
}
