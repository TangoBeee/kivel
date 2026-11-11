'use client';
import { useEffect, useState } from 'react';
import { signatureProviders, verifyWebhookSignature } from '@kivel.io/tools/webhooks';
import type { SignatureProvider } from '@kivel.io/tools/webhooks';
import type { CapturedRequest } from '../lib/api';
import { siteOrigin } from '../lib/site';
import { AppSelect, SelectOption } from './app-select';
import { Button } from '@radix-ui/themes';

export function WebhookSignature({ request }: { request: CapturedRequest }) {
    const [provider, setProvider] = useState<SignatureProvider>('github');
    const [secret, setSecret] = useState('');
    const [url, setUrl] = useState('');
    const [headerName, setHeaderName] = useState('x-signature');
    const [algorithm, setAlgorithm] = useState<'SHA-256' | 'SHA-1'>('SHA-256');
    const [encoding, setEncoding] = useState<'hex' | 'base64'>('hex');
    const [timestampHeader, setTimestampHeader] = useState('');
    const [tolerance, setTolerance] = useState('');
    const [result, setResult] = useState<{ valid: boolean; reason: string } | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setUrl(`${siteOrigin}${request.path}${request.rawQuery ? `?${request.rawQuery}` : ''}`);
    }, [request.path, request.rawQuery]);
    async function verify() {
        setBusy(true);
        try {
            const body =
                request.bodyEncoding === 'base64'
                    ? Uint8Array.from(atob(request.body), (value) => value.charCodeAt(0))
                    : new TextEncoder().encode(request.body);
            setResult(
                await verifyWebhookSignature({
                    provider,
                    secret,
                    body,
                    headers: request.headers,
                    url,
                    headerName,
                    algorithm,
                    encoding,
                    ...(timestampHeader ? { timestampHeader } : {}),
                    ...(tolerance.trim() ? { toleranceSeconds: Number(tolerance) } : {}),
                    now: new Date(request.timestamp).getTime(),
                }),
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="webhook-signature" aria-label="Signature verification">
            <h3>Verify a signature</h3>
            <p className="small muted">
                Runs in your browser. Your signing secret is never sent or saved. Timestamp checks
                use the recorded receipt time.
            </p>
            <form
                className="inbox-response-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void verify();
                }}
                onChange={() => setResult(null)}
            >
                <label>
                    Provider preset
                    <AppSelect
                        value={provider}
                        onChange={(event) => {
                            setProvider(event.target.value as SignatureProvider);
                            setResult(null);
                            setTolerance('');
                        }}
                    >
                        {Object.entries(signatureProviders).map(([value, label]) => (
                            <SelectOption key={value} value={value}>
                                {label}
                            </SelectOption>
                        ))}
                    </AppSelect>
                </label>
                <label>
                    Signing secret
                    <input
                        type="password"
                        autoComplete="off"
                        value={secret}
                        maxLength={4096}
                        required
                        onChange={(event) => setSecret(event.target.value)}
                    />
                </label>
                {provider === 'twilio' && (
                    <label>
                        Exact URL configured in Twilio
                        <input
                            type="url"
                            value={url}
                            maxLength={4096}
                            required
                            onChange={(event) => setUrl(event.target.value)}
                        />
                        <span className="small muted">
                            Keep the original query order and encoding, including bodySHA256 for
                            JSON requests.
                        </span>
                    </label>
                )}
                {provider === 'custom' && (
                    <>
                        <label>
                            Signature header
                            <input
                                value={headerName}
                                maxLength={128}
                                required
                                onChange={(event) => setHeaderName(event.target.value)}
                            />
                        </label>
                        <label>
                            Algorithm
                            <AppSelect
                                value={algorithm}
                                onChange={(event) => {
                                    setAlgorithm(event.target.value as typeof algorithm);
                                    setResult(null);
                                }}
                            >
                                <SelectOption value="SHA-256">SHA-256</SelectOption>
                                <SelectOption value="SHA-1">SHA-1</SelectOption>
                            </AppSelect>
                        </label>
                        <label>
                            Encoding
                            <AppSelect
                                value={encoding}
                                onChange={(event) => {
                                    setEncoding(event.target.value as typeof encoding);
                                    setResult(null);
                                }}
                            >
                                <SelectOption value="hex">Hex</SelectOption>
                                <SelectOption value="base64">Base64</SelectOption>
                            </AppSelect>
                        </label>
                        <label>
                            Timestamp header, optional
                            <input
                                value={timestampHeader}
                                maxLength={128}
                                onChange={(event) => setTimestampHeader(event.target.value)}
                            />
                            <span className="small muted">
                                Unix seconds. Custom HMAC signs the raw body; this optional check
                                does not add the timestamp to the signed content.
                            </span>
                        </label>
                    </>
                )}
                {['stripe', 'slack', 'svix', 'dodo', 'linear', 'paddle'].includes(provider) ||
                (provider === 'custom' && timestampHeader) ? (
                    <label>
                        Timestamp tolerance in seconds
                        <input
                            type="number"
                            min="0"
                            max="86400"
                            placeholder={
                                provider === 'paddle' ? '5' : provider === 'linear' ? '60' : '300'
                            }
                            value={tolerance}
                            onChange={(event) => setTolerance(event.target.value)}
                        />
                    </label>
                ) : null}
                <Button type="submit" disabled={busy}>
                    {busy ? 'Checking…' : 'Verify signature'}
                </Button>
            </form>
            {result && (
                <p className={result.valid ? 'tool-notice' : 'alert'} role="status">
                    <strong>{result.valid ? 'Pass' : 'Fail'}.</strong> {result.reason}
                </p>
            )}
        </section>
    );
}
