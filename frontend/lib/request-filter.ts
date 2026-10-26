import type { CapturedRequest } from './api';

export type RequestSearchScope = 'all' | 'path' | 'body' | 'headers' | 'query';

export function filterRequests(
    requests: CapturedRequest[],
    query: string,
    method = 'all',
    scope: RequestSearchScope = 'all',
) {
    const needle = query.trim().toLowerCase();
    return [...requests].reverse().filter((request) => {
        if (method !== 'all' && request.method !== method) return false;
        if (!needle) return true;
        const values = {
            path: `${request.method} ${request.path}`,
            body: request.bodyEncoding === 'utf8' ? request.body : '',
            headers: JSON.stringify(request.headers),
            query: JSON.stringify(request.query),
        };
        const haystack = scope === 'all' ? Object.values(values).join('\n') : values[scope];
        return haystack.toLowerCase().includes(needle);
    });
}
