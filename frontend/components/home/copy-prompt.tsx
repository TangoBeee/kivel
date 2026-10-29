'use client';

import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';

/** Copies the setup prompt a human pastes into their agent. */
export function CopyPrompt({
    prompt,
    className = 'home-button home-button-primary',
}: {
    prompt: string;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2200);
        } catch {}
    }
    return (
        <button type="button" className={className} onClick={copy}>
            {copied ? <Check size={18} weight="bold" /> : <Copy size={18} weight="bold" />}
            <span aria-live="polite">
                {copied ? 'Copied. Paste it into your agent' : 'Copy setup prompt'}
            </span>
        </button>
    );
}
