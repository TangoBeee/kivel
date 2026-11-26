'use client';
import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from '@phosphor-icons/react';
import styles from './drawer.module.css';

/**
 * A right-hand sheet for details. Radix handles focus trapping, Escape and scroll locking;
 * the motion follows the spec (360ms in on the drawer curve, 220ms out).
 */
export function Drawer({
    open,
    onOpenChange,
    title,
    description,
    header,
    footer,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    header: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className={`kv-portal ${styles.scrim}`} />
                <Dialog.Content className={`kv-portal ${styles.drawer}`}>
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    {description && (
                        <Dialog.Description className="sr-only">{description}</Dialog.Description>
                    )}
                    <div className={styles.head}>
                        {header}
                        <Dialog.Close className={styles.close} aria-label="Close">
                            <X size={14} weight="bold" />
                        </Dialog.Close>
                    </div>
                    <div className={styles.body}>{children}</div>
                    {footer && <div className={styles.foot}>{footer}</div>}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
