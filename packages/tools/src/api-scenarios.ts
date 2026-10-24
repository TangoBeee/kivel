export const scenarioMethods = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
] as const;
export interface ScenarioRequest {
    name: string;
    method: (typeof scenarioMethods)[number];
    path: string;
    headers: Record<string, string>;
    body: string;
    expect: {
        status: number;
        contains?: string;
        json?: { path: string; equals: string | number | boolean | null };
    };
    extract?: { name: string; path: string };
}
export interface ApiScenario {
    version: 1;
    name: string;
    baseUrl: string;
    variables: Record<string, string>;
    secretNames: string[];
    stopOnFailure: boolean;
    requests: ScenarioRequest[];
}
const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: string) => new TextEncoder().encode(value).length;
const keyPattern = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
export const sensitiveName = (key: string) =>
    /(?:token|secret|secrets|password|passwd|authorization|apikey|privatekey|accesskey|credential|credentials|cookie|cookies|sessionid|auth)$/i.test(
        key.replace(/[-_.]/g, ''),
    );
const name = (value: unknown): value is string =>
    typeof value === 'string' && keyPattern.test(value) && !unsafe.has(value);
export function jsonField(value: unknown, path: string): unknown {
    let current = value;
    for (const part of path.split('.')) {
        if (
            unsafe.has(part) ||
            current === null ||
            typeof current !== 'object' ||
            !Object.hasOwn(current, part)
        )
            return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}
function fieldPath(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= 160 &&
        value.split('.').length <= 8 &&
        value.split('.').every((part) => /^[A-Za-z0-9_-]+$/.test(part) && !unsafe.has(part))
    );
}
export function expandScenario(
    value: string,
    variables: Record<string, string>,
    json = false,
): string {
    return value.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
        if (!Object.hasOwn(variables, key)) throw new Error(`Variable ${key} has no value.`);
        const text = variables[key]!;
        return json ? JSON.stringify(text).slice(1, -1) : text;
    });
}
export function validateScenario(value: unknown): ApiScenario {
    if (
        !object(value) ||
        value.version !== 1 ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 80 ||
        typeof value.baseUrl !== 'string' ||
        value.baseUrl.length > 500 ||
        !Array.isArray(value.requests) ||
        value.requests.length < 1 ||
        value.requests.length > 6
    )
        throw new Error(
            'Provide a version 1 scenario with a name, base URL and one to six requests.',
        );
    let base: URL;
    try {
        base = new URL(value.baseUrl);
    } catch {
        throw new Error('Enter a valid HTTP or HTTPS base URL.');
    }
    if (
        !['http:', 'https:'].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.pathname !== '/' ||
        base.search ||
        base.hash
    )
        throw new Error(
            'The base URL must be an origin, without a path, query, fragment or credentials.',
        );
    const variables: Record<string, string> = {};
    if (value.variables !== undefined && !object(value.variables))
        throw new Error('Variables must be an object.');
    if (Object.keys(value.variables ?? {}).length > 20)
        throw new Error('Use at most 20 environment variables.');
    for (const [key, item] of Object.entries(value.variables ?? {})) {
        if (
            !name(key) ||
            sensitiveName(key) ||
            typeof item !== 'string' ||
            item.length > 1024 ||
            /[\x00-\x1f\x7f]/.test(item)
        )
            throw new Error(
                'Use named string variables up to 1,024 characters. Put credentials in secret inputs.',
            );
        variables[key] = item;
    }
    const secretNames = value.secretNames ?? [];
    if (
        !Array.isArray(secretNames) ||
        secretNames.length > 10 ||
        secretNames.some((key) => !name(key) || Object.hasOwn(variables, key)) ||
        new Set(secretNames).size !== secretNames.length
    )
        throw new Error('Use up to ten unique secret names, separate from ordinary variables.');
    if (value.stopOnFailure !== undefined && typeof value.stopOnFailure !== 'boolean')
        throw new Error('Stop on failure must be a boolean.');
    const known = new Set([...Object.keys(variables), ...secretNames]);
    const refs = (text: string, secretAllowed: boolean) => {
        for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
            if (!known.has(match[1]!))
                throw new Error(`Variable ${match[1]} must be defined before it is used.`);
            if (!secretAllowed && secretNames.includes(match[1]))
                throw new Error('Secret variables can only be used in request headers.');
        }
        if (text.replace(/\{\{[^{}]+\}\}/g, '').includes('{{'))
            throw new Error('Use complete {{variable}} placeholders.');
    };
    const requests = value.requests.map((item, index): ScenarioRequest => {
        if (
            !object(item) ||
            typeof item.name !== 'string' ||
            !item.name.trim() ||
            item.name.length > 80 ||
            !scenarioMethods.includes(item.method as any) ||
            typeof item.path !== 'string' ||
            item.path.length > 1500 ||
            !item.path.startsWith('/') ||
            item.path.startsWith('//') ||
            /[\\\x00-\x20\x7f#]/.test(item.path)
        )
            throw new Error(
                `Request ${index + 1} needs a name, method and relative path starting with one slash.`,
            );
        refs(item.path, false);
        if (
            item.path
                .split('?')[1]
                ?.split('&')
                .some((pair) => sensitiveName(decodeURIComponent(pair.split('=')[0] ?? '')))
        )
            throw new Error('Keep credentials out of query parameters. Use secret headers.');
        if (item.headers !== undefined && !object(item.headers))
            throw new Error('Request headers must be an object.');
        const headers: Record<string, string> = {};
        if (Object.keys(item.headers ?? {}).length > 12)
            throw new Error('Use at most 12 headers per request.');
        for (const [key, text] of Object.entries(item.headers ?? {})) {
            const lower = key.toLowerCase();
            if (
                !/^(accept|content-type|authorization|x-[a-z0-9-]+)$/.test(lower) ||
                lower.startsWith('x-forwarded-') ||
                typeof text !== 'string' ||
                text.length > 2000 ||
                /[\x00-\x1f\x7f]/.test(text) ||
                Object.hasOwn(headers, lower)
            )
                throw new Error(
                    'Use unique Accept, Content-Type, Authorization or X-* headers without routing headers or control characters.',
                );
            refs(text, true);
            if (
                sensitiveName(lower) &&
                text
                    .replace(/\{\{[^{}]+\}\}/g, '')
                    .replace(/^(?:Bearer|Basic)\s*/i, '')
                    .trim()
            )
                throw new Error(
                    'Credential headers must use secret placeholders instead of literal credentials.',
                );
            if (sensitiveName(lower) && !secretNames.some((key) => text.includes(`{{${key}}}`)))
                throw new Error('Credential headers must reference a declared secret.');
            headers[lower] = text;
        }
        const body = item.body ?? '';
        if (
            typeof body !== 'string' ||
            bytes(body) > 8192 ||
            (['GET', 'HEAD'].includes(String(item.method)) && body)
        )
            throw new Error(
                'Request bodies are limited to 8 KiB; GET and HEAD cannot have a body.',
            );
        refs(body, false);
        if (
            !object(item.expect) ||
            !Number.isInteger(item.expect.status) ||
            Number(item.expect.status) < 100 ||
            Number(item.expect.status) > 599 ||
            (item.expect.contains !== undefined &&
                (typeof item.expect.contains !== 'string' || item.expect.contains.length > 500))
        )
            throw new Error(
                'Each request needs an expected status from 100 to 599 and an optional text check up to 500 characters.',
            );
        const expect: ScenarioRequest['expect'] = {
            status: Number(item.expect.status),
            ...(typeof item.expect.contains === 'string' && item.expect.contains
                ? { contains: item.expect.contains }
                : {}),
        };
        if (item.expect.json !== undefined) {
            const check = item.expect.json;
            if (
                !object(check) ||
                !fieldPath(check.path) ||
                !(
                    check.equals === null ||
                    ['string', 'number', 'boolean'].includes(typeof check.equals)
                ) ||
                (typeof check.equals === 'string' && check.equals.length > 500) ||
                (typeof check.equals === 'number' &&
                    (!Number.isFinite(check.equals) ||
                        (Number.isInteger(check.equals) && !Number.isSafeInteger(check.equals))))
            )
                throw new Error(
                    'JSON checks need a dotted field path and a string, finite number, boolean or null value.',
                );
            expect.json = {
                path: check.path,
                equals: check.equals as string | number | boolean | null,
            };
        }
        let extract: ScenarioRequest['extract'];
        if (item.extract !== undefined) {
            if (
                !object(item.extract) ||
                !name(item.extract.name) ||
                !fieldPath(item.extract.path) ||
                sensitiveName(item.extract.name) ||
                sensitiveName(item.extract.path) ||
                known.has(item.extract.name)
            )
                throw new Error('Capture a non-secret JSON field into a new variable name.');
            extract = { name: item.extract.name, path: item.extract.path };
            known.add(extract.name);
        }
        return {
            name: item.name.trim(),
            method: item.method as ScenarioRequest['method'],
            path: item.path,
            headers,
            body,
            expect,
            ...(extract ? { extract } : {}),
        };
    });
    const result: ApiScenario = {
        version: 1,
        name: value.name.trim(),
        baseUrl: base.origin,
        variables,
        secretNames,
        stopOnFailure: value.stopOnFailure !== false,
        requests,
    };
    if (bytes(JSON.stringify(result)) > 32768)
        throw new Error('The complete scenario must fit within 32 KiB.');
    return result;
}
export const sampleScenario: ApiScenario = {
    version: 1,
    name: 'JSON response checks',
    baseUrl: 'https://httpbin.org',
    variables: { label: 'socket-preview' },
    secretNames: [],
    stopOnFailure: true,
    requests: [
        {
            name: 'Read request metadata',
            method: 'GET',
            path: '/anything?label={{label}}',
            headers: { accept: 'application/json' },
            body: '',
            expect: { status: 200, json: { path: 'args.label', equals: 'socket-preview' } },
        },
        {
            name: 'Send a JSON event',
            method: 'POST',
            path: '/anything',
            headers: { 'content-type': 'application/json' },
            body: '{"event":"{{label}}"}',
            expect: { status: 200, json: { path: 'json.event', equals: 'socket-preview' } },
        },
    ],
};
export interface ScenarioReport {
    name: string;
    origin: string;
    passed: boolean;
    total: number;
    completed: number;
    durationMs: number;
    results: {
        name: string;
        method: string;
        path: string;
        outcome: 'passed' | 'failed' | 'skipped';
        status?: number;
        durationMs?: number;
        bytes?: number;
        truncated?: boolean;
        checks: { label: string; passed: boolean; expected?: unknown; actual?: unknown }[];
        headers?: Record<string, unknown>;
        body?: string;
        error?: string;
        captured?: string;
    }[];
}
