'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from './copy-button';

export function ApiExample({ code }: { code: string }) {
    const [origin, setOrigin] = useState('https://kivel.io');
    useEffect(() => {
        setOrigin(location.origin);
    }, []);
    const example = code.replaceAll('https://kivel.io', origin);
    return (
        <div className="code-row">
            <pre>{example}</pre>
            <CopyButton text={example} label="Copy example" compact />
        </div>
    );
}
