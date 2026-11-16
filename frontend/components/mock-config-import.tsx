'use client';

import { useState } from 'react';
import { Button, TextArea } from '@radix-ui/themes';
import { validateMock } from '@kivel.io/tools/mock-config';
import type { MockConfig } from '@kivel.io/tools/mock-config';

export function MockConfigImport({
    busy,
    onImport,
}: {
    busy: boolean;
    onImport: (config: MockConfig) => void;
}) {
    const [input, setInput] = useState('');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    return (
        <details className="resource-access">
            <summary>Import configuration</summary>
            <label className="field-label">
                Mock configuration (JSON)
                <TextArea
                    rows={4}
                    maxLength={400_000}
                    value={input}
                    disabled={busy}
                    onChange={(event) => setInput(event.target.value)}
                />
            </label>
            <Button
                type="button"
                size="2"
                variant="surface"
                disabled={busy || !input.trim()}
                onClick={() => {
                    setError('');
                    setNotice('');
                    try {
                        onImport(validateMock(JSON.parse(input)));
                        setInput('');
                        setNotice('Configuration loaded. Save the mock to apply it.');
                    } catch (failure) {
                        setError(
                            failure instanceof SyntaxError
                                ? 'Enter a valid JSON configuration.'
                                : (failure as Error).message,
                        );
                    }
                }}
            >
                Load configuration
            </Button>
            {notice && <p role="status">{notice}</p>}
            {error && <p role="alert">{error}</p>}
        </details>
    );
}
