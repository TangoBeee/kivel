import { XMLParser, XMLValidator } from 'fast-xml-parser';
export const signatureProviders = {
    stripe: 'Stripe',
    github: 'GitHub',
    shopify: 'Shopify',
    slack: 'Slack',
    twilio: 'Twilio',
    svix: 'Svix (Clerk, Resend and others)',
    paddle: 'Paddle',
    dodo: 'Dodo Payments',
    linear: 'Linear',
    custom: 'Custom HMAC',
} as const;
export type SignatureProvider = keyof typeof signatureProviders;
export interface SignatureInput {
    provider: SignatureProvider;
    secret: string;
    body: Uint8Array;
    headers: Record<string, string | string[]>;
    url?: string;
    headerName?: string;
    algorithm?: 'SHA-256' | 'SHA-1';
    encoding?: 'hex' | 'base64';
    timestampHeader?: string;
    toleranceSeconds?: number;
    now?: number;
}
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
function base64(value: string): Uint8Array {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
        throw new Error('Invalid base64 signing secret or signature.');
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function prefixed(prefix: string, body: Uint8Array): Uint8Array {
    const start = encoder.encode(prefix),
        bytes = new Uint8Array(start.length + body.length);
    bytes.set(start);
    bytes.set(body, start.length);
    return bytes;
}
function same(a: Uint8Array, b: Uint8Array) {
    let difference = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return difference === 0;
}
export async function verifyWebhookSignature(
    input: SignatureInput,
): Promise<{ valid: boolean; reason: string }> {
    try {
        if (!Object.hasOwn(signatureProviders, input.provider))
            throw new Error('Choose a supported provider.');
        if (!input.secret || input.secret.length > 4096)
            throw new Error('Enter a signing secret of at most 4,096 characters.');
        if (input.body.length > 102400) throw new Error('The body exceeds 100 KiB.');
        const headers = Object.fromEntries(
            Object.entries(input.headers).map(([key, value]) => [
                key.toLowerCase(),
                Array.isArray(value) ? value.join(' ') : value,
            ]),
        );
        const get = (...names: string[]) => {
            const value = names.map((name) => headers[name.toLowerCase()]).find(Boolean);
            if (!value || value === '[REDACTED]') throw new Error(`Missing ${names[0]} header.`);
            return value;
        };
        const now = input.now ?? Date.now();
        if (!Number.isFinite(now)) throw new Error('Invalid comparison time.');
        const tolerance =
            input.toleranceSeconds ??
            (input.provider === 'paddle' ? 5 : input.provider === 'linear' ? 60 : 300);
        if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 86400)
            throw new Error('Timestamp tolerance must be 0 to 86,400 seconds.');
        let timestamp: number | undefined;
        let key: Uint8Array = encoder.encode(input.secret),
            body = input.body;
        let algorithm = 'SHA-256',
            encoding = 'hex',
            candidates: string[] = [];
        const parse = (
            header: string,
            delimiter: string,
            timeKey: string,
            signatureKey: string,
        ) => {
            const parts = header.split(delimiter).map((value) => value.trim());
            const times = parts.filter((part) => part.startsWith(`${timeKey}=`));
            if (times.length !== 1 || !/^\d+$/.test(times[0]!.slice(timeKey.length + 1)))
                throw new Error('Missing or invalid signature timestamp.');
            const rawTime = times[0]!.slice(timeKey.length + 1);
            timestamp = Number(rawTime);
            candidates = parts
                .filter((part) => part.startsWith(`${signatureKey}=`))
                .map((part) => part.slice(signatureKey.length + 1));
            return rawTime;
        };
        switch (input.provider) {
            case 'stripe': {
                const time = parse(get('stripe-signature'), ',', 't', 'v1');
                body = prefixed(`${time}.`, body);
                break;
            }
            case 'github': {
                const signature = get('x-hub-signature-256');
                if (!signature.startsWith('sha256='))
                    throw new Error('Expected a sha256= GitHub signature.');
                candidates = [signature.slice(7)];
                break;
            }
            case 'shopify':
                candidates = [get('x-shopify-hmac-sha256')];
                encoding = 'base64';
                break;
            case 'slack': {
                const time = get('x-slack-request-timestamp');
                if (!/^\d+$/.test(time)) throw new Error('Invalid Slack timestamp.');
                timestamp = Number(time);
                body = prefixed(`v0:${time}:`, body);
                const signature = get('x-slack-signature');
                if (!signature.startsWith('v0='))
                    throw new Error('Expected a v0= Slack signature.');
                candidates = [signature.slice(3)];
                break;
            }
            case 'paddle': {
                const time = parse(get('paddle-signature'), ';', 'ts', 'h1');
                body = prefixed(`${time}:`, body);
                break;
            }
            case 'svix':
            case 'dodo': {
                const time = get('webhook-timestamp', 'svix-timestamp');
                if (!/^\d+$/.test(time)) throw new Error('Invalid webhook timestamp.');
                timestamp = Number(time);
                body = prefixed(`${get('webhook-id', 'svix-id')}.${time}.`, body);
                key = base64(input.secret.replace(/^whsec_/, ''));
                encoding = 'base64';
                candidates = get('webhook-signature', 'svix-signature')
                    .split(/\s+/)
                    .filter((signature) => signature.startsWith('v1,'))
                    .map((signature) => signature.slice(3));
                break;
            }
            case 'linear': {
                const payload = JSON.parse(new TextDecoder().decode(body));
                if (typeof payload.webhookTimestamp !== 'number')
                    throw new Error('Missing webhookTimestamp in the Linear body.');
                timestamp = payload.webhookTimestamp / 1000;
                candidates = [get('linear-signature')];
                break;
            }
            case 'twilio': {
                if (!input.url)
                    throw new Error(
                        'Enter the exact URL configured in Twilio, including its query string.',
                    );
                const url = new URL(input.url);
                if (
                    !['http:', 'https:'].includes(url.protocol) ||
                    url.username ||
                    url.password ||
                    url.hash
                )
                    throw new Error('Enter an HTTP URL without credentials or a fragment.');
                let signed = input.url;
                const contentType = headers['content-type'] ?? '';
                if (contentType.includes('json') || url.searchParams.has('bodySHA256')) {
                    const digest = hex(
                        new Uint8Array(
                            await crypto.subtle.digest('SHA-256', Uint8Array.from(body)),
                        ),
                    );
                    if (url.searchParams.get('bodySHA256') !== digest)
                        throw new Error('Twilio bodySHA256 does not match the raw JSON body.');
                } else if (body.length) {
                    if (!contentType.includes('application/x-www-form-urlencoded'))
                        throw new Error('Twilio verification supports form or JSON bodies.');
                    const params = new URLSearchParams(new TextDecoder().decode(body));
                    for (const name of [...new Set(params.keys())].sort())
                        for (const value of [...new Set(params.getAll(name))].sort())
                            signed += name + value;
                }
                body = encoder.encode(signed);
                algorithm = 'SHA-1';
                encoding = 'base64';
                candidates = [get('x-twilio-signature')];
                break;
            }
            case 'custom': {
                algorithm = input.algorithm ?? 'SHA-256';
                encoding = input.encoding ?? 'hex';
                if (
                    !['SHA-256', 'SHA-1'].includes(algorithm) ||
                    !['hex', 'base64'].includes(encoding)
                )
                    throw new Error('Choose SHA-256 or SHA-1 and hex or base64.');
                const name = input.headerName ?? 'x-signature';
                if (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,128}$/i.test(name))
                    throw new Error('Enter a valid signature header name.');
                candidates = [get(name)];
                if (input.timestampHeader) {
                    const time = get(input.timestampHeader);
                    if (!/^\d+$/.test(time))
                        throw new Error('The custom timestamp must be Unix seconds.');
                    timestamp = Number(time);
                } else if (input.toleranceSeconds !== undefined)
                    throw new Error(
                        'Choose a timestamp header to apply custom timestamp tolerance.',
                    );
                break;
            }
        }
        if (!candidates.length) throw new Error('No supported signature was found in the header.');
        const imported = await crypto.subtle.importKey(
            'raw',
            Uint8Array.from(key),
            { name: 'HMAC', hash: algorithm },
            false,
            ['sign'],
        );
        const expected = new Uint8Array(
            await crypto.subtle.sign('HMAC', imported, Uint8Array.from(body)),
        );
        const valid = candidates.some((candidate) => {
            try {
                if (encoding === 'base64') return same(expected, base64(candidate));
                if (!/^(?:[0-9a-f]{2})+$/i.test(candidate)) return false;
                return same(
                    expected,
                    Uint8Array.from(candidate.match(/../g)!, (byte) => parseInt(byte, 16)),
                );
            } catch {
                return false;
            }
        });
        if (!valid)
            return {
                valid: false,
                reason: 'Signature does not match. Check the secret, preset and exact raw body or URL.',
            };
        if (
            timestamp !== undefined &&
            (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > tolerance)
        )
            return {
                valid: false,
                reason: `Signature matches, but its timestamp is outside the ${tolerance}-second tolerance.`,
            };
        return {
            valid: true,
            reason:
                timestamp === undefined
                    ? 'Signature matches the exact request bytes. This preset does not check a timestamp.'
                    : `Signature matches and its timestamp is within ${tolerance} seconds.`,
        };
    } catch (error) {
        return {
            valid: false,
            reason:
                error instanceof Error && !(error instanceof SyntaxError)
                    ? error.message
                    : 'Invalid payload or signature format.',
        };
    }
}

