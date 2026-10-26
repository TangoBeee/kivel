'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from './copy-button';

export function ApiExample({ code }: { code: string }) {
    const [origin, setOrigin] = useState('https://socket.help');
    useEffect(() => {
        setOrigin(location.origin);
    }, []);
    const example = code.replaceAll('https://socket.help', origin);
    return (
        <div className="code-row">
            <pre>{example}</pre>
            <CopyButton text={example} label="Copy example" compact />
        </div>
    );
}
