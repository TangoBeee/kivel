import type { ApiScenario } from './api-scenarios.js';
export interface CrudConfig {
    path: string;
    seed: Record<string, unknown>[];
}
export interface CrudState {
    records: Record<string, unknown>[];
    revision: number;
}
export interface CrudReply {
    status: number;
    body?: unknown;
    revision: number;
}
export const crudSchema = {
    type: 'object',
    required: ['path', 'seed'],
    additionalProperties: false,
    properties: {
        path: { type: 'string', pattern: '^/[A-Za-z][A-Za-z0-9_-]{0,39}$' },
        seed: {
            type: 'array',
            maxItems: 200,
            items: { type: 'object', additionalProperties: true },
        },
    },
};
const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const validId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
export function validateRecord(value: unknown): Record<string, unknown> {
    if (!object(value) || bytes(value) > 4096 || Object.keys(value).length > 40)
        throw new Error('Each record must be an object with at most 40 fields and 4 KiB of JSON.');
    const visit = (item: unknown, depth: number) => {
        if (depth > 8) throw new Error('Record nesting is limited to eight levels.');
        if (
            typeof item === 'number' &&
            (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
        )
            throw new Error('Use strings for large numeric identifiers.');
        if (
            item === undefined ||
            typeof item === 'function' ||
            typeof item === 'symbol' ||
            typeof item === 'bigint'
        )
            throw new Error('Records must contain JSON values only.');
        if (item && typeof item === 'object')
            for (const [key, child] of Object.entries(item)) {
                if (unsafe.has(key)) throw new Error('Reserved object keys are not allowed.');
                visit(child, depth + 1);
            }
    };
    visit(value, 0);
    if (value.id !== undefined && !validId(value.id))
        throw new Error(
            'Record IDs must be strings of 1–80 letters, digits, underscores or hyphens.',
        );
    return structuredClone(value);
}
export function validateCrud(value: unknown): CrudConfig {
    if (
        !object(value) ||
        typeof value.path !== 'string' ||
        !/^\/[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value.path) ||
        !Array.isArray(value.seed) ||
        value.seed.length > 200 ||
        bytes(value.seed) > 65536
    )
        throw new Error(
            'CRUD needs a collection path such as /items and up to 200 seed records within 64 KiB.',
        );
    const ids = new Set<string>();
    const seed = value.seed.map((item, index) => {
        const record = validateRecord(item);
        record.id ??= `seed_${index + 1}`;
        if (ids.has(record.id as string)) throw new Error('Seed record IDs must be unique.');
        ids.add(record.id as string);
        return validateRecord(record);
    });
    return { path: value.path, seed };
}
export function initialCrud(config: CrudConfig): CrudState {
    return { records: structuredClone(config.seed), revision: 0 };
}
export function crudPath(config: CrudConfig, path: string) {
    return path === config.path || path === `${config.path}/` || path.startsWith(`${config.path}/`);
}
export function executeCrud(
    config: CrudConfig,
    state: CrudState,
    request: {
        method: string;
        path: string;
        query: Record<string, unknown>;
        body?: unknown;
        ifRevision?: string | undefined;
    },
    id = () => `rec_${crypto.randomUUID()}`,
): CrudReply {
    const fail = (status: number, error: string): CrudReply => ({
        status,
        body: { error },
        revision: state.revision,
    });
    const itemPath = request.path.slice(config.path.length).replace(/\/$/, '');
    const recordId = itemPath.startsWith('/') ? itemPath.slice(1) : '';
    if (recordId && !validId(recordId)) return fail(404, 'Record not found.');
    const index = state.records.findIndex((item) => item.id === recordId);
    if (request.method === 'GET' || request.method === 'HEAD') {
        if (recordId)
            return index < 0
                ? fail(404, 'Record not found.')
                : {
                      status: 200,
                      body: structuredClone(state.records[index]),
                      revision: state.revision,
                  };
        if (
            Object.keys(request.query).some(
                (key) => !['limit', 'offset', 'q', 'sort', 'order'].includes(key),
            )
        )
            return fail(400, 'Use limit, offset, q, sort and order query parameters.');
        const integer = (value: unknown, fallback: number, min: number, max: number) =>
            value === undefined
                ? fallback
                : typeof value === 'string' &&
                    /^\d+$/.test(value) &&
                    Number(value) >= min &&
                    Number(value) <= max
                  ? Number(value)
                  : undefined;
        const limit = integer(request.query.limit, 50, 1, 100),
            offset = integer(request.query.offset, 0, 0, 200);
        const q = request.query.q ?? '',
            sort = request.query.sort ?? 'id',
            order = request.query.order ?? 'asc';
        if (
            limit === undefined ||
            offset === undefined ||
            typeof q !== 'string' ||
            q.length > 200 ||
            typeof sort !== 'string' ||
            !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(sort) ||
            unsafe.has(sort) ||
            !['asc', 'desc'].includes(String(order))
        )
            return fail(
                400,
                'Use limit 1–100, offset 0–200, q up to 200 characters, a top-level sort field and asc/desc order.',
            );
        const filtered = state.records.filter((item) =>
            JSON.stringify(item).toLowerCase().includes(q.toLowerCase()),
        );
        filtered.sort((a, b) => {
            const x = a[sort],
                y = b[sort];
            if (x === undefined || x === null) return y === undefined || y === null ? 0 : 1;
            if (y === undefined || y === null) return -1;
            const compare =
                typeof x === 'number' && typeof y === 'number'
                    ? x - y
                    : String(x).localeCompare(String(y));
            return order === 'desc' ? -compare : compare;
        });
        return {
            status: 200,
            body: {
                data: structuredClone(filtered.slice(offset, offset + limit)),
                total: filtered.length,
                limit,
                offset,
                revision: state.revision,
            },
            revision: state.revision,
        };
    }
    if (
        !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ||
        (request.method === 'POST' && recordId) ||
        (request.method !== 'POST' && !recordId)
    )
        return fail(405, 'Use GET/POST on the collection and GET/PUT/PATCH/DELETE on a record.');
    if (
        request.ifRevision !== undefined &&
        (!/^\d+$/.test(request.ifRevision) || !Number.isSafeInteger(Number(request.ifRevision)))
    )
        return fail(400, 'X-Mock-If-Revision must be a nonnegative integer.');
    if (request.ifRevision !== undefined && Number(request.ifRevision) !== state.revision)
        return fail(409, 'The collection changed. Refresh its revision before retrying.');
    if (request.method !== 'POST' && index < 0) return fail(404, 'Record not found.');
    if (request.method === 'DELETE') {
        state.records.splice(index, 1);
        state.revision++;
        return { status: 204, revision: state.revision };
    }
    let record: Record<string, unknown>;
    try {
        record = validateRecord(request.body);
    } catch (error) {
        return fail(400, (error as Error).message);
    }
    if (request.method === 'POST') {
        record.id ??= id();
        if (state.records.some((item) => item.id === record.id))
            return fail(409, 'A record with this ID already exists.');
        if (state.records.length >= 200)
            return fail(409, 'This collection has reached its 200-record limit.');
    } else {
        if (record.id !== undefined && record.id !== recordId)
            return fail(400, 'A record ID cannot be changed.');
        record =
            request.method === 'PATCH'
                ? { ...state.records[index], ...record, id: recordId }
                : { ...record, id: recordId };
    }
    try {
        validateRecord(record);
    } catch (error) {
        return fail(400, (error as Error).message);
    }
    const next = [...state.records];
    if (request.method === 'POST') next.push(record);
    else next[index] = record;
    if (bytes(next) > 131072) return fail(409, 'Live records must fit within 128 KiB.');
    state.records = next;
    state.revision++;
    return {
        status: request.method === 'POST' ? 201 : 200,
        body: structuredClone(record),
        revision: state.revision,
    };
}

export function crudScenario(
    id: string,
    path: string,
    origin: string,
    privateAccess: boolean,
): ApiScenario {
    const endpoint = `/mock/${id}${path}`;
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(privateAccess ? { 'x-access-token': '{{accessToken}}' } : {}),
    };
    return {
        version: 1,
        name: 'CRUD lifecycle check',
        baseUrl: origin,
        variables: {},
        secretNames: privateAccess ? ['accessToken'] : [],
        stopOnFailure: true,
        requests: [
            {
                name: 'Create a temporary test record',
                method: 'POST',
                path: endpoint,
                headers,
                body: '{"name":"Scenario test record","status":"todo"}',
                expect: { status: 201 },
                extract: { name: 'createdId', path: 'id' },
            },
            {
                name: 'Read the created record',
                method: 'GET',
                path: `${endpoint}/{{createdId}}`,
                headers,
                body: '',
                expect: { status: 200, json: { path: 'name', equals: 'Scenario test record' } },
            },
            {
                name: 'Update its status',
                method: 'PATCH',
                path: `${endpoint}/{{createdId}}`,
                headers,
                body: '{"status":"done"}',
                expect: { status: 200, json: { path: 'status', equals: 'done' } },
            },
            {
                name: 'Delete the test record',
                method: 'DELETE',
                path: `${endpoint}/{{createdId}}`,
                headers,
                body: '',
                expect: { status: 204 },
            },
            {
                name: 'Verify deletion',
                method: 'GET',
                path: `${endpoint}/{{createdId}}`,
                headers,
                body: '',
                expect: { status: 404 },
            },
        ],
    };
}
