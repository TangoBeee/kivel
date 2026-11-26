'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { cx } from './cx';
import styles from './copy-button.module.css';

/** Copies text and confirms in place. */
export function CopyButton({
    value,
    label = 'Copy',
    tone = 'light',
}: {
    value: string;
    label?: string;
    tone?: 'light' | 'dark';
}) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard can be blocked; the text stays visible to copy by hand.
        }
    }
    return (
        <button
            type="button"
            onClick={copy}
            className={cx(styles.copy, styles[tone])}
            aria-label={copied ? 'Copied' : `${label}: ${value.slice(0, 60)}`}
        >
            {copied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
            <span aria-live="polite">{copied ? 'Copied' : label}</span>
        </button>
    );
}
