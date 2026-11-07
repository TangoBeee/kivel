'use client';
import { AudioArtifactPreview, BinaryArtifactPreview } from './artifact-details';
import { PdfPreview } from './pdf-preview';
import { useEffect, useMemo, useState } from 'react';
import type { GeneratedArtifact } from '@kivel/tools/artifacts';
import { Button } from '@radix-ui/themes';
import { Icon } from './icons';
import { ResultPreview, downloadBlob } from './result-preview';
const mediaNames: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
    'application/pdf': 'PDF document',
    'text/html;charset=utf-8': 'HTML document',
    'text/plain;charset=utf-8': 'Text document',
    'video/mp4': 'MP4 video',
    'video/webm': 'WebM video',
    'audio/mpeg': 'MP3 audio',
    'audio/wav': 'WAV audio',
    'audio/ogg': 'Ogg audio',
    'image/gif': 'GIF image',
    'image/png': 'PNG image',
    'image/jpeg': 'JPEG image',
    'image/webp': 'WebP image',
    'image/svg+xml': 'SVG image',
    'application/zip': 'ZIP archive',
};
export function GeneratedFilePreview({ text }: { text: string }) {
    const [url, setUrl] = useState('');
    const value = useMemo(() => JSON.parse(text) as GeneratedArtifact, [text]);
    const blob = useMemo(
        () =>
            new Blob([Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0))], {
                type: value.mediaType,
            }),
        [value],
    );
    useEffect(() => {
        const next = URL.createObjectURL(blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [blob]);
    return (
        <section className="generated-file-preview" aria-label="Generated file">
            <header>
                <div>
                    <strong>{value.filename}</strong>
                    <span>
                        {value.bytes >= 1048576
                            ? `${(value.bytes / 1048576).toFixed(2)} MiB`
                            : value.bytes >= 1024
                              ? `${(value.bytes / 1024).toFixed(1)} KiB`
                              : `${value.bytes} bytes`}{' '}
                        · {mediaNames[value.mediaType] ?? value.mediaType}
                    </span>
                </div>
                <Button
                    size="2"
                    disabled={!url}
                    onClick={() => {
                        const bytes = Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0));
                        downloadBlob(new Blob([bytes], { type: value.mediaType }), value.filename);
                    }}
                >
                    <Icon name="download" size={16} />
                    Download file
                </Button>
            </header>
            {url && value.mediaType.startsWith('image/') && (
                <div className="generated-image">
                    <img src={url} alt={`Generated ${value.filename}`} />
                </div>
            )}
            {url && value.mediaType.startsWith('audio/') && (
                <AudioArtifactPreview blob={blob} url={url} />
            )}
            {url && value.mediaType.startsWith('video/') && (
                <video
                    className="generated-video"
                    controls
                    preload="metadata"
                    src={url}
                    playsInline
                />
            )}
            {value.previewText !== undefined && (
                <section className="document-preview">
                    <h2>Document preview</h2>
                    <p>{value.previewText}</p>
                </section>
            )}
            {value.mediaType.startsWith('text/html') && (
                <MarkdownPreview
                    html={new TextDecoder().decode(
                        Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0)),
                    )}
                    title="Converted document"
                />
            )}
            {value.mediaType.startsWith('text/plain') && (
                <ResultPreview
                    text={new TextDecoder().decode(
                        Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0)),
                    )}
                    title="Document text"
                    filename={value.filename}
                />
            )}
            {value.mediaType === 'application/pdf' && <PdfPreview blob={blob} />}
            {!value.previewText &&
                !value.mediaType.startsWith('text/') &&
                value.mediaType !== 'application/pdf' &&
                !value.mediaType.startsWith('image/') &&
                !value.mediaType.startsWith('audio/') &&
                !value.mediaType.startsWith('video/') && (
                    <BinaryArtifactPreview blob={blob} archive={value.filename.endsWith('.zip')} />
                )}
        </section>
    );
}
export function MarkdownPreview({
    html,
    title = 'HTML preview',
}: {
    html: string;
    title?: string;
}) {
    const csp =
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";
    const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{margin:24px;color:#1c2220;font:15px/1.7 system-ui;overflow-wrap:anywhere}pre,code{background:#f1f5f2;border-radius:5px;padding:3px 6px}pre{overflow:auto;padding:16px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dde5df;padding:8px}a{color:#286747}</style></head><body>${html}</body></html>`;
    return (
        <section className="markdown-preview">
            <h2>Isolated preview</h2>
            <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={source} />
        </section>
    );
}
