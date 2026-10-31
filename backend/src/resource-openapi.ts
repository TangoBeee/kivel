import { llmMockSchema } from '@socket-help/tools/llm-mock';
import { crudSchema } from '@socket-help/tools/mock-crud';
export const sharingProperties = {
    visibility: { type: 'string', enum: ['public', 'private'] },
    accessVersion: { type: 'string', description: 'Changes when sharing access is rotated.' },
};
export const accessTokenProperty = {
    type: 'string',
    minLength: 43,
    maxLength: 43,
    readOnly: true,
    description:
        'Returned once for a private resource. Callers send this in X-Access-Token. It is separate from management credentials; keep it out of URLs.',
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const id = [
    {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'The resource ID returned at creation.',
    },
];
const security = [{ resourceToken: [] }];
const errors = {
    '400': json(ref('Error'), 'Invalid configuration or filename'),
    '403': json(ref('Error'), 'Management request has a foreign Origin'),
    '404': json(ref('Error'), 'Unavailable, expired, or access denied'),
    '413': json(ref('Error'), 'Body exceeds the operation limit'),
    '429': {
        ...json(ref('Error'), 'Rate limit reached'),
        headers: {
            'Retry-After': {
                description: 'Seconds until another attempt is allowed.',
                schema: { type: 'integer', minimum: 1 },
            },
        },
    },
    '503': json(ref('Error'), 'Temporary resource capacity reached'),
};
export function resourceOpenApi(origin: string) {
    const mockConfig = {
        type: 'object',
        required: ['name', 'routes'],
        additionalProperties: false,
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            routes: {
                type: 'array',
                minItems: 0,
                maxItems: 20,
                items: ref('MockRoute'),
                description:
                    'At least one static route, a CRUD collection, echo: true, or an llm script is required.',
            },
            crud: crudSchema,
            llm: llmMockSchema,
            echo: {
                type: 'boolean',
                enum: [true],
                description:
                    'Reflect request metadata and body as JSON. Requires routes: [] and no crud. Credential fields are redacted; request content is not retained.',
            },
            proxy: {
                type: 'object',
                required: ['target'],
                description:
                    'Pro and Team. Calls that match no route are sent to target (a public http(s) API) and its answer is returned with X-Mock-Proxied: true; non-text answers are served as application/octet-stream. With record: true, each new JSON, XML or text answer up to 50 KiB is saved as a route, up to 20 routes.',
                properties: {
                    target: { type: 'string', format: 'uri', maxLength: 2048 },
                    record: { type: 'boolean', default: false },
                },
            },
        },
        example: {
            name: 'Users API',
            routes: [
                {
                    method: 'GET',
                    path: '/users/:id',
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    body: '{"id":42,"name":"Ada"}',
                    delayMs: 0,
                },
            ],
        },
    };
    const credentials = {
        type: 'object',
        required: ['id', 'managementToken', 'expiresAt'],
        properties: {
            ...sharingProperties,
            accessToken: accessTokenProperty,
            id: { type: 'string', format: 'uuid' },
            managementToken: {
                type: 'string',
                minLength: 43,
                maxLength: 43,
                description: 'Returned once. Use as a Bearer token for management requests.',
            },
            expiresAt: { type: 'string', format: 'date-time' },
            endpointUrl: { type: 'string', format: 'uri' },
            downloadUrl: { type: 'string', format: 'uri' },
        },
    };
    const publicMock = {
        tags: ['Mock endpoints'],
        parameters: id,
        summary: 'Call a configured mock route',
        description:
            'Append your configured path to this URL. Named segments such as /users/:id match one path segment. First matching route wins; exact methods precede ANY, and HEAD can use GET. Response types are JSON, XML, CSV, or plain text. Responses are sandboxed and cannot set cookies or security headers. At most 120 requests per minute per API. Private routes require X-Access-Token or authorized workspace access. A CRUD collection supports GET/HEAD list and item reads, POST creation, PUT replacement, PATCH top-level merge and DELETE. List queries: limit (1–100, default 50), offset (0–200), q, sort and order. Writes require JSON, up to 4 KiB per record. X-Mock-Revision reports the current revision; X-Mock-If-Revision rejects stale writes with 409. Collections are capped at 200 records and 128 KiB of live JSON.',
        responses: {
            default: {
                description:
                    'The configured status, response body, Content-Type, and X-Mock-* headers.',
                content: {
                    'application/json': { schema: {} },
                    'text/plain': { schema: { type: 'string' } },
                },
            },
            '404': errors['404'],
            '429': errors['429'],
        },
    };
    return {
        paths: {
            '/api/mocks/{id}/reset': {
                post: {
                    operationId: 'resetMockRecords',
                    tags: ['Mock APIs'],
                    summary: 'Restore a CRUD mock to its seed records',
                    description:
                        'Requires management credentials or workspace write access. Restores only this resource’s records and increments its revision. Replaces live data; does not extend expiry.',
                    security,
                    parameters: id,
                    responses: {
                        '200': json({
                            type: 'object',
                            properties: {
                                reset: { type: 'boolean' },
                                records: { type: 'integer' },
                                revision: { type: 'integer' },
                            },
                        }),
                        ...errors,
                    },
                },
            },
            '/api/mocks/{id}/calls': {
                get: {
                    operationId: 'listMockCalls',
                    tags: ['Mock APIs'],
                    summary: 'Read the most recent calls to a mock',
                    description:
                        'Up to 100 calls, oldest first: method, path, query, status, duration, content type, user agent and a 2 KiB body preview. Requires management credentials or workspace read access.',
                    security,
                    parameters: id,
                    responses: {
                        '200': json({
                            type: 'object',
                            properties: {
                                calls: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            at: { type: 'string', format: 'date-time' },
                                            method: { type: 'string' },
                                            path: { type: 'string' },
                                            query: { type: 'object' },
                                            status: { type: 'integer' },
                                            durationMs: { type: 'integer' },
                                            contentType: { type: 'string' },
                                            userAgent: { type: 'string' },
                                            bodySize: { type: 'integer' },
                                            bodyPreview: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        }),
                        ...errors,
                    },
                },
            },
            '/api/mocks': {
                post: {
                    operationId: 'createMockApi',
                    tags: ['Mock APIs'],
                    summary: 'Create a temporary mock API',
                    description:
                        'Create up to 20 static routes and/or one CRUD collection within 80 KiB of configuration. CRUD seed data is limited to 200 records and 64 KiB. Static delays are limited to 2 seconds. Resources start with one hour; ttlSeconds and renewal follow plan limits. New mocks are private. Save returned credentials: the management token controls configuration, while a separate access token lets callers use private routes.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: ref('MockConfig') } },
                    },
                    responses: {
                        '201': json(
                            ref('ResourceCredentials'),
                            'Created; endpointUrl is the public base URL',
                        ),
                        ...errors,
                    },
                    'x-codeSamples': [
                        {
                            lang: 'Shell',
                            source: `curl -X POST ${origin}/api/mocks -H 'Content-Type: application/json' -d '{"name":"Hello","routes":[{"method":"GET","path":"/hello","status":200,"body":"{\\"ok\\":true}"}]}'`,
                        },
                    ],
                },
            },
            '/api/mocks/{id}': {
                get: {
                    operationId: 'inspectMockApi',
                    tags: ['Mock APIs'],
                    summary: 'Read mock configuration and usage',
                    security,
                    parameters: id,
                    responses: { '200': json(ref('MockInfo')), ...errors },
                },
                put: {
                    operationId: 'updateMockApi',
                    tags: ['Mock APIs'],
                    summary: 'Replace mock configuration and reset CRUD records',
                    description:
                        'Updates do not extend expiry. Configuration is replaced atomically. CRUD live records are restored from the new seed and the revision advances.',
                    security,
                    parameters: id,
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: ref('MockConfig') } },
                    },
                    responses: { '204': { description: 'Saved' }, ...errors },
                },
                delete: {
                    operationId: 'deleteMockApi',
                    tags: ['Mock APIs'],
                    summary: 'Delete a mock API immediately',
                    security,
                    parameters: id,
                    responses: {
                        '204': { description: 'Deleted; the endpoint is unavailable' },
                        ...errors,
                    },
                },
            },
            '/mock/{id}/{path}': Object.fromEntries(
                ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].map((method) => [
                    method,
                    {
                        ...publicMock,
                        operationId: `callMock${method}`,
                        parameters: [
                            ...id,
                            {
                                name: 'path',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description:
                                    'Configured route path without the leading slash. May contain multiple path segments.',
                            },
                        ],
                        ...(['post', 'put', 'patch', 'delete', 'options'].includes(method)
                            ? {
                                  requestBody: {
                                      required: false,
                                      content: {
                                          '*/*': { schema: { type: 'string', format: 'binary' } },
                                      },
                                  },
                              }
                            : {}),
                    },
                ]),
            ),
            '/api/files': {
                post: {
                    operationId: 'uploadTemporaryFile',
                    tags: ['Files'],
                    summary: 'Upload a temporary file',
                    description:
                        'Upload a nonempty file up to 10 MiB as raw bytes, not multipart form data. Files start with a one-hour lifetime and private access. Save the download URL and send the separate access token in X-Access-Token. Choose visibility=public explicitly for access without a credential. The final allowed GET removes stored contents. Files are not scanned for malware and download as attachments.',
                    parameters: [
                        {
                            name: 'X-File-Name',
                            in: 'header',
                            required: true,
                            description:
                                'URL-encoded filename, up to 150 decoded characters. Path segments and control characters are removed.',
                            schema: { type: 'string' },
                            example: 'report.pdf',
                        },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/octet-stream': {
                                schema: {
                                    type: 'string',
                                    format: 'binary',
                                    maxLength: 10485760,
                                    minLength: 1,
                                },
                            },
                        },
                    },
                    responses: {
                        '201': json(ref('FileCredentials')),
                        ...errors,
                        '415': json(ref('Error'), 'Use application/octet-stream'),
                    },
                    'x-codeSamples': [
                        {
                            lang: 'Shell',
                            source: `curl -X POST ${origin}/api/files -H 'Content-Type: application/octet-stream' -H 'X-File-Name: report.pdf' --data-binary @report.pdf`,
                        },
                    ],
                },
            },
            '/api/files/{id}': {
                get: {
                    operationId: 'inspectTemporaryFile',
                    tags: ['Files'],
                    summary: 'Read file metadata and remaining downloads',
                    security,
                    parameters: id,
                    responses: { '200': json(ref('FileInfo')), ...errors },
                },
                delete: {
                    operationId: 'deleteTemporaryFile',
                    tags: ['Files'],
                    summary: 'Delete a file immediately',
                    security,
                    parameters: id,
                    responses: {
                        '204': { description: 'Deleted; the download link is unavailable' },
                        ...errors,
                    },
                },
            },
            '/files/{id}': Object.fromEntries(
                ['get', 'head'].map((method) => [
                    method,
                    {
                        operationId: method === 'get' ? 'downloadFile' : 'inspectDownload',
                        tags: ['Files'],
                        summary:
                            method === 'get' ? 'Download a shared file' : 'Read download headers',
                        description:
                            'GET consumes one allowed download; HEAD reads size without consuming a download. Private access requires X-Access-Token or authorized workspace access. Download limits are chosen at creation: default 100 anonymously or 1,000 with an account. The final allowed GET removes stored contents. GET forces attachment download. Expired, deleted, unknown, exhausted, and unauthorized links return 404.',
                        parameters: id,
                        responses: {
                            '200': {
                                description: 'File attachment',
                                headers: {
                                    'Content-Disposition': {
                                        schema: { type: 'string' },
                                        description: 'Attachment with a safe filename.',
                                    },
                                    'Content-Length': { schema: { type: 'integer', minimum: 0 } },
                                },
                                content: {
                                    'application/octet-stream': {
                                        schema: { type: 'string', format: 'binary' },
                                    },
                                },
                            },
                            '404': errors['404'],
                            '429': errors['429'],
                        },
                    },
                ]),
            ),
            '/health': {
                get: {
                    operationId: 'health',
                    tags: ['Platform'],
                    summary: 'Check process liveness',
                    responses: {
                        '200': json({ type: 'object', properties: { status: { const: 'ok' } } }),
                    },
                },
            },
            '/ready': {
                get: {
                    operationId: 'readiness',
                    tags: ['Platform'],
                    summary: 'Check database readiness',
                    responses: {
                        '200': json({ type: 'object', properties: { status: { const: 'ok' } } }),
                        '503': json(
                            { type: 'object', properties: { status: { const: 'unavailable' } } },
                            'Database is unavailable',
                        ),
                    },
                },
            },
        },
        schemas: {
            MockRoute: {
                type: 'object',
                required: ['method', 'path', 'status', 'body'],
                properties: {
                    failureRate: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 100,
                        description:
                            'Percentage of calls answered with failureStatus and X-Mock-Simulated-Failure: true, to test retries.',
                    },
                    failureStatus: { type: 'integer', minimum: 400, maximum: 599, default: 503 },
                    template: {
                        type: 'boolean',
                        default: false,
                        description:
                            'Insert {{path.id}}, {{query.name}}, {{body.name}} and sample data such as {{fake.name}}, {{fake.email}} or {{fake.uuid}} into JSON string values or plain text. No code is executed.',
                    },
                    condition: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['source', 'key', 'value'],
                        properties: {
                            source: { type: 'string', enum: ['header', 'query', 'body'] },
                            key: { type: 'string', maxLength: 80 },
                            value: { type: 'string', maxLength: 512 },
                        },
                        description:
                            'Match one request header, query parameter or top-level JSON body field. Put conditional routes before fallback routes.',
                    },

                    method: {
                        type: 'string',
                        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ANY'],
                    },
                    path: { type: 'string', maxLength: 200, example: '/users/:id' },
                    status: { type: 'integer', minimum: 200, maximum: 599 },
                    body: {
                        type: 'string',
                        maxLength: 51200,
                        description:
                            'Up to 50 KiB UTF-8. Bodies are sent verbatim; JSON is not automatically validated.',
                    },
                    headers: {
                        type: 'object',
                        maxProperties: 10,
                        description:
                            'Only Content-Type and X-Mock-* are allowed. Supported types: application/json, application/problem+json, application/xml, text/plain, text/csv, text/event-stream.',
                        additionalProperties: { type: 'string', maxLength: 200 },
                    },
                    delayMs: { type: 'integer', minimum: 0, maximum: 2000, default: 0 },
                    requestsPerMinute: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 120,
                        description:
                            'Optional per-route shared fixed-window quota. Exceeded requests return 429 and Retry-After after access checks.',
                    },
                    stream: {
                        type: 'object',
                        required: ['mode', 'intervalMs'],
                        properties: {
                            mode: { type: 'string', enum: ['sse', 'text'] },
                            intervalMs: { type: 'integer', minimum: 10, maximum: 1000 },
                        },
                        description:
                            'GET/ANY, status 200. Each body line is a chunk or SSE message; up to 20 lines of 4 KiB and five seconds of delivery. Content-Type is set from the stream mode. Reconnects restart the stream.',
                    },
                },
            },
            MockConfig: mockConfig,
            ResourceCredentials: credentials,
            MockInfo: {
                ...mockConfig,
                properties: {
                    ...mockConfig.properties,
                    ...sharingProperties,
                    id: { type: 'string', format: 'uuid' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    uses: { type: 'integer' },
                    endpointUrl: { type: 'string', format: 'uri' },
                    crudState: {
                        type: 'object',
                        required: ['records', 'revision'],
                        properties: {
                            records: {
                                type: 'array',
                                maxItems: 200,
                                items: { type: 'object', additionalProperties: true },
                            },
                            revision: { type: 'integer', minimum: 0 },
                        },
                    },
                },
            },
            FileCredentials: {
                allOf: [
                    ref('ResourceCredentials'),
                    {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            size: { type: 'integer' },
                            remainingDownloads: { type: 'integer', minimum: 0, maximum: 1000 },
                        },
                    },
                ],
            },
            FileInfo: {
                type: 'object',
                properties: {
                    ...sharingProperties,
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    size: { type: 'integer' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    uses: { type: 'integer' },
                    downloadUrl: { type: 'string', format: 'uri' },
                    remainingDownloads: { type: 'integer', minimum: 0, maximum: 1000 },
                },
            },
        },
    };
}
