'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Button, IconButton, Tooltip } from '@radix-ui/themes';

export function CopyButton({
    text,
    label = 'Copy',
    compact = false,
}: {
    text: string;
    label?: string;
    compact?: boolean;
}) {
    const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setStatus('copied');
        } catch {
            setStatus('failed');
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus('idle'), 2000);
    }
    const name = status === 'idle' ? label : status === 'copied' ? 'Copied' : 'Copy failed';
    return compact ? (
        <Tooltip
            content={
                status === 'failed' ? 'Clipboard unavailable. Select and copy the text.' : name
            }
        >
            <IconButton size="2" variant="surface" color="gray" onClick={copy} aria-label={name}>
                <Icon name={status === 'copied' ? 'check' : 'copy'} size={16} />
            </IconButton>
        </Tooltip>
    ) : (
        <Button size="2" variant="surface" color="gray" onClick={copy} aria-label={name}>
            <Icon name={status === 'copied' ? 'check' : 'copy'} size={15} />
            <span aria-live="polite">{name}</span>
        </Button>
    );
}
