'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Tabs, TextArea } from '@radix-ui/themes';
import { integrations } from '../../lib/integrations';
import { CodeExample } from '../code-example';
import { Icon } from '../icons';

export function Interfaces() {
    const [active, setActive] = useState('web');
    const [input, setInput] = useState('{"hello":true,"tools":["json","webhooks"]}');
    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function format() {
        setBusy(true);
        setError('');
        try {
            const { formatJson } = await import('@socket-help/tools/engine');
            setOutput(formatJson(input));
        } catch (failure) {
            setOutput('');
            setError(failure instanceof Error ? failure.message : 'Unable to format JSON.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <Tabs.Root value={active} onValueChange={setActive} className="interface-demo">
            <Tabs.List aria-label="Ways to use socket.help">
                <Tabs.Trigger value="web">
                    <Icon name="globe" size={16} />
                    Browser
                </Tabs.Trigger>
                {integrations.map((item) => (
                    <Tabs.Trigger key={item.id} value={item.id}>
                        <Icon name={item.icon} size={16} />
                        {item.id === 'http'
                            ? 'cURL'
                            : item.id === 'sdk'
                              ? 'SDK'
                              : item.id === 'cli'
                                ? 'CLI'
                                : item.id.toUpperCase()}
                    </Tabs.Trigger>
                ))}
            </Tabs.List>
            <Tabs.Content value="web" className="interface-demo-content">
                <div className="interface-demo-copy">
                    <span className="content-tag">Runs locally</span>
                    <h3>Try the JSON formatter.</h3>
                    <p>Format this JSON in your browser. Your input stays on this device.</p>
                    <Button onClick={format} disabled={busy}>
                        {busy ? 'Formatting…' : 'Format JSON'}
                        <Icon name="arrow" size={15} />
                    </Button>
                    <Link href="/tools/json-formatter/">Open the full tool →</Link>
                </div>
                <div className="interface-live">
                    <label htmlFor="interface-json">JSON input</label>
                    <TextArea
                        id="interface-json"
                        value={input}
                        maxLength={1048576}
                        onChange={(event) => setInput(event.target.value)}
                        rows={3}
                        spellCheck={false}
                    />
                    <span className="interface-output-label">Output</span>
                    <pre aria-live="polite">
                        {error || output || 'Select Format JSON to see the result.'}
                    </pre>
                </div>
            </Tabs.Content>
            {integrations.map((item) => (
                <Tabs.Content value={item.id} key={item.id} className="interface-demo-content">
                    <div className="interface-demo-copy">
                        <span className="content-tag">{item.availability}</span>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <Link href={`/integrations/#${item.id}`}>Setup and requirements →</Link>
                    </div>
                    <CodeExample title={`${item.title} example`} code={item.code} />
                </Tabs.Content>
            ))}
        </Tabs.Root>
    );
}
