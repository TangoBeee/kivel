'use client';
import { renderToolResult } from './tool-result';
import { AppSelect, SelectOption } from './app-select';

import { ResultPreview } from './result-preview';
import { Button } from '@radix-ui/themes';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';
import { CopyButton } from './copy-button';
import { ToolHeader } from './tool-header';
import { tools } from '../lib/tools';
import { runBrowserOperation } from '@kivel.io/tools/engine';
import type { ToolId } from '@kivel.io/tools/engine';

export function BrowserWorkbench({ toolId }: { toolId: string }) {
    const router = useRouter();
    const selected = toolId;
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState('1');
    const [algorithm, setAlgorithm] = useState('SHA-256');
    const operation = useRef(0);
    const structured = useMemo(
        () => (output && selected !== 'json' ? renderToolResult(selected, output) : null),
        [selected, output],
    );
    const current = tools.find((tool) => tool.id === selected) ?? tools[1];

    useEffect(() => {
        operation.current++;
        setInput('');
        setOutput('');
        setError('');
        setBusy(false);
    }, [selected]);
    function select(id: string) {
        router.push(tools.find((tool) => tool.id === id)!.href);
    }
    async function run(action: string) {
        const version = ++operation.current;
        setError('');
        setBusy(true);
        try {
            const result = await runBrowserOperation(selected as ToolId, input, {
                action,
                count,
                algorithm,
            });
            if (version === operation.current) setOutput(result);
        } catch (failure) {
            if (version === operation.current) {
                setOutput('');
                setError(
                    failure instanceof Error ? failure.message : 'Unable to process this input.',
                );
            }
        } finally {
            if (version === operation.current) setBusy(false);
        }
    }
    return (
        <div className="page-width work-page">
            <ToolHeader toolId={current.id}>
                <span className="badge badge-green">
                    <Icon name="shield" size={13} /> Runs in your browser
                </span>
            </ToolHeader>
            <div className="utility-layout">
                <nav className="utility-nav" aria-label="Browser tools">
                    {tools
                        .filter((tool) => tool.local)
                        .map((tool) => (
                            <button
                                key={tool.id}
                                className={selected === tool.id ? 'active' : ''}
                                aria-pressed={selected === tool.id}
                                onClick={() => select(tool.id)}
                            >
                                <Icon name={tool.icon} size={17} />
                                {tool.name.replace(' generator', '').replace(' encoder', '')}
                            </button>
                        ))}
                </nav>
                <div className="utility-panel utility-workbench">
                    <div className="utility-options">
                        {error && (
                            <div className="alert" role="alert">
                                {error}
                            </div>
                        )}
                        {selected !== 'uuid' && (
                            <div className="editor-panel">
                                <div className="editor-heading">
                                    <label htmlFor="tool-input">
                                        {selected === 'json'
                                            ? 'JSON source'
                                            : selected === 'hash'
                                              ? 'Text to hash'
                                              : 'Source text'}
                                    </label>
                                    <button
                                        className="text-link"
                                        onClick={() => {
                                            operation.current++;
                                            setInput('');
                                            setOutput('');
                                            setError('');
                                            setBusy(false);
                                        }}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <textarea
                                    id="tool-input"
                                    value={input}
                                    maxLength={1048576}
                                    spellCheck={false}
                                    onChange={(event) => setInput(event.target.value)}
                                    placeholder={
                                        selected === 'json'
                                            ? 'Paste your JSON here…'
                                            : 'Type or paste your text…'
                                    }
                                />
                            </div>
                        )}
                        <div className="utility-actions">
                            {selected === 'uuid' && (
                                <>
                                    <label htmlFor="uuid-count">Number of IDs</label>
                                    <input
                                        className="count-input"
                                        id="uuid-count"
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={count}
                                        onChange={(event) => setCount(event.target.value)}
                                    />
                                </>
                            )}
                            {selected === 'hash' && (
                                <AppSelect
                                    aria-label="Hash algorithm"
                                    value={algorithm}
                                    onChange={(event) => {
                                        setAlgorithm(event.target.value);
                                        setOutput('');
                                    }}
                                >
                                    {['SHA-256', 'SHA-384', 'SHA-512'].map((name) => (
                                        <SelectOption key={name}>{name}</SelectOption>
                                    ))}
                                </AppSelect>
                            )}
                            <Button
                                size="3"
                                variant="solid"
                                color="green"
                                disabled={busy}
                                onClick={() => void run('encode')}
                            >
                                {busy
                                    ? 'Working…'
                                    : selected === 'json'
                                      ? 'Format JSON'
                                      : selected === 'uuid'
                                        ? 'Generate IDs'
                                        : selected === 'hash'
                                          ? 'Generate hash'
                                          : 'Encode'}
                                <Icon name="arrow" size={15} />
                            </Button>
                            {selected === 'json' && (
                                <Button
                                    size="2"
                                    variant="surface"
                                    color="gray"
                                    disabled={busy}
                                    onClick={() => void run('minify')}
                                >
                                    Minify
                                </Button>
                            )}
                            {['base64', 'url'].includes(selected) && (
                                <Button
                                    size="2"
                                    variant="surface"
                                    color="gray"
                                    disabled={busy}
                                    onClick={() => void run('decode')}
                                >
                                    Decode
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="utility-output">
                        {structured}
                        {structured ? (
                            <details className="artifact-response">
                                <summary>Raw output</summary>
                                <ResultPreview text={output} filename={`${selected}-result.txt`} />
                            </details>
                        ) : (
                            <ResultPreview text={output} filename={`${selected}-result.txt`} />
                        )}
                    </div>
                    <p className="work-note">
                        <Icon name="shield" size={13} /> Your input stays in this browser and is
                        never sent to our servers.
                    </p>
                </div>
            </div>
        </div>
    );
}
