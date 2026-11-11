import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import ipaddr from 'ipaddr.js';

export function httpOrigin(value: string, name: string): URL {
    const message = `${name} must be an HTTP(S) origin without credentials, path, query, or fragment.`;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(message);
    }
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    )
        throw new Error(message);
    return url;
}

export function policy(hashes: string[] = []): string {
    return [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ].join('; ');
}
export async function documentPolicies(root?: string): Promise<Map<string, string>> {
    const pages = new Map<string, string>();
    if (!root) return pages;
    async function visit(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await visit(path);
            else if (entry.name.endsWith('.html')) {
                const html = await readFile(path, 'utf8');
                const hashes = [
                    ...new Set(
                        [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(
                            (script) =>
                                script[1]
                                    ? [
                                          `'sha256-${createHash('sha256').update(script[1]).digest('base64')}'`,
                                      ]
                                    : [],
                        ),
                    ),
                ];
                const url = `/${relative(root!, path).split(sep).join('/')}`;
                pages.set(url, policy(hashes));
                if (url.endsWith('/index.html')) {
                    const directoryUrl = url.slice(0, -10);
                    pages.set(directoryUrl, policy(hashes));
                    if (directoryUrl !== '/') pages.set(directoryUrl.slice(0, -1), policy(hashes));
                }
            }
        }
    }
    await visit(root);
    return pages;
}

/** Resource IDs are UUIDs; anything else is rejected before it can create rate-limit state. */
export const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Rate-limit identity for a client address: IPv4 as-is, IPv6 collapsed to its /64. */
export function clientKey(address: string): string {
    if (!ipaddr.isValid(address)) return address;
    const parsed = ipaddr.process(address);
    if (parsed.kind() === 'ipv4') return parsed.toString();
    const parts = (parsed as ipaddr.IPv6).parts.slice(0, 4);
    return `${parts.map((part) => part.toString(16)).join(':')}::/64`;
}
