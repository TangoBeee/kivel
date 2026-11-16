import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { isUuid } from './security.js';
import { HttpError } from './errors.js';
import { transaction } from './database.js';

export const MOCK_CALL_LIMIT = 100;
const PREVIEW_BYTES = 2048;

/** One call to a hosted mock, kept so people and agents can see what their code actually sent. */
export interface MockCall {
    id?: string;
    run?: string;
    at: string;
    method: string;
    path: string;
    query: Record<string, unknown>;
    status: number;
    durationMs: number;
    contentType?: string;
    userAgent?: string;
    bodySize: number;
    bodyPreview?: string;
}

export function mockCallFilters(value: Record<string, unknown>) {
    const { method, path, status, run } = value;
    if (run !== undefined && (typeof run !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(run)))
        throw new HttpError(400, 'Use a run ID of 1 to 64 letters, digits, underscores or dashes.');
    if (
        method !== undefined &&
        (typeof method !== 'string' || !/^[A-Za-z][A-Za-z0-9_/. -]{0,39}$/.test(method))
    )
        throw new HttpError(400, 'Provide an HTTP method or protocol operation.');
    if (path !== undefined && (typeof path !== 'string' || !/^\/[^?\x00-\x20]{0,511}$/.test(path)))
        throw new HttpError(
            400,
            'Provide an exact path starting with / and omit the query string.',
        );
    const normalizedStatus =
        status === undefined
            ? undefined
            : (typeof status === 'string' && /^\d{3,4}$/.test(status)) || typeof status === 'number'
              ? Number(status)
              : NaN;
    if (
        normalizedStatus !== undefined &&
        (!Number.isInteger(normalizedStatus) ||
            !(
                (normalizedStatus >= 100 && normalizedStatus <= 599) ||
                (normalizedStatus >= 1000 && normalizedStatus <= 4999)
            ))
    )
        throw new HttpError(400, 'Provide an HTTP status or WebSocket close code.');
    return (row: MockCall) =>
        (method === undefined || row.method.toUpperCase() === (method as string).toUpperCase()) &&
        (path === undefined || row.path === path) &&
        (run === undefined || row.run === run) &&
        (normalizedStatus === undefined || row.status === normalizedStatus);
}

function callCursor(rows: MockCall[], value: unknown) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{22,43}$/.test(value))
        throw new HttpError(400, 'Use the call ID from this mock as the cursor.');
    const index = rows.findIndex((call) => call.id === value);
    if (index < 0)
        throw new HttpError(
            409,
            'This call has expired or belongs to a different mock. Start again without a cursor.',
        );
    return index;
}

export function pageMockCalls(rows: MockCall[], value: Record<string, unknown>) {
    const { limit, cursor } = value;
    if (
        [value.method, value.path, value.status, value.run, limit, cursor].every(
            (item) => item === undefined,
        )
    )
        return undefined;
    const size =
        limit === undefined
            ? 20
            : (typeof limit === 'string' && /^\d+$/.test(limit)) || typeof limit === 'number'
              ? Number(limit)
              : NaN;
    if (!Number.isInteger(size) || size < 1 || size > 50)
        throw new HttpError(400, 'limit must be between 1 and 50.');
    const before = cursor === undefined ? rows.length : callCursor(rows, cursor);
    const matches = rows.slice(0, before).reverse().filter(mockCallFilters(value));
    const calls = matches.slice(0, size);
    return { calls, ...(matches.length > size ? { nextCursor: calls.at(-1)!.id } : {}) };
}

export function assertMockCalls(rows: MockCall[], value: Record<string, unknown>) {
    const { count, after } = value;
    if (
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 0 ||
        count > MOCK_CALL_LIMIT
    )
        throw new HttpError(400, `Provide an exact count from 0 to ${MOCK_CALL_LIMIT}.`);
    const from = after === undefined ? 0 : callCursor(rows, after) + 1;
    const window = rows.slice(from);
    const hits = window.filter(mockCallFilters(value));
    return {
        passed: hits.length === count,
        expected: count,
        matched: hits.length,
        callIds: hits.map((call) => call.id),
        retained: window.length,
        retentionLimit: MOCK_CALL_LIMIT,
        ...(rows.length === MOCK_CALL_LIMIT && after === undefined
            ? { olderCallsMayHaveExpired: true }
            : {}),
    };
}

