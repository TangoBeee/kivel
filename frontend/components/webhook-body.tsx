'use client';
import { useEffect, useState } from 'react';
import { parseWebhookBody } from '@kivel.io/tools/webhooks';
import type { CapturedRequest } from '../lib/api';

export function WebhookBody({
    request,
    formattedJson,
}: {
    request: CapturedRequest;
    formattedJson: string;
}) {
    const [parsed, setParsed] = useState<Awaited<ReturnType<typeof parseWebhookBody>> | null>(null);
    useEffect(() => {
        let live = true;
        const bytes =
            request.bodyEncoding === 'base64'
                ? Uint8Array.from(atob(request.body), (value) => value.charCodeAt(0))
                : new TextEncoder().encode(request.body);
        const type = request.headers['content-type'];
        void parseWebhookBody(bytes, Array.isArray(type) ? (type[0] ?? '') : (type ?? '')).then(
            (value) => {
                if (live) setParsed(value);
            },
        );
        return () => {
            live = false;
        };
    }, [request]);
    if (!parsed) return <p className="small muted">Reading payload…</p>;
    return (
        <div className="webhook-parsed">
            <p className="small muted">{parsed.kind}</p>
            {'problem' in parsed && <p className="tool-notice">{parsed.problem}</p>}
            {'data' in parsed && (
                <pre>
                    {parsed.kind === 'JSON' ? formattedJson : JSON.stringify(parsed.data, null, 2)}
                </pre>
            )}
            {'fields' in parsed && parsed.fields && (
                <table className="data-table">
                    <tbody>
                        {parsed.fields.map((field, index) => (
                            <tr key={index}>
                                <th scope="row">{field.name}</th>
                                <td>{field.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {'parts' in parsed && parsed.parts && (
                <>
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Part</th>
                                    <th>Type</th>
                                    <th>Content</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.parts.map((part, index) => (
                                    <tr key={index}>
                                        <th scope="row">{part.name}</th>
                                        <td>{part.kind}</td>
                                        <td>
                                            {'filename' in part ? (
                                                <>
                                                    {part.filename}
                                                    <br />
                                                    {part.bytes?.toLocaleString()} bytes ·{' '}
                                                    {part.mediaType}
                                                </>
                                            ) : (
                                                part.value
                                            )}
                                            {'truncated' in part && part.truncated
                                                ? ' (preview shortened)'
                                                : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {parsed.truncated && (
                        <p className="small muted">
                            Showing the first 100 of {parsed.totalParts} parts.
                        </p>
                    )}
                    <p className="small muted">
                        File contents stay in the original body download. No files are opened or
                        rendered.
                    </p>
                </>
            )}
            {'hex' in parsed && (
                <>
                    <p>
                        {parsed.bytes?.toLocaleString()} bytes · {parsed.mediaType}
                    </p>
                    <pre className="webhook-hex">{parsed.hex}</pre>
                    {parsed.truncated && (
                        <p className="small muted">
                            Showing the first 256 bytes. Download the body for the complete payload.
                        </p>
                    )}
                </>
            )}
            {'text' in parsed && <pre>{parsed.text}</pre>}
        </div>
    );
}
