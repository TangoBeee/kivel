import { HttpError } from './errors.js';
import type { CapturedRequest } from './inboxes.js';

export interface WebhookFilters {
    method?: string;
    path?: string;
}

export interface WebhookHistory extends WebhookFilters {
    cursor?: string;
    limit: number;
    direction: 'older' | 'newer';
}

export interface WebhookPage {
    requests: CapturedRequest[];
    nextCursor?: string;
    scannedThrough?: string;
}

export const webhookId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function webhookFilters(input: Record<string, unknown>): WebhookFilters {
    const { method, path } = input;
    if (method !== undefined && (typeof method !== 'string' || !/^[a-z]{1,20}$/i.test(method)))
        throw new HttpError(400, 'Provide an HTTP method, such as POST.');
    if (
        path !== undefined &&
        (typeof path !== 'string' || !/^\/(?:[^?#\x00-\x20]{0,511})$/.test(path))
    )
        throw new HttpError(
            400,
            'Provide the exact path after the inbox URL, starting with /. Omit the query string.',
        );
    return {
        ...(typeof method === 'string' ? { method: method.toUpperCase() } : {}),
        ...(typeof path === 'string' ? { path } : {}),
    };
}

export function webhookHistory(
    input: Record<string, unknown>,
    direction: WebhookHistory['direction'],
): WebhookHistory | undefined {
    const cursor = direction === 'newer' ? input.after : input.cursor;
    const filters = webhookFilters(input);
    if (
        input.limit === undefined &&
        !filters.method &&
        !filters.path &&
        (direction === 'newer' || cursor === undefined)
    )
        return undefined;
    if (cursor !== undefined && (typeof cursor !== 'string' || !webhookId.test(cursor)))
        throw new HttpError(400, 'Provide a captured request ID as the cursor.');
    const limit =
        input.limit === undefined
            ? 20
            : typeof input.limit === 'number' ||
                (typeof input.limit === 'string' && /^\d+$/.test(input.limit))
              ? Number(input.limit)
              : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new HttpError(400, 'limit must be between 1 and 50.');
    return {
        direction,
        limit,
        ...(typeof cursor === 'string' ? { cursor: cursor.toLowerCase() } : {}),
        ...filters,
    };
}

export function matchesWebhook(
    request: Pick<CapturedRequest, 'method' | 'path'>,
    inboxId: string,
    filter: WebhookFilters,
) {
    return (
        (!filter.method || request.method === filter.method) &&
        (!filter.path ||
            (request.path.slice('/hooks/'.length + inboxId.length) || '/') === filter.path)
    );
}

export function webhookPage(
    matches: CapturedRequest[],
    limit: number,
    scannedThrough?: string,
): WebhookPage {
    const requests = matches.slice(0, limit);
    return {
        requests,
        ...(matches.length > limit ? { nextCursor: requests.at(-1)!.id } : {}),
        ...(scannedThrough ? { scannedThrough } : {}),
    };
}

export function missingWebhookCursor(): never {
    throw new HttpError(409, 'This cursor is unavailable. Start again without a cursor.');
}