type MaybePromise<T> = T | Promise<T>;

export interface MockCallRepository {
    record(id: string, call: MockCall): MaybePromise<void>;
    list(id: string): MaybePromise<MockCall[]>;
}

export function mockCall(input: {
    method: string;
    path: string;
    query: unknown;
    status: number;
    durationMs: number;
    headers: Record<string, unknown>;
    body: unknown;
}): MockCall {
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.alloc(0);
    const preview = body.subarray(0, PREVIEW_BYTES);
    const text = preview.toString('utf8');
    const run = input.headers['x-kivel-mock-run'];
    return {
        at: new Date().toISOString(),
        method: input.method,
        path: input.path,
        query:
            input.query && typeof input.query === 'object'
                ? (input.query as Record<string, unknown>)
                : {},
        status: input.status,
        durationMs: Math.round(input.durationMs),
        ...(typeof input.headers['content-type'] === 'string'
            ? { contentType: input.headers['content-type'].slice(0, 120) }
            : {}),
        ...(typeof input.headers['user-agent'] === 'string'
            ? { userAgent: input.headers['user-agent'].slice(0, 200) }
            : {}),
        bodySize: body.length,
        ...(typeof run === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(run) ? { run } : {}),
        // Binary bodies are summarised by size only.
        ...(body.length && !text.includes('�') ? { bodyPreview: text } : {}),
    };
}

export class MemoryMockCalls implements MockCallRepository {
    private readonly calls = new Map<string, MockCall[]>();

    constructor(private readonly maxMocks = 1000) {}

    record(id: string, call: MockCall) {
        const list = this.calls.get(id) ?? [];
        this.calls.delete(id);
        list.push({ ...call, id: randomUUID() });
        if (list.length > MOCK_CALL_LIMIT) list.shift();
        this.calls.set(id, list);
        // Forget the least recently used mock rather than grow without bound.
        if (this.calls.size > this.maxMocks) this.calls.delete(this.calls.keys().next().value!);
    }

    list(id: string) {
        return [...(this.calls.get(id) ?? [])];
    }
}

export class PostgresMockCalls implements MockCallRepository {
    constructor(private readonly pool: Pool) {}

    async record(id: string, call: MockCall) {
        if (!isUuid(id)) return;
        await transaction(this.pool, async (client) => {
            const mock = await client.query(
                "SELECT id FROM temporary_resources WHERE id = $1 AND kind IN ('mock', 'mcp') FOR NO KEY UPDATE",
                [id],
            );
            if (!mock.rowCount) return;
            await client.query('INSERT INTO mock_calls (resource_id, call) VALUES ($1, $2)', [
                id,
                JSON.stringify({ ...call, id: randomUUID() }),
            ]);
            await client.query(
                `DELETE FROM mock_calls WHERE resource_id = $1 AND sequence <= (
                    SELECT sequence FROM mock_calls WHERE resource_id = $1
                    ORDER BY sequence DESC OFFSET $2 LIMIT 1
                )`,
                [id, MOCK_CALL_LIMIT],
            );
        });
    }

    async list(id: string) {
        if (!isUuid(id)) return [];
        const result = await this.pool.query<{ call: MockCall; sequence: string }>(
            'SELECT call, sequence FROM mock_calls WHERE resource_id = $1 ORDER BY sequence',
            [id],
        );
        return result.rows.map(({ call, sequence }) => ({
            ...call,
            id: call.id ?? createHash('sha256').update(`${id}:${sequence}`).digest('base64url'),
        }));
    }
}
