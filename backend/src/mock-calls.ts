import type { Pool } from 'pg';
import { isUuid } from './security.js';

export const MOCK_CALL_LIMIT = 100;
const PREVIEW_BYTES = 2048;

/** One call to a hosted mock, kept so people and agents can see what their code actually sent. */
export interface MockCall {
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
        list.push(call);
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
        // Only mocks that still exist get a log, and each keeps its newest calls. The DELETE sees the
        // table as it was before this INSERT, so it keeps one fewer old row to make room.
        await this.pool.query(
            `WITH added AS (
                INSERT INTO mock_calls (resource_id, call)
                SELECT id, $2::jsonb FROM temporary_resources WHERE id = $1 AND kind = 'mock'
                RETURNING resource_id
            )
            DELETE FROM mock_calls WHERE resource_id IN (SELECT resource_id FROM added)
                AND sequence <= (
                    SELECT sequence FROM mock_calls WHERE resource_id = $1
                    ORDER BY sequence DESC OFFSET $3 LIMIT 1
                )`,
            [id, JSON.stringify(call), MOCK_CALL_LIMIT - 1],
        );
    }

    async list(id: string) {
        if (!isUuid(id)) return [];
        const result = await this.pool.query<{ call: MockCall }>(
            'SELECT call FROM mock_calls WHERE resource_id = $1 ORDER BY sequence',
            [id],
        );
        return result.rows.map((row) => row.call);
    }
}
