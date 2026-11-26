import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md';
};

/** Workspace button: ink for the main action, hairline for the rest. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
    { variant = 'secondary', size = 'md', className, type = 'button', ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            className={cx(styles.button, styles[variant], styles[size], className)}
            {...props}
        />
    );
});