export async function parseWebhookBody(bytes: Uint8Array, contentType: string) {
    if (bytes.length > 102400) throw new Error('Body exceeds 100 KiB.');
    const type = contentType.split(';')[0]!.trim().toLowerCase();
    const text = new TextDecoder().decode(bytes);
    try {
        if (type === 'application/json' || type.endsWith('+json'))
            return { kind: 'JSON', data: JSON.parse(text) };
        if (type === 'application/x-www-form-urlencoded')
            return {
                kind: 'Form fields',
                fields: [...new URLSearchParams(text)].map(([name, value]) => ({ name, value })),
            };
        if (type === 'multipart/form-data') {
            const form = await new Response(new Blob([Uint8Array.from(bytes)]), {
                headers: { 'Content-Type': contentType },
            }).formData();
            const entries = [...form];
            return {
                kind: 'Multipart',
                parts: entries
                    .slice(0, 100)
                    .map(([name, value]) =>
                        typeof value === 'string'
                            ? {
                                  name,
                                  kind: 'field',
                                  value: value.slice(0, 4096),
                                  truncated: value.length > 4096,
                              }
                            : {
                                  name,
                                  kind: 'file',
                                  filename: value.name,
                                  bytes: value.size,
                                  mediaType: value.type || 'application/octet-stream',
                              },
                    ),
                totalParts: entries.length,
                truncated: entries.length > 100,
            };
        }
        if (type === 'application/xml' || type === 'text/xml' || type.endsWith('+xml')) {
            if (/<!DOCTYPE|<!ENTITY/i.test(text))
                throw new Error('DTD and entity declarations are not parsed.');
            const valid = XMLValidator.validate(text);
            if (valid !== true)
                throw new Error(`Invalid XML at line ${valid.err.line}: ${valid.err.msg}`);
            return {
                kind: 'XML',
                data: new XMLParser({
                    ignoreAttributes: false,
                    processEntities: false,
                    maxNestedTags: 64,
                }).parse(text),
            };
        }
        if (type.startsWith('text/') || !type) {
            try {
                new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                return { kind: 'Text', text };
            } catch {}
        }
        return {
            kind: 'Binary',
            bytes: bytes.length,
            mediaType: type || 'application/octet-stream',
            hex: Array.from(bytes.slice(0, 256), (byte) => byte.toString(16).padStart(2, '0')).join(
                ' ',
            ),
            truncated: bytes.length > 256,
        };
    } catch (error) {
        return {
            kind: 'Unparsed body',
            problem:
                error instanceof SyntaxError
                    ? 'Invalid JSON. Inspect the original bytes below.'
                    : error instanceof Error
                      ? error.message
                      : 'Unable to parse this content type.',
            text,
        };
    }
}
