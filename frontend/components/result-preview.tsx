'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatJson } from '@kivel.io/tools/engine';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { CopyButton } from './copy-button';
export function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ResultPreview({
    text,
    title = 'Output',
    filename = 'kivel-result.txt',
    downloadable = true,
}: {
    text: string;
    title?: string;
    filename?: string;
    downloadable?: boolean;
}) {
    const [formatted, setFormatted] = useState(false),
        [wrap, setWrap] = useState(true);
    useEffect(() => setFormatted(false), [text]);
    const pretty = useMemo(() => {
        if (text.length > 262144) return undefined;
        try {
            return formatJson(text);
        } catch {
            return undefined;
        }
    }, [text]);
    const byteCount = useMemo(() => new TextEncoder().encode(text).length, [text]);
    const content = formatted && pretty !== undefined ? pretty : text;
    const shown = content.slice(0, 262144);
    return (
        <section className="result-preview" aria-label={title}>
            <div className="result-preview-heading">
                <div>
                    <strong>{title}</strong>
                    <span>
                        {pretty !== undefined ? 'JSON' : 'Text'} · {byteCount.toLocaleString()}{' '}
                        bytes
                    </span>
                </div>
                <div className="result-preview-actions">
                    {pretty !== undefined && (
                        <button
                            type="button"
                            className="button button-small"
                            aria-pressed={formatted}
                            onClick={() => setFormatted(!formatted)}
                        >
                            {formatted ? 'Formatted' : 'Raw'}
                        </button>
                    )}
                    <button
                        type="button"
                        className="button button-small"
                        aria-pressed={wrap}
                        onClick={() => setWrap(!wrap)}
                    >
                        Wrap
                    </button>
                    <CopyButton text={text} label="Copy output" compact />
                    {downloadable && (
                        <button
                            type="button"
                            className="button button-small"
                            onClick={() =>
                                downloadBlob(
                                    new Blob([text], { type: 'text/plain;charset=utf-8' }),
                                    filename,
                                )
                            }
                        >
                            Download
                        </button>
                    )}
                </div>
            </div>
            {shown ? (
                <pre className={wrap ? 'result-wrap' : ''} tabIndex={0}>
                    {pretty !== undefined ? highlightJson(shown) : highlightSource(shown)}
                </pre>
            ) : (
                <div className="result-empty-state">
                    <Icon name="braces" size={24} />
                    <strong>Your result will appear here</strong>
                    <span>Add your input, choose the options and run the tool.</span>
                </div>
            )}
            {content.length > shown.length && (
                <p className="tool-notice">
                    Preview shows the first 256 KiB. Copy or download to get the full result.
                </p>
            )}
        </section>
    );
}

function highlightJson(text: string): ReactNode[] {
    const output: ReactNode[] = [];
    const pattern =
        /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
    let offset = 0,
        index = 0;
    for (const match of text.matchAll(pattern)) {
        if (index >= 4000) {
            output.push(text.slice(offset));
            return output;
        }
        output.push(text.slice(offset, match.index));
        const kind = match[2] ? 'key' : match[1] ? 'string' : match[3] ? 'number' : 'literal';
        output.push(
            <span className={`json-token-${kind}`} key={index++}>
                {match[0]}
            </span>,
        );
        offset = match.index + match[0].length;
    }
    output.push(text.slice(offset));
    return output;
}

function highlightSource(text: string): ReactNode {
    if (text.trimStart().startsWith('<')) {
        const output: ReactNode[] = [];
        let offset = 0,
            key = 0;
        while (offset < text.length && key < 2000) {
            const start = text.indexOf('<', offset);
            if (start < 0) {
                output.push(text.slice(offset));
                break;
            }
            output.push(text.slice(offset, start));
            const comment = text.startsWith('<!--', start),
                end = text.indexOf(comment ? '-->' : '>', start);
            if (end < 0) {
                output.push(text.slice(start));
                break;
            }
            const stop = end + (comment ? 3 : 1),
                token = text.slice(start, stop);
            output.push(
                <span key={key++} className={comment ? 'source-comment' : 'json-token-key'}>
                    {token}
                </span>,
            );
            offset = stop;
        }
        if (key >= 2000) output.push(text.slice(offset));
        return output;
    }
    if (/^[A-Za-z_][A-Za-z0-9_.-]*\s*[:=]/m.test(text)) {
        const lines = text.split('\n');
        if (lines.length > 2000) return text;
        return lines.map((line, index) => {
            const match = /^(\s*(?:-\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*[:=])(.*)$/.exec(line);
            return (
                <span key={index}>
                    {match ? (
                        <>
                            {match[1]}
                            <span className="json-token-key">{match[2]}</span>
                            {match[3]}
                            <span className="json-token-string">{match[4]}</span>
                        </>
                    ) : (
                        line
                    )}
                    {index < lines.length - 1 ? '\n' : ''}
                </span>
            );
        });
    }
    return text;
}
