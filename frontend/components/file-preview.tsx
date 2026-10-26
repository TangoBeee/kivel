'use client';
import { AudioArtifactPreview, BinaryArtifactPreview } from './artifact-details';
import { renderToolResult } from './tool-result';
import { PdfPreview } from './pdf-preview';
import { useEffect, useRef, useState } from 'react';
import { ResultPreview, downloadBlob } from './result-preview';
import { api } from '../lib/api';
const bytesType = (bytes: Uint8Array) => {
    const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
    if (starts(80, 75, 3, 4) || starts(80, 75, 5, 6)) return 'application/zip';
    if (starts(37, 80, 68, 70, 45)) return 'application/pdf';
    if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png';
    if (starts(255, 216, 255)) return 'image/jpeg';
    if (starts(71, 73, 70, 56)) return 'image/gif';
    if (starts(82, 73, 70, 70) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
        return 'image/webp';
    if (starts(82, 73, 70, 70) && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE')
        return 'audio/wav';
    if (starts(102, 76, 97, 67)) return 'audio/flac';
    if (starts(26, 69, 223, 163)) return 'video/webm';
    if (starts(79, 103, 103, 83)) return 'audio/ogg';
    if (starts(73, 68, 51) || (bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224))
        return 'audio/mpeg';
    if (
        String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' &&
        /^(isom|mp4|M4V|avc1)/.test(String.fromCharCode(...bytes.slice(8, 12)))
    )
        return 'video/mp4';
    return '';
};
export function BlobPreview({ blob, name }: { blob: Blob; name: string }) {
    const [media, setMedia] = useState(''),
        [text, setText] = useState<string | null>(null),
        [binary, setBinary] = useState(''),
        [kind, setKind] = useState(''),
        [mediaError, setMediaError] = useState(false);
    useEffect(() => {
        let live = true,
            url = '';
        setMediaError(false);
        setMedia('');
        setText(null);
        setBinary('');
        setKind('');
        void (async () => {
            const bytes = new Uint8Array(await blob.slice(0, 262144).arrayBuffer());
            const type = bytesType(bytes);
            if (type === 'application/pdf' || type === 'application/zip') {
                if (live) {
                    setKind(type);
                    setBinary(type === 'application/pdf' ? 'PDF document' : 'ZIP archive');
                }
                return;
            }
            if (type) {
                url = URL.createObjectURL(blob.slice(0, blob.size, type));
                if (live) {
                    setMedia(url);
                    setKind(type);
                } else URL.revokeObjectURL(url);
                return;
            }
            try {
                const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
                    stream: blob.size > bytes.length,
                });
                if (!/[\x00-\x08\x0b\x0e-\x1f]/.test(value)) {
                    if (live) setText(value);
                    return;
                }
            } catch {}
            if (live)
                setBinary(
                    Array.from(
                        bytes.slice(0, 256),
                        (byte, index) =>
                            `${index % 16 === 0 ? '\n' + index.toString(16).padStart(4, '0') + '  ' : ''}${byte.toString(16).padStart(2, '0')} `,
                    )
                        .join('')
                        .trim(),
                );
        })();
        return () => {
            live = false;
            if (url) URL.revokeObjectURL(url);
        };
    }, [blob]);
    return (
        <div className="file-preview">
            <div className="file-preview-summary">
                <div>
                    <strong>{name}</strong>
                    <span>{blob.size.toLocaleString()} bytes</span>
                </div>
                <button className="button" type="button" onClick={() => downloadBlob(blob, name)}>
                    Download original
                </button>
            </div>
            {kind === 'application/pdf' ? (
                <PdfPreview blob={blob} />
            ) : kind === 'application/zip' ? (
                <BinaryArtifactPreview blob={blob} archive />
            ) : mediaError ? (
                <p className="tool-notice">
                    A preview is unavailable for this file. Download the original to open it.
                </p>
            ) : media ? (
                <div className="file-preview-media">
                    {kind.startsWith('image/') ? (
                        <img
                            onError={() => setMediaError(true)}
                            src={media}
                            alt={`Preview of ${name}`}
                        />
                    ) : kind.startsWith('video/') ? (
                        <video
                            onError={() => setMediaError(true)}
                            src={media}
                            controls
                            preload="metadata"
                        />
                    ) : (
                        <AudioArtifactPreview blob={blob} url={media} />
                    )}
                </div>
            ) : text !== null ? (
                <>
                    <FileTextPreview text={text} name={name} complete={blob.size <= 262144} />
                    {blob.size > 262144 && (
                        <p className="tool-notice">
                            Preview shows the first 256 KiB. Download original for the complete
                            file.
                        </p>
                    )}
                </>
            ) : kind === 'application/pdf' ? (
                <p className="tool-notice">
                    PDF document. Download the original to open it in your PDF viewer.
                </p>
            ) : binary ? (
                <>
                    <p className="tool-notice">Binary file · first 256 bytes in hexadecimal.</p>
                    <pre className="binary-preview">{binary}</pre>
                </>
            ) : (
                <p role="status" className="tool-notice">
                    Preparing preview…
                </p>
            )}
        </div>
    );
}
export function RemoteFilePreview({
    id,
    accessToken,
    name,
}: {
    id: string;
    accessToken?: string | undefined;
    name: string;
}) {
    const [blob, setBlob] = useState<Blob | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    const pending = useRef<AbortController | null>(null);
    useEffect(() => {
        pending.current?.abort();
        setBusy(false);
        setBlob(null);
        setError('');
        return () => pending.current?.abort();
    }, [id, accessToken]);
    return (
        <div className="remote-file-preview">
            {!blob ? (
                <>
                    <button
                        className="button"
                        disabled={busy}
                        onClick={async () => {
                            pending.current?.abort();
                            const request = new AbortController();
                            pending.current = request;
                            setBusy(true);
                            setError('');
                            try {
                                const response = await api(
                                    `/files/${id}`,
                                    {
                                        signal: request.signal,
                                        headers: accessToken
                                            ? { 'X-Access-Token': accessToken }
                                            : {},
                                    },
                                    90000,
                                );
                                const data = await response.blob();
                                if (!request.signal.aborted) setBlob(data);
                            } catch (failure) {
                                if (!request.signal.aborted)
                                    setError(
                                        failure instanceof Error
                                            ? failure.message
                                            : 'Unable to retrieve file.',
                                    );
                            } finally {
                                if (!request.signal.aborted) setBusy(false);
                            }
                        }}
                    >
                        {busy ? 'Retrieving file…' : 'Open preview & download'}
                    </button>
                    <p className="tool-notice">
                        Opening the file uses one download. Further previews and saves use this
                        local copy.
                    </p>
                </>
            ) : (
                <BlobPreview blob={blob} name={name} />
            )}
            {error && (
                <p className="alert" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function FileTextPreview({
    text,
    name,
    complete,
}: {
    text: string;
    name: string;
    complete: boolean;
}) {
    const view = complete
        ? renderToolResult(
              name.toLowerCase().endsWith('.csv') ? 'everyday-json-to-csv' : 'file-preview',
              text,
          )
        : null;
    return (
        <>
            {view}
            {view ? (
                <details className="artifact-response">
                    <summary>File source</summary>
                    <ResultPreview
                        text={text}
                        title="File source"
                        filename={name}
                        downloadable={false}
                    />
                </details>
            ) : (
                <ResultPreview
                    text={text}
                    title="File preview"
                    filename={name}
                    downloadable={false}
                />
            )}
        </>
    );
}
