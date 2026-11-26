import { cx } from './cx';
import styles from './live-dot.module.css';

/** A pulsing dot for live, waiting states; green and still once done. */
export function LiveDot({ done = false }: { done?: boolean }) {
    return <span className={cx(styles.dot, done && styles.done)} aria-hidden="true" />;
}
