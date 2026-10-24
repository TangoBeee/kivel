import { validateCrud, initialCrud } from './mock-crud.js';
import type { CrudConfig } from './mock-crud.js';
const byteLength = (text: string) => new TextEncoder().encode(text).length;
export interface MockRoute {
    method: string;
    path: string;
    status: number;
    body: string;
    headers: Record<string, string>;
    delayMs: number;
    template?: boolean;
    condition?: { source: 'header' | 'query' | 'body'; key: string; value: string };
    requestsPerMinute?: number;
    stream?: { mode: 'sse' | 'text'; intervalMs: number };
}
export interface MockConfig {
    name: string;
    routes: MockRoute[];
    crud?: CrudConfig;
    echo?: true;
}
export const mockPayload = (config: MockConfig) => ({
    ...config,
    ...(config.crud ? { crudState: initialCrud(config.crud) } : {}),
});
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ANY'];
const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
export function validateMock(value: unknown): MockConfig {
    if (
        !object(value) ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 80 ||
        !Array.isArray(value.routes) ||
        (!value.routes.length && value.crud === undefined && value.echo !== true) ||
        value.routes.length > 20
    )
        throw new Error('Provide a name and either 1–20 static routes or a CRUD collection.');
    if (
        value.echo !== undefined &&
        (value.echo !== true || value.routes.length || value.crud !== undefined)
    )
        throw new Error('Echo mode requires echo: true, empty routes and no CRUD collection.');
    const seen = new Set<string>();
    const routes = value.routes.map((item): MockRoute => {
        if (
            !object(item) ||
            typeof item.method !== 'string' ||
            !methods.includes(item.method) ||
            typeof item.path !== 'string' ||
            item.path.length > 200 ||
            !/^\/(?:[a-zA-Z0-9._~:-]+\/?)*$/.test(item.path) ||
            item.path
                .split('/')
                .some(
                    (part) =>
                        part === '..' ||
                        part === '.' ||
                        (part.includes(':') && !/^:[a-zA-Z][a-zA-Z0-9_]*$/.test(part)),
                ) ||
            typeof item.body !== 'string' ||
            byteLength(item.body) > 50 * 1024 ||
            !Number.isInteger(item.status) ||
            Number(item.status) < 200 ||
            Number(item.status) > 599 ||
            !Number.isInteger(item.delayMs ?? 0) ||
            Number(item.delayMs ?? 0) < 0 ||
            Number(item.delayMs ?? 0) > 2000
        )
            throw new Error(
                'Each route needs a valid method, path, status (200–599), body (up to 50 KiB), and delay (0–2000 ms).',
            );
        if (item.template !== undefined && typeof item.template !== 'boolean')
            throw new Error('Template must be a boolean.');
        let condition: MockRoute['condition'];
        if (item.condition !== undefined) {
            const rule = item.condition;
            if (
                !object(rule) ||
                !['header', 'query', 'body'].includes(String(rule.source)) ||
                typeof rule.key !== 'string' ||
                !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(rule.key) ||
                ['__proto__', 'constructor', 'prototype'].includes(rule.key) ||
                typeof rule.value !== 'string' ||
                rule.value.length > 512 ||
                /[\x00-\x1f\x7f]/.test(rule.value)
            )
                throw new Error(
                    'Use one header, query or top-level body field condition, with a value up to 512 characters.',
                );
            condition = {
                source: rule.source as 'header' | 'query' | 'body',
                key: rule.source === 'header' ? rule.key.toLowerCase() : rule.key,
                value: rule.value,
            };
        }
        if (
            item.template &&
            (item.stream ||
                Object.values(item.headers ?? {}).some(
                    (v) => typeof v === 'string' && /xml/.test(v),
                ))
        )
            throw new Error('Templates support JSON and plain text responses without streaming.');
        const key = `${item.method} ${item.path} ${JSON.stringify(condition ?? null)}`;
        if (seen.has(key)) throw new Error('Duplicate method and path.');
        seen.add(key);
        if (item.headers !== undefined && !object(item.headers))
            throw new Error('Headers must be an object.');
        const headers: Record<string, string> = {};
        if (Object.keys(item.headers ?? {}).length > 10)
            throw new Error('Use at most 10 response headers.');
        for (const [key, value] of Object.entries(item.headers ?? {})) {
            const name = key.toLowerCase();
            if (
                (!/^x-mock-[a-z0-9-]+$/.test(name) && name !== 'content-type') ||
                typeof value !== 'string' ||
                value.length > 200 ||
                /[^\x20-\x7e]/.test(value)
            )
                throw new Error('Only Content-Type and X-Mock-* headers are allowed.');
            if (
                name === 'content-type' &&
                !/^(application\/(json|problem\+json|xml)|text\/(plain|csv|event-stream))(;\s*charset=utf-8)?$/i.test(
                    value,
                )
            )
                throw new Error(
                    'Mock content types must be JSON, XML, CSV, plain text, or event streams.',
                );
            if (headers[name] !== undefined) throw new Error('Duplicate response header.');
            headers[name] = value;
        }
        if (item.template) {
            const type = headers['content-type'] ?? 'application/json';
            if (
                !/^(application\/(json|problem\+json)|text\/plain)(;\s*charset=utf-8)?$/i.test(type)
            )
                throw new Error('Templates support JSON and plain text only.');
            if (type.includes('json')) {
                try {
                    JSON.parse(item.body);
                } catch {
                    throw new Error(
                        'JSON response templates must be valid JSON, with placeholders inside strings.',
                    );
                }
            }
        }
        if (
            item.requestsPerMinute !== undefined &&
            (!Number.isInteger(item.requestsPerMinute) ||
                Number(item.requestsPerMinute) < 1 ||
                Number(item.requestsPerMinute) > 120)
        )
            throw new Error('Route quotas must be from 1 to 120 requests per minute.');
        let stream: MockRoute['stream'];
        if (item.stream !== undefined) {
            if (
                !object(item.stream) ||
                !['sse', 'text'].includes(String(item.stream.mode)) ||
                !Number.isInteger(item.stream.intervalMs) ||
                Number(item.stream.intervalMs) < 10 ||
                Number(item.stream.intervalMs) > 1000 ||
                item.status !== 200 ||
                !['GET', 'ANY'].includes(item.method)
            )
                throw new Error(
                    'Streams require GET/ANY, status 200, and an interval from 10 to 1000 ms.',
                );
            const chunks = item.body.split(/\r\n|\r|\n/);
            if (
                !item.body.length ||
                chunks.length > 20 ||
                chunks.some((chunk) => byteLength(chunk) > 4096) ||
                (chunks.length - 1) * Number(item.stream.intervalMs) > 5000
            )
                throw new Error(
                    'Streams support up to 20 nonempty-body lines, 4 KiB per line and five seconds of delivery.',
                );
            stream = {
                mode: item.stream.mode as 'sse' | 'text',
                intervalMs: Number(item.stream.intervalMs),
            };
            headers['content-type'] = stream.mode === 'sse' ? 'text/event-stream' : 'text/plain';
        }
        return {
            ...(stream ? { stream } : {}),
            ...(condition ? { condition } : {}),
            ...(item.template ? { template: true } : {}),
            ...(item.requestsPerMinute !== undefined
                ? { requestsPerMinute: Number(item.requestsPerMinute) }
                : {}),
            method: item.method,
            path: item.path,
            status: Number(item.status),
            body: item.body,
            delayMs: Number(item.delayMs ?? 0),
            headers,
        };
    });
    const crud = value.crud === undefined ? undefined : validateCrud(value.crud);
    if (
        crud &&
        routes.some(
            (route) =>
                route.path === crud.path ||
                route.path.startsWith(`${crud.path}/`) ||
                route.path.split('/')[1]?.startsWith(':'),
        )
    )
        throw new Error('The CRUD collection path is reserved; static routes cannot overlap it.');
    const config: MockConfig = {
        name: value.name.trim(),
        routes,
        ...(value.echo === true ? { echo: true as const } : {}),
        ...(crud ? { crud } : {}),
    };
    if (byteLength(JSON.stringify(config)) > 80 * 1024)
        throw new Error('The complete configuration must fit within 80 KiB.');
    return config;
}
