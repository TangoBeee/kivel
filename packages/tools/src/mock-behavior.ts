import type { MockRoute } from './mock-config.js';
export interface MockRequest {
    path: string;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    body: unknown;
}
export function matchMockCondition(route: MockRoute, request: MockRequest): boolean {
    if (!route.condition) return true;
    const { source, key, value } = route.condition;
    const object =
        source === 'header' ? request.headers : source === 'query' ? request.query : request.body;
    return (
        !!object &&
        typeof object === 'object' &&
        !Array.isArray(object) &&
        Object.hasOwn(object, key) &&
        String((object as Record<string, unknown>)[key]) === value
    );
}
export function renderMockBody(route: MockRoute, request: MockRequest): string {
    if (!route.template) return route.body;
    const path: Record<string, string> = Object.create(null);
    route.path.split('/').forEach((part, index) => {
        if (part.startsWith(':')) path[part.slice(1)] = request.path.split('/')[index] ?? '';
    });
    const json = (route.headers['content-type'] ?? 'application/json').includes('json');
    let bytes = new TextEncoder().encode(route.body).length;
    return route.body.replace(
        /\{\{(path|query|body)\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,
        (_match, source: string, key: string) => {
            const object =
                source === 'path' ? path : source === 'query' ? request.query : request.body;
            const value =
                object &&
                typeof object === 'object' &&
                !Array.isArray(object) &&
                Object.hasOwn(object, key)
                    ? (object as Record<string, unknown>)[key]
                    : '';
            const text =
                typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                    ? String(value)
                    : '';
            if (text.length > 4096)
                throw new Error('Template values are limited to 4,096 characters.');
            const replacement = json ? JSON.stringify(text).slice(1, -1) : text;
            bytes += new TextEncoder().encode(replacement).length - _match.length;
            if (bytes > 65536) throw new Error('Rendered response exceeds 64 KiB.');
            return replacement;
        },
    );
}
