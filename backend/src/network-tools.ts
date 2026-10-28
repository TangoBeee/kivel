import { inspectMcp } from './mcp-inspector.js';
import { runScenario } from './api-scenarios.js';
import { parseSse } from '@socket-help/tools/sse';
import { connect, checkServerIdentity } from 'node:tls';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { load } from 'cheerio';
import { networkOperations } from '@socket-help/tools/network-definitions';
import type { NetworkOperationId } from '@socket-help/tools/network-definitions';
import type { ExtraDefinition } from '@socket-help/tools/extra-definitions';
import type { OperationOptions } from '@socket-help/tools/definitions';
import { ToolExecutionError } from '@socket-help/tools/node';
import { followPublic, publicRequest, publicUrl, resolvePublic } from './public-network.js';
export function dnsResponseKey(response: {
    status: number;
    answers: { type: number; data: string }[];
}): string {
    return JSON.stringify({
        status: response.status,
        answers: response.answers.map((item) => `${item.type} ${item.data}`).sort(),
    });
}
function domain(input: string): string {
    let host = input.trim().replace(/\.$/, '');
    if (/^https?:\/\//i.test(host)) {
        let parsed: URL;
        try {
            parsed = new URL(host);
        } catch {
            throw new ToolExecutionError('Enter a valid domain.');
        }
        if (
            parsed.username ||
            parsed.password ||
            parsed.port ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash
        )
            throw new ToolExecutionError(
                'Enter a domain without path, query, port, or credentials.',
            );
        host = parsed.hostname;
    }
    host = domainToASCII(host).toLowerCase();
    if (
        !host ||
        host.length > 253 ||
        isIP(host) ||
        host.split('.').length < 2 ||
        host
            .split('.')
            .some(
                (label) =>
                    !label ||
                    label.length > 63 ||
                    !/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/.test(label),
            ) ||
        /(?:^|\.)(local|localhost|internal|test|invalid|example|onion)$/.test(host)
    )
        throw new ToolExecutionError('Enter a public DNS domain name.');
    return host;
}
async function dnsAnswer(
    name: string,
    type: string,
    provider: 'cloudflare' | 'google',
    signal: AbortSignal,
) {
    const base =
        provider === 'cloudflare'
            ? 'https://cloudflare-dns.com/dns-query'
            : 'https://dns.google/resolve';
    const query = new URL(base);
    query.searchParams.set('name', name);
    query.searchParams.set('type', type);
    const response = await followPublic(query.href, signal, {
        body: true,
        headers: { Accept: 'application/dns-json' },
    });
    if (response.status !== 200 || response.truncated)
        throw new ToolExecutionError('DNS resolver did not return a bounded successful response.');
    let value: any;
    try {
        value = JSON.parse(response.body.toString('utf8'));
    } catch {
        throw new ToolExecutionError('DNS resolver returned invalid JSON.');
    }
    if (typeof value.Status !== 'number')
        throw new ToolExecutionError('DNS resolver returned an unexpected response.');
    const answers: { name: string; type: number; ttl: number; data: string }[] = Array.isArray(
        value.Answer,
    )
        ? value.Answer.slice(0, 100)
              .filter(
                  (item: any) =>
                      typeof item.name === 'string' &&
                      typeof item.type === 'number' &&
                      typeof item.data === 'string',
              )
              .map((item: any) => ({
                  name: item.name,
                  type: item.type,
                  ttl: item.TTL,
                  data: item.data,
              }))
        : [];
    return {
        provider,
        name,
        type,
        status: value.Status,
        authenticated: value.AD === true,
        answers,
        timings: response.timings,
    };
}
function txtValue(input: string) {
    const pieces = input.match(/"(?:\\.|[^"\\])*"/g);
    if (!pieces) return input;
    try {
        return pieces.map((piece) => JSON.parse(piece)).join('');
    } catch {
        return input;
    }
}
let bootstrapCache: { expires: number; services: any[] } | undefined;
async function rdap(name: string, signal: AbortSignal) {
    if (!bootstrapCache || bootstrapCache.expires < Date.now()) {
        const response = await followPublic('https://data.iana.org/rdap/dns.json', signal, {
            body: true,
            limit: 524288,
        });
        if (response.status !== 200 || response.truncated)
            throw new ToolExecutionError('Unable to read the IANA RDAP bootstrap.');
        const value = JSON.parse(response.body.toString('utf8'));
        if (!Array.isArray(value.services))
            throw new ToolExecutionError('Invalid RDAP bootstrap data.');
        bootstrapCache = { expires: Date.now() + 86400000, services: value.services };
    }
    const tld = name.split('.').at(-1)!,
        service = bootstrapCache.services.find(
            (item) => Array.isArray(item) && Array.isArray(item[0]) && item[0].includes(tld),
        );
    const registry = Array.isArray(service?.[1])
        ? service[1].find((url: unknown) => typeof url === 'string' && url.startsWith('https://'))
        : undefined;
    if (!registry)
        throw new ToolExecutionError('No HTTPS RDAP registry is listed for this domain suffix.');
    const target = new URL(
        `domain/${encodeURIComponent(name)}`,
        registry.endsWith('/') ? registry : registry + '/',
    );
    const response = await followPublic(target.href, signal, {
        body: true,
        headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (response.truncated)
        throw new ToolExecutionError('Registry response exceeds the display limit.');
    let data: unknown;
    try {
        data = JSON.parse(response.body.toString('utf8'));
    } catch {
        throw new ToolExecutionError('Registry returned an unsupported response.');
    }
    return { domain: name, status: response.status, source: response.url, data };
}
export async function inspectTls(input: string, signal: AbortSignal) {
    const parsed = publicUrl(input.includes('://') ? input : `https://${input}`);
    if (parsed.protocol !== 'https:') throw new ToolExecutionError('Use an HTTPS URL or hostname.');
    const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, ''),
        address = (await resolvePublic(host, signal))[0]!;
    return new Promise((resolve, reject) => {
        const start = performance.now();
        let settled = false;
        const socket = connect({
            host: address.address,
            port: parsed.port ? Number(parsed.port) : 443,
            rejectUnauthorized: false,
            ...(!isIP(host) ? { servername: host } : {}),
        });
        const cleanup = () => {
            signal.removeEventListener('abort', abort);
            socket.destroy();
        };
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new ToolExecutionError(message));
        };
        const abort = () => fail('TLS inspection cancelled.');
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) {
            abort();
            return;
        }
        socket.setTimeout(4000, () => fail('TLS handshake timed out.'));
        socket.once('error', () => fail('Unable to complete the TLS handshake.'));
        socket.once('secureConnect', () => {
            if (settled) return;
            const cert = socket.getPeerCertificate(true);
            if (!cert || !Object.keys(cert).length) {
                fail('The server provided no certificate.');
                return;
            }
            const hostnameError = checkServerIdentity(host, cert),
                authorizationError = socket.authorizationError
                    ? String(socket.authorizationError)
                    : null;
            const chain = [],
                seen = new Set<string>();
            let current: any = cert;
            while (current && chain.length < 5) {
                const fingerprint = String(current.fingerprint256 ?? current.fingerprint ?? '');
                if (seen.has(fingerprint)) break;
                seen.add(fingerprint);
                chain.push({
                    subject: current.subject,
                    issuer: current.issuer,
                    subjectAlternativeNames: current.subjectaltname,
                    validFrom: current.valid_from,
                    validTo: current.valid_to,
                    serialNumber: current.serialNumber,
                    fingerprint256: current.fingerprint256,
                });
                current = current.issuerCertificate;
            }
            const value = {
                hostname: host,
                address: address.address,
                port: parsed.port ? Number(parsed.port) : 443,
                authorized: socket.authorized && !hostnameError,
                hostnameMatches: !hostnameError,
                authorizationError: authorizationError ?? hostnameError?.message ?? null,
                protocol: socket.getProtocol(),
                cipher: socket.getCipher(),
                daysUntilExpiry: Math.floor((Date.parse(cert.valid_to) - Date.now()) / 86400000),
                handshakeMs: Math.round((performance.now() - start) * 100) / 100,
                chain,
            };
            settled = true;
            cleanup();
            resolve(value);
        });
    });
}
export class NetworkRunner {
    private active = new Set<AbortController>();
    async run(
        id: NetworkOperationId,
        input: string,
        options: OperationOptions,
        signal: AbortSignal,
    ): Promise<string> {
        if (this.active.size >= 4)
            throw new ToolExecutionError('Network tools are busy. Try again shortly.', 'busy');
        if (
            input.length > (id === 'mock-apis-api-test-scenarios' ? 32768 : 4096) ||
            Object.values(options).some((value) => value !== undefined && value.length > 4096)
        )
            throw new ToolExecutionError(
                id === 'mock-apis-api-test-scenarios'
                    ? 'Scenario input is limited to 32 KiB and secret options to 4,096 characters.'
                    : 'Network tool fields are limited to 4,096 characters.',
            );
        const definition: ExtraDefinition = networkOperations[id];
        for (const field of definition.fields ?? [])
            if (
                field.choices &&
                options[field.key] !== undefined &&
                !field.choices.some(([value]) => value === options[field.key])
            )
                throw new ToolExecutionError(`Choose a supported value for ${field.label}.`);
        const controller = new AbortController(),
            cancel = () => controller.abort();
        this.active.add(controller);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        let timedOut = false;
        const timer = setTimeout(
            () => {
                timedOut = true;
                controller.abort();
            },
            id === 'mock-apis-api-test-scenarios' ? 20000 : 10000,
        ).unref();
        try {
            const value = await this.execute(id, input.trim(), options, controller.signal);
            if (controller.signal.aborted)
                throw new ToolExecutionError(
                    timedOut ? 'Network tool timed out.' : 'Request cancelled.',
                    timedOut ? 'timeout' : 'cancelled',
                );
            return JSON.stringify(value, null, 2);
        } catch (error) {
            if (timedOut)
                throw new ToolExecutionError(
                    id === 'mock-apis-api-test-scenarios'
                        ? 'Scenario exceeded twenty seconds. Requests already sent may have reached the destination.'
                        : 'Network tool exceeded ten seconds.',
                    'timeout',
                );
            if (error instanceof ToolExecutionError) throw error;
            throw new ToolExecutionError('Unable to complete this network check.');
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
            this.active.delete(controller);
        }
    }
    close() {
        for (const controller of this.active) controller.abort();
        this.active.clear();
    }
    private async execute(
        id: NetworkOperationId,
        input: string,
        options: OperationOptions,
        signal: AbortSignal,
    ): Promise<unknown> {
        switch (id) {
            case 'mock-apis-api-test-scenarios':
                return runScenario(input, options.secret ?? '', signal);
            case 'agents-mcp-server-inspector':
                return inspectMcp(input, options, signal);
            case 'network-request-replay': {
                const method = (options.method ?? 'GET') as
                    'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
                const headers: Record<string, string> = {};
                for (const line of (options.headers ?? '').split(/\r?\n/).filter(Boolean)) {
                    const colon = line.indexOf(':'),
                        name = line.slice(0, colon).trim().toLowerCase(),
                        value = line.slice(colon + 1).trim();
                    if (
                        colon < 1 ||
                        !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name) ||
                        /[\x00-\x1f\x7f]/.test(value) ||
                        [
                            'host',
                            'connection',
                            'content-length',
                            'transfer-encoding',
                            'upgrade',
                            'cookie',
                            'proxy-authorization',
                            'proxy-connection',
                            'te',
                            'trailer',
                            'expect',
                        ].includes(name) ||
                        name.startsWith('x-forwarded-') ||
                        name.startsWith('proxy-') ||
                        name === 'forwarded' ||
                        Object.hasOwn(headers, name)
                    )
                        throw new ToolExecutionError(
                            'Use unique valid headers without routing, cookie or hop-by-hop headers.',
                        );
                    headers[name] = value;
                }
                if (Object.keys(headers).length > 32)
                    throw new ToolExecutionError('Use at most 32 request headers.');
                const body = options.body ?? '';
                if (['GET', 'HEAD'].includes(method) && body)
                    throw new ToolExecutionError('GET and HEAD requests cannot include a body.');
                const response = await publicRequest(input, signal, {
                    method,
                    headers,
                    requestBody: body,
                    body: method !== 'HEAD',
                });
                return {
                    url: response.url,
                    method,
                    status: response.status,
                    headers: response.headers,
                    body: response.body.toString('utf8'),
                    truncated: response.truncated,
                    timings: response.timings,
                    perspective: 'Measured from socket.help’s server. Redirects were not followed.',
                };
            }
            case 'network-sse-tester': {
                const response = await followPublic(input, signal, {
                    body: true,
                    captureMs: 3000,
                    headers: { Accept: 'text/event-stream' },
                });
                if (
                    response.status !== 200 ||
                    !/^text\/event-stream(?:;|$)/i.test(
                        String(response.headers['content-type'] ?? ''),
                    )
                )
                    throw new ToolExecutionError(
                        'The endpoint did not return a successful text/event-stream response.',
                    );
                return {
                    url: response.url,
                    status: response.status,
                    ...parseSse(response.body.toString('utf8')),
                    bytes: response.body.length,
                    captureEndedEarly: response.truncated,
                    hops: response.hops,
                    note: 'At most three seconds per response and 100 complete events. Partial final events are omitted.',
                };
            }

            case 'network-dns-lookup':
                return dnsAnswer(domain(input), options.recordType ?? 'A', 'cloudflare', signal);
            case 'network-dns-propagation': {
                const name = domain(input),
                    type = options.recordType ?? 'A';
                const responses = await Promise.allSettled([
                    dnsAnswer(name, type, 'cloudflare', signal),
                    dnsAnswer(name, type, 'google', signal),
                ]);
                const resolvers = responses.map((result, index) =>
                    result.status === 'fulfilled'
                        ? result.value
                        : {
                              provider: index === 0 ? 'cloudflare' : 'google',
                              error: 'Resolver query failed.',
                          },
                );
                const keys = responses.map((result) =>
                    result.status === 'fulfilled' ? dnsResponseKey(result.value) : null,
                );
                return {
                    domain: name,
                    type,
                    resolvers,
                    answersMatch: keys[0] !== null && keys[1] !== null && keys[0] === keys[1],
                    note: 'Two resolver snapshots; TTL differences are ignored.',
                };
            }
            case 'domains-domain-validation': {
                const name = domain(input);
                const results = await Promise.allSettled(
                    ['A', 'AAAA', 'TXT'].map((type) => dnsAnswer(name, type, 'cloudflare', signal)),
                );
                const records = results.map((result, index) =>
                    result.status === 'fulfilled'
                        ? result.value
                        : { type: ['A', 'AAAA', 'TXT'][index], error: 'Resolver query failed.' },
                );
                const txt = results[2],
                    values =
                        txt?.status === 'fulfilled'
                            ? txt.value.answers
                                  .filter((item) => item.type === 16)
                                  .map((item) => txtValue(item.data))
                            : [];
                return {
                    domain: name,
                    records,
                    ...(options.expectedTxt
                        ? { expectedTxtFound: values.includes(options.expectedTxt) }
                        : {}),
                    ownershipGranted: false,
                };
            }
            case 'network-whois-rdap-lookup':
                return rdap(domain(input), signal);
            case 'network-ssl-tls-inspector':
                return inspectTls(input, signal);
            case 'network-cors-tester': {
                const rawOrigin = options.origin ?? 'https://example.com';
                let origin = rawOrigin;
                if (rawOrigin !== 'null') {
                    let value: URL;
                    try {
                        value = new URL(rawOrigin);
                    } catch {
                        throw new ToolExecutionError('Enter an HTTP or HTTPS Origin, or null.');
                    }
                    if (
                        !['http:', 'https:'].includes(value.protocol) ||
                        value.username ||
                        value.password
                    )
                        throw new ToolExecutionError(
                            'Use an HTTP or HTTPS Origin without credentials.',
                        );
                    origin = value.origin;
                }
                const method = options.method ?? 'GET',
                    names = (options.headerNames ?? '')
                        .split(',')
                        .map((name) => name.trim().toLowerCase())
                        .filter(Boolean);
                if (
                    names.length > 32 ||
                    names.some((name) => !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name))
                )
                    throw new ToolExecutionError('Use at most 32 valid header names.');
                const response = await publicRequest(input, signal, {
                    method: 'OPTIONS',
                    headers: {
                        Origin: origin,
                        'Access-Control-Request-Method': method,
                        ...(names.length
                            ? { 'Access-Control-Request-Headers': names.join(', ') }
                            : {}),
                    },
                });
                const header = (name: string) => {
                    const value = response.headers[name];
                    return Array.isArray(value) ? value.join(',') : (value ?? '');
                };
                const credentialed = options.credentials === 'include',
                    allowOrigin = header('access-control-allow-origin'),
                    methods = header('access-control-allow-methods')
                        .split(',')
                        .map((value) => value.trim().toUpperCase()),
                    allowedHeaders = header('access-control-allow-headers')
                        .split(',')
                        .map((value) => value.trim().toLowerCase());
                const checks = {
                    successfulStatus: response.status >= 200 && response.status < 300,
                    originAllowed: allowOrigin === origin || (!credentialed && allowOrigin === '*'),
                    methodAllowed:
                        ['GET', 'HEAD', 'POST'].includes(method) ||
                        methods.includes(method) ||
                        (!credentialed && methods.includes('*')),
                    headersAllowed: names.every(
                        (name) =>
                            allowedHeaders.includes(name) ||
                            (!credentialed &&
                                name !== 'authorization' &&
                                allowedHeaders.includes('*')),
                    ),
                    credentialsAllowed:
                        !credentialed || header('access-control-allow-credentials') === 'true',
                };
                return {
                    url: response.url,
                    status: response.status,
                    origin,
                    requestedMethod: method,
                    requestedHeaders: names,
                    credentialsSent: false,
                    headers: response.headers,
                    checks,
                    checksPass: Object.values(checks).every(Boolean),
                    note: 'Header diagnostics do not replace a complete browser CORS test.',
                };
            }
            case 'network-link-preview-inspector': {
                const response = await followPublic(input, signal, { body: true });
                if (
                    !/(?:text\/html|application\/xhtml\+xml)/i.test(
                        String(response.headers['content-type'] ?? ''),
                    )
                )
                    throw new ToolExecutionError('The endpoint did not return HTML.');
                const $ = load(response.body.toString('utf8')),
                    meta: Record<string, string> = {};
                $('meta')
                    .slice(0, 200)
                    .each((_index, element) => {
                        const key = $(element).attr('property') ?? $(element).attr('name'),
                            value = $(element).attr('content');
                        if (
                            key &&
                            value &&
                            (key.startsWith('og:') ||
                                key.startsWith('twitter:') ||
                                key === 'description')
                        )
                            meta[key.slice(0, 100)] = value.slice(0, 4096);
                    });
                const canonical = $('link[rel="canonical"]').first().attr('href');
                let canonicalUrl: string | null = null;
                if (canonical)
                    try {
                        canonicalUrl = new URL(canonical, response.url).href;
                    } catch {}
                return {
                    url: response.url,
                    status: response.status,
                    title: $('title').first().text().trim().slice(0, 500),
                    description: meta.description ?? null,
                    canonical: canonicalUrl,
                    metadata: meta,
                    truncated: response.truncated,
                    hops: response.hops,
                };
            }
            case 'network-http-header-inspector':
            case 'network-redirect-tester': {
                const response = await followPublic(input, signal, {
                    method:
                        id === 'network-redirect-tester'
                            ? 'HEAD'
                            : options.method === 'GET'
                              ? 'GET'
                              : 'HEAD',
                });
                return {
                    url: response.url,
                    status: response.status,
                    headers: response.headers,
                    hops: response.hops,
                    timings: response.timings,
                };
            }
            case 'network-network-diagnostics': {
                const parsed = publicUrl(input),
                    start = performance.now(),
                    addresses = await resolvePublic(parsed.hostname, signal),
                    dnsMs = performance.now() - start,
                    response = await followPublic(parsed.href, signal, { method: 'HEAD' });
                return {
                    url: response.url,
                    status: response.status,
                    addresses,
                    dnsMs: Math.round(dnsMs * 100) / 100,
                    timings: response.timings,
                    hops: response.hops,
                    perspective: 'This socket.help server',
                };
            }
        }
    }
}
