'use client';

import { useState } from 'react';
import { Button } from '@radix-ui/themes';
import { Icon } from './icons';
import { highlight } from '../lib/highlight';

export function CodeExample({ title, code }: { title: string; code: string }) {
    const [state, setState] = useState('');
    async function copy() {
        try {
            await navigator.clipboard.writeText(code);
            setState('Copied');
        } catch {
            setState('Select the code to copy');
        }
    }
    return (
        <div className="code-example">
            <div className="code-example-bar">
                <span>{title}</span>
                <Button
                    type="button"
                    size="1"
                    variant="ghost"
                    onClick={copy}
                    aria-label={`Copy ${title}`}
                >
                    <Icon name={state === 'Copied' ? 'check' : 'copy'} size={14} />
                    {state === 'Copied' ? 'Copied' : 'Copy'}
                </Button>
            </div>
            <pre>
                <code>{highlight(code)}</code>
            </pre>
            <span className="sr-only" role="status">
                {state}
            </span>
        </div>
    );
}
