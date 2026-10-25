import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import ipaddr from 'ipaddr.js';
import { ToolExecutionError } from '@socket-help/tools/node';
export function publicAddress(address: string): boolean {
    try {
        return ipaddr.process(address).range() === 'unicast';
    } catch {
        return false;
    }
}
export function publicUrl(input: string): URL {
    let value: URL;
    try {
        value = new URL(input);
    } catch {
        throw new ToolExecutionError('Enter a valid HTTP or HTTPS URL.');
    }
    if (
        !['https:', 'http:'].includes(value.protocol) ||
        value.username ||
        value.password ||
        !['', '80', '443', '8080', '8443'].includes(value.port)
    )
        throw new ToolExecutionError(
            'Use public HTTP/HTTPS URLs on ports 80, 443, 8080, or 8443, without credentials.',
        );
    const hostname = value.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (
        !hostname ||
        (!isIP(hostname) &&
            (!hostname.includes('.') ||
                /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/i.test(
                    hostname,
                ))) ||
        (isIP(hostname) && !publicAddress(hostname))
    )
        throw new ToolExecutionError('Private, local, and reserved targets are not allowed.');
    value.hash = '';
    return value;
}
export async function resolvePublic(hostname: string, signal: AbortSignal) {
    if (signal.aborted) throw new ToolExecutionError('Request cancelled.', 'cancelled');
    const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (isIP(host)) {
        if (!publicAddress(host)) throw new ToolExecutionError('Private or reserved address.');
        return [{ address: host, family: isIP(host) }];
    }
    const resolver = new Resolver({ timeout: 1500, tries: 1 });
    const abort = () => resolver.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
        const results = await Promise.allSettled([
            resolver.resolve4(host),
            resolver.resolve6(host),
        ]);
        if (signal.aborted) throw new ToolExecutionError('Request cancelled.', 'cancelled');
        const addresses = results.flatMap((result, index) =>
            result.status === 'fulfilled'
                ? result.value.map((address) => ({ address, family: index === 0 ? 4 : 6 }))
                : [],
        );
        if (!addresses.length)
            throw new ToolExecutionError('No public addresses could be resolved.');
        if (addresses.some((item) => !publicAddress(item.address)))
            throw new ToolExecutionError('The hostname resolves to a private or reserved address.');
        return addresses;
    } finally {
        signal.removeEventListener('abort', abort);
        resolver.cancel();
    }
}
export interface PublicResponse {
    url: string;
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
    truncated: boolean;
    address: string;
    timings: { dnsMs: number; responseMs: number; totalMs: number };
}
export async function publicRequest(
    input: string,
    signal: AbortSignal,
    options: {
        method?: 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        requestBody?: string;
        headers?: Record<string, string>;
        body?: boolean;
        limit?: number;
        captureMs?: number;
    } = {},
): Promise<PublicResponse> {
    const url = publicUrl(input),
        start = performance.now(),
        host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const addresses = await resolvePublic(host, signal),
        chosen = addresses[0]!,
        dnsMs = performance.now() - start;
    return new Promise((resolve, reject) => {
        let settled = false;
        let captureTimer: ReturnType<typeof setTimeout> | undefined;
        const secure = url.protocol === 'https:';
        const config: RequestOptions = {
            protocol: url.protocol,
            hostname: chosen.address,
            family: chosen.family,
            port: url.port || (secure ? 443 : 80),
            path: url.pathname + url.search,
            method: options.method ?? 'GET',
            agent: false,
            signal,
            maxHeaderSize: 32768,
            headers: {
                Host: url.host,
                'Accept-Encoding': 'identity',
                Accept: '*/*',
                ...options.headers,
                // Fixed so every outbound request is attributable and abuse can be reported.
                'User-Agent':
                    'socket.help network tools (+https://socket.help/contact/; support@socket.help)',
            },
            ...(secure && !isIP(host) ? { servername: host } : {}),
        };
        const send = secure ? httpsRequest : httpRequest;
        const req = send(config, (response) => {
            const responseMs = performance.now() - start;
            const finish = (body: Buffer, truncated = false) => {
                if (settled) return;
                settled = true;
                clearTimeout(captureTimer);
                resolve({
                    url: url.href,
                    status: response.statusCode ?? 0,
                    headers: { ...response.headers },
                    body,
                    truncated,
                    address: chosen.address,
                    timings: {
                        dnsMs: Math.round(dnsMs * 100) / 100,
                        responseMs: Math.round(responseMs * 100) / 100,
                        totalMs: Math.round((performance.now() - start) * 100) / 100,
                    },
                });
            };
            if (!options.body) {
                finish(Buffer.alloc(0));
                response.destroy();
                return;
            }
            const encoding = String(
                response.headers['content-encoding'] ?? 'identity',
            ).toLowerCase();
            const decoder =
                encoding === 'gzip'
                    ? createGunzip()
                    : encoding === 'br'
                      ? createBrotliDecompress()
                      : encoding === 'deflate'
                        ? createInflate()
                        : undefined;
            if (!decoder && encoding !== 'identity') {
                settled = true;
                reject(new ToolExecutionError('Unsupported response encoding.'));
                response.destroy();
                return;
            }
            const stream = decoder ? response.pipe(decoder) : response,
                limit = options.limit ?? 262144,
                chunks: Buffer[] = [];
            let bytes = 0,
                compressedBytes = 0;
            response.on('data', (chunk: Buffer) => {
                compressedBytes += chunk.length;
                if (compressedBytes > 1048576) {
                    if (!settled) {
                        settled = true;
                        reject(new ToolExecutionError('Compressed response exceeds 1 MiB.'));
                    }
                    stream.destroy();
                    response.destroy();
                    req.destroy();
                }
            });
            stream.on('data', (chunk: Buffer) => {
                if (settled) return;
                const remaining = limit - bytes;
                chunks.push(chunk.subarray(0, remaining));
                bytes += Math.min(chunk.length, remaining);
                if (chunk.length > remaining || bytes === limit) {
                    finish(Buffer.concat(chunks), true);
                    stream.destroy();
                    response.destroy();
                    req.destroy();
                }
            });
            if (options.captureMs)
                captureTimer = setTimeout(() => {
                    finish(Buffer.concat(chunks), true);
                    stream.destroy();
                    response.destroy();
                    req.destroy();
                }, options.captureMs).unref();
            stream.once('close', () => clearTimeout(captureTimer));
            stream.once('end', () => finish(Buffer.concat(chunks)));
            stream.once('error', () => {
                if (!settled) {
                    settled = true;
                    reject(new ToolExecutionError('Unable to read the remote response.'));
                }
                response.destroy();
            });
            response.once('error', () => {
                if (!settled) {
                    settled = true;
                    reject(new ToolExecutionError('Remote response interrupted.'));
                }
                stream.destroy();
            });
        });
        req.setTimeout(4000, () =>
            req.destroy(new ToolExecutionError('Remote request timed out.', 'timeout')),
        );
        req.once('error', (error) => {
            clearTimeout(captureTimer);
            if (!settled) {
                settled = true;
                reject(
                    error instanceof ToolExecutionError
                        ? error
                        : new ToolExecutionError(
                              signal.aborted ? 'Request cancelled.' : 'Remote connection failed.',
                              signal.aborted ? 'cancelled' : 'invalid_input',
                          ),
                );
            }
        });
        req.end(options.requestBody);
    });
}
export async function followPublic(
    input: string,
    signal: AbortSignal,
    options: Parameters<typeof publicRequest>[2] = {},
) {
    const hops: { url: string; status: number; location?: string }[] = [],
        seen = new Set<string>();
    let current = publicUrl(input).href;
    for (let i = 0; i <= 5; i++) {
        if (seen.has(current)) throw new ToolExecutionError('Redirect loop detected.');
        seen.add(current);
        const response = await publicRequest(current, signal, options);
        const raw = response.headers.location,
            location = Array.isArray(raw) ? raw[0] : raw;
        hops.push({
            url: response.url,
            status: response.status,
            ...(location ? { location } : {}),
        });
        if (![301, 302, 303, 307, 308].includes(response.status) || !location)
            return { ...response, hops };
        if (i === 5) throw new ToolExecutionError('Redirect chain exceeds five hops.');
        current = publicUrl(new URL(location, current).href).href;
    }
    throw new ToolExecutionError('Redirect limit reached.');
}
