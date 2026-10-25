import { isUtf8 } from 'node:buffer';
import type { FastifyRequest } from 'fastify';
import { parseJsonSafely } from '@socket-help/tools/engine';
const sensitive = /authorization|cookie|token|api[-_]?key|secret|password|credential|session/i;
export function echoRequest(request: FastifyRequest, path: string) {
    const credentials = Object.entries(request.headers)
        .flatMap(([key, value]) =>
            sensitive.test(key) && typeof value === 'string'
                ? [value, ...(/^Bearer\s+/i.test(value) ? [value.replace(/^Bearer\s+/i, '')] : [])]
                : [],
        )
        .filter((value) => value.length >= 8);
    function clean(value: unknown, depth = 0): unknown {
        if (depth > 8) return '[Nested value omitted]';
        if (typeof value === 'string')
            return credentials.reduce(
                (text, credential) => text.replaceAll(credential, '[REDACTED]'),
                value,
            );
        if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
        if (value && typeof value === 'object')
            return Object.fromEntries(
                Object.entries(value).map(([key, item]) => [
                    key,
                    sensitive.test(key) ? '[REDACTED]' : clean(item, depth + 1),
                ]),
            );
        return value;
    }
    const bytes = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(
              request.body === undefined
                  ? ''
                  : typeof request.body === 'string'
                    ? request.body
                    : JSON.stringify(request.body),
          );
    const type = request.headers['content-type'] ?? '';
    let body: Record<string, unknown> = { kind: 'empty', bytes: 0 };
    if (bytes.length) {
        if (isUtf8(bytes)) {
            const text = bytes.toString('utf8');
            if (/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(type)) {
                try {
                    body = {
                        kind: 'json',
                        bytes: bytes.length,
                        value: clean(parseJsonSafely(text)),
                    };
                } catch {
                    body = {
                        kind: 'text',
                        bytes: bytes.length,
                        value: clean(text),
                        notice: 'Body was not safely parseable JSON; showing text.',
                    };
                }
            } else body = { kind: 'text', bytes: bytes.length, value: clean(text) };
        } else
            body = {
                kind: 'binary',
                bytes: bytes.length,
                notice: 'Binary contents are not reflected. Inspect the byte count and content type.',
            };
    }
    return {
        method: request.method,
        path,
        query: clean(request.query),
        headers: clean(
            Object.fromEntries(
                Object.entries(request.headers).map(([key, value]) => [
                    key,
                    /^(forwarded|x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip)$/i.test(
                        key,
                    )
                        ? '[REDACTED]'
                        : value,
                ]),
            ),
        ),
        contentType: type || null,
        body,
        receivedAt: new Date().toISOString(),
        notice: 'Credential-like fields and supplied authorization values are redacted. Requests are not retained.',
    };
}
