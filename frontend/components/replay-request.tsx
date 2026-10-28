'use client';

import { useState } from 'react';
import { Button } from '@radix-ui/themes';
import Link from 'next/link';
import { api, ApiError } from '../lib/api';
import type { CapturedRequest } from '../lib/api';

// Routing, proxy and credential headers describe the trip to socket.help, not the original event.
const skipped =
    /^(host|connection|content-length|transfer-encoding|upgrade|te|trailer|expect|cookie|accept-encoding|forwarded|x-real-ip|cdn-loop|true-client-ip|x-access-token|x-resource-token)$|^(x-forwarded-|proxy-|cf-)/i;

/** Resend a captured webhook to any public endpoint, with its method, headers and body. */
export function ReplayRequest({ request }: { request: CapturedRequest }) {
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
    const headers = Object.entries(request.headers)
        .filter(([name, value]) => !skipped.test(name) && value !== '[REDACTED]')
        .slice(0, 32)
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\n');
    const binary = request.bodyEncoding === 'base64' && request.bodySize > 0;
    async function replay(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setOutcome(null);
        try {
            const result = await (
                await api(
                    '/api/tools/network-request-replay/run',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            input: url,
                            options: {
                                method: request.method,
                                headers,
                                ...(['GET', 'HEAD'].includes(request.method)
                                    ? {}
                                    : { body: request.body }),
                            },
                        }),
                    },
                    25000,
                )
            ).json();
            const output =
                typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
            setOutcome({
                ok: output.status < 400,
                text: `${output.status} in ${Math.round(output.timings?.totalMs ?? 0)} ms`,
            });
        } catch (failure) {
            setOutcome({
                ok: false,
                text:
                    failure instanceof ApiError && failure.status === 401
                        ? 'Sign in to replay requests that change data.'
                        : failure instanceof Error
                          ? failure.message
                          : 'Replay failed.',
            });
        } finally {
            setBusy(false);
        }
    }
    if (binary) return null;
    return (
        <form className="replay-request" onSubmit={(event) => void replay(event)}>
            <label>
                Replay this {request.method} to
                <input
                    type="url"
                    required
                    placeholder="https://staging.example.com/webhooks"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                />
            </label>
            <Button size="2" variant="surface" color="gray" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Replay'}
            </Button>
            {outcome && (
                <span className={outcome.ok ? 'replay-ok' : 'replay-error'} role="status">
                    {outcome.text}
                    {outcome.text.startsWith('Sign in') && (
                        <>
                            {' '}
                            <Link href="/account/#signin">Sign in</Link>
                        </>
                    )}
                </span>
            )}
        </form>
    );
}
