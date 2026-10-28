import { accountOpenApi } from './account-openapi.js';
import { API_VERSION } from './version.js';
import { mcpOpenApi } from './mcp-openapi.js';
import { resourceOpenApi, sharingProperties, accessTokenProperty } from './resource-openapi.js';
export function openApi(origin: string) {
    const resources = resourceOpenApi(origin);
    const mcp = mcpOpenApi(origin);
    const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
    const json = (schema: object, description = 'Success') => ({
        description,
        content: { 'application/json': { schema } },
    });
    const unavailable = { '404': json(reference('Error'), 'Inbox unavailable or token invalid') };
    const limited = {
        '429': json(reference('Error'), 'Rate or history limit reached'),
        '503': json(reference('Error'), 'Service capacity reached'),
    };
    const secured = [{ inspectionToken: [] }, { accountKey: [] }, { sessionCookie: [] }];
    const id = [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ];
    const capture = {
        summary: 'Capture an incoming request',
        tags: ['Webhook inboxes'],
        parameters: id,
        responses: {
            '200': json({
                type: 'object',
                properties: {
                    received: { const: true },
                    requestId: { type: 'string', format: 'uuid' },
                },
            }),
            '413': json(reference('Error'), 'Body exceeds 100 KiB'),
            ...unavailable,
            ...limited,
        },
    };
    const values = {
        type: 'object',
        additionalProperties: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
    };
    const accounts = accountOpenApi();
    const spec = {
        openapi: '3.1.0',
        info: {
            title: 'socket.help API',
            version: API_VERSION,
            description: [
                'Run utilities and create temporary webhook inboxes, mock APIs, files, and MCP servers.',
                '## Start here',
                'Use the [quickstart](/docs/) for a first request or [integrations](/integrations/) for SDK, CLI, SSH, and MCP setup. SDK and CLI packages currently ship in the repository.',
                '## Credentials',
                '- **Account:** `Authorization: Bearer sh_…`. Scoped keys share workspace access and allowances.',
                '- **Anonymous management:** the returned inspection or management token, sent as Bearer or `X-Resource-Token` when an account key occupies Authorization.',
                '- **Private callers:** a separate token in `X-Access-Token`, or authorized workspace access. New resources are private by default. Keep credentials out of URLs.',
                '## Lifetimes and usage',
                'Resources start with one hour. Renewal and persistent leases follow the plan. Read `GET /api/plans` and `GET /api/usage` for allowances. Delete temporary resources when finished.',
                'Browser utilities run locally. Hosted execution sends input to the server without saving execution history. Account administration and billing require a browser session.',
            ].join('\n\n'),
        },
        servers: [{ url: origin }],
        tags: [
            ...accounts.tags,
            {
                name: 'Music library',
                description: 'Original CC0 instrumental tracks and byte-range audio playback.',
            },
            { name: 'Webhook inboxes', description: 'Capture and inspect callbacks.' },
            { name: 'Mock APIs', description: 'Manage temporary API configurations.' },
            { name: 'Mock endpoints', description: 'Call your configured routes.' },
            { name: 'Files', description: 'Share temporary attachments.' },
            { name: 'Platform', description: 'Service health.' },
            {
                name: 'MCP',
                description:
                    'Connect agents through Streamable HTTP at /mcp. Discover available operations with tools/list.',
            },
            {
                name: 'Mock MCP servers',
                description: 'Configurable static tools for agent integration testing.',
            },
        ],
        paths: {
            '/api/music': {
                get: {
                    tags: ['Music library'],
                    summary: 'List original CC0 tracks',
                    description:
                        'Returns titles, moods, genres, tempos, durations, license metadata and relative audio/download URLs. No account is required. These are original synthesized recordings, not third-party commercial music.',
                    responses: { '200': json({ type: 'object' }) },
                },
            },
            '/api/music/{id}/audio.wav': {
                get: {
                    tags: ['Music library'],
                    summary: 'Stream or download a music track',
                    description:
                        '44.1 kHz, 16-bit stereo WAV. Supports a single bytes range, ETag, If-None-Match and If-Range. Add download=1 for attachment disposition. Rendered on first use and cached in bounded memory; no external recording service is contacted.',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                        {
                            name: 'Range',
                            in: 'header',
                            schema: { type: 'string' },
                            example: 'bytes=0-65535',
                        },
                        { name: 'download', in: 'query', schema: { type: 'string', enum: ['1'] } },
                    ],
                    responses: {
                        '200': {
                            description: 'Complete WAV',
                            content: {
                                'audio/wav': { schema: { type: 'string', format: 'binary' } },
                            },
                        },
                        '206': {
                            description: 'Requested byte range',
                            headers: { 'Content-Range': { schema: { type: 'string' } } },
                            content: {
                                'audio/wav': { schema: { type: 'string', format: 'binary' } },
                            },
                        },
                        '304': { description: 'Cached track is unchanged' },
                        '404': json(reference('Error')),
                        '416': { description: 'Requested range is invalid' },
                        '503': json(reference('Error')),
                    },
                },
            },
            ...accounts.paths,
            ...resources.paths,
            ...mcp.paths,
            '/api/inboxes': {
                post: {
                    operationId: 'createInbox',
                    tags: ['Webhook inboxes'],
                    summary: 'Create a temporary webhook inbox',
                    parameters: [
                        {
                            name: 'ttlSeconds',
                            in: 'query',
                            schema: { type: 'integer', minimum: 60, default: 3600 },
                            description: 'Maximum lifetime depends on plan.',
                        },
                        {
                            name: 'persistent',
                            in: 'query',
                            schema: { type: 'boolean', default: false },
                            description: 'Active paid plans only.',
                        },
                    ],
                    responses: { '201': json(reference('InboxCredentials')), ...limited },
                },
            },
            '/hooks/{id}': Object.fromEntries(
                ['get', 'head', 'post', 'put', 'patch', 'delete', 'options'].map((method) => [
                    method,
                    {
                        ...capture,
                        operationId: `capture${method[0]!.toUpperCase()}${method.slice(1)}`,
                        ...(method === 'head'
                            ? {
                                  responses: {
                                      ...capture.responses,
                                      '200': { description: 'Captured; response has no body' },
                                  },
                              }
                            : {}),
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
            '/api/inboxes/{id}': {
                get: {
                    operationId: 'inspectInbox',
                    tags: ['Webhook inboxes'],
                    summary: 'Read inbox expiration and usage',
                    parameters: id,
                    security: secured,
                    responses: { '200': json(reference('InboxInfo')), ...unavailable, ...limited },
                },
                delete: {
                    operationId: 'deleteInbox',
                    tags: ['Webhook inboxes'],
                    summary: 'Delete an inbox and its history',
                    parameters: id,
                    security: secured,
                    responses: { '204': { description: 'Deleted' }, ...unavailable, ...limited },
                },
            },
            '/api/inboxes/{id}/requests': {
                get: {
                    operationId: 'listRequests',
                    tags: ['Webhook inboxes'],
                    summary: 'Read captured requests in arrival order',
                    security: secured,
                    parameters: [
                        ...id,
                        { name: 'If-None-Match', in: 'header', schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': {
                            ...json({
                                type: 'object',
                                required: ['requests'],
                                properties: {
                                    requests: {
                                        type: 'array',
                                        items: reference('CapturedRequest'),
                                    },
                                },
                            }),
                            headers: { ETag: { schema: { type: 'string' } } },
                        },
                        '304': { description: 'History unchanged' },
                        ...unavailable,
                        ...limited,
                    },
                },
            },
            '/api/inboxes/{id}/response': {
                put: {
                    operationId: 'setInboxResponse',
                    tags: ['Webhook inboxes'],
                    summary: 'Choose what the inbox answers senders with',
                    description:
                        'Replaces the default JSON receipt. HTML, cookies and redirects-by-header are not allowed; custom header names must start with X-.',
                    security: secured,
                    parameters: id,
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        status: {
                                            type: 'integer',
                                            minimum: 200,
                                            maximum: 599,
                                            default: 200,
                                        },
                                        contentType: {
                                            type: 'string',
                                            enum: [
                                                'application/json',
                                                'text/plain',
                                                'application/xml',
                                                'text/xml',
                                            ],
                                        },
                                        body: { type: 'string', maxLength: 16384 },
                                        headers: {
                                            type: 'object',
                                            maxProperties: 10,
                                            additionalProperties: {
                                                type: 'string',
                                                maxLength: 256,
                                            },
                                        },
                                        delayMs: { type: 'integer', minimum: 0, maximum: 5000 },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        '200': { description: 'Saved' },
                        '400': { description: 'Invalid response settings' },
                        ...unavailable,
                        ...limited,
                    },
                },
                delete: {
                    operationId: 'resetInboxResponse',
                    tags: ['Webhook inboxes'],
                    summary: 'Restore the default JSON receipt',
                    security: secured,
                    parameters: id,
                    responses: { '204': { description: 'Reset' }, ...unavailable, ...limited },
                },
            },
            '/api/inboxes/{id}/wait': {
                get: {
                    operationId: 'waitForRequests',
                    tags: ['Webhook inboxes'],
                    summary: 'Wait until the inbox receives a request',
                    description:
                        'Long poll. Answers as soon as a request newer than `after` (or any request, when `after` is omitted) is captured, or with `timedOut: true` after `timeoutSeconds`. Call again to keep waiting.',
                    security: secured,
                    parameters: [
                        ...id,
                        {
                            name: 'after',
                            in: 'query',
                            description: 'Return only requests captured after this request ID.',
                            schema: { type: 'string' },
                        },
                        {
                            name: 'timeoutSeconds',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, maximum: 30, default: 25 },
                        },
                    ],
                    responses: {
                        '200': json({
                            type: 'object',
                            required: ['timedOut', 'requests'],
                            properties: {
                                timedOut: { type: 'boolean' },
                                requests: { type: 'array', items: reference('CapturedRequest') },
                            },
                        }),
                        '400': { description: 'Invalid timeoutSeconds' },
                        ...unavailable,
                        ...limited,
                    },
                },
            },
        },
        components: {
            securitySchemes: {
                shareAccess: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-Access-Token',
                    description:
                        'Private resource access token. It allows download or endpoint use, but cannot inspect history or manage the resource. Bearer Authorization is also accepted.',
                },
                accountKey: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'sh_…',
                    description:
                        'Revocable workspace API key. Scopes and membership are checked for each request.',
                },
                sessionCookie: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: origin.startsWith('https:') ? '__Host-socket_session' : 'socket_session',
                    description:
                        'HttpOnly browser session. Mutating session requests require a matching Origin header.',
                },
                privateResourceToken: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-Resource-Token',
                    description:
                        'Anonymous resource credential when Authorization is used by an account key.',
                },
                resourceToken: {
                    type: 'http',
                    scheme: 'bearer',
                    description:
                        'Private management token returned once when creating a mock API or file share.',
                },
                inspectionToken: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Private token returned once at inbox creation.',
                },
            },
            schemas: {
                ...resources.schemas,
                ...mcp.schemas,
                InboxCredentials: {
                    type: 'object',
                    required: ['id', 'webhookUrl', 'inspectionToken', 'expiresAt'],
                    properties: {
                        ...sharingProperties,
                        accessToken: accessTokenProperty,
                        id: { type: 'string', format: 'uuid' },
                        webhookUrl: { type: 'string', format: 'uri' },
                        inspectionToken: { type: 'string', minLength: 43, maxLength: 43 },
                        expiresAt: { type: 'string', format: 'date-time' },
                    },
                },
                InboxInfo: {
                    type: 'object',
                    required: ['id', 'expiresAt', 'requestCount', 'storedBytes'],
                    properties: {
                        ...sharingProperties,
                        id: { type: 'string', format: 'uuid' },
                        expiresAt: { type: 'string', format: 'date-time' },
                        requestCount: { type: 'integer', minimum: 0 },
                        storedBytes: { type: 'integer', minimum: 0 },
                    },
                },
                CapturedRequest: {
                    type: 'object',
                    required: [
                        'id',
                        'method',
                        'path',
                        'headers',
                        'query',
                        'body',
                        'bodyEncoding',
                        'bodySize',
                        'timestamp',
                    ],
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        method: { type: 'string' },
                        path: { type: 'string' },
                        headers: values,
                        query: values,
                        body: { type: 'string' },
                        bodyEncoding: { enum: ['utf8', 'base64'] },
                        bodySize: { type: 'integer', minimum: 0 },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                },
                Error: {
                    type: 'object',
                    required: ['error'],
                    properties: { error: { type: 'string' }, requestId: { type: 'string' } },
                },
            },
        },
    };
    for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, definition] of Object.entries(methods)) {
            if (!definition || typeof definition !== 'object') continue;
            const operation = definition as {
                security?: object[];
                parameters?: object[];
                description?: string;
            };
            if (/^\/api\/(inboxes|mocks|files|mcp-servers)(\/|$)/.test(path)) {
                operation.security = [
                    ...(operation.security ??
                        (path.includes('{id}') ? [{ resourceToken: [] }] : [{}])),
                    { accountKey: [] },
                    { privateResourceToken: [] },
                    { accountKey: [], privateResourceToken: [] },
                    { sessionCookie: [] },
                ];
                if (method === 'post' && !path.includes('{id}'))
                    operation.parameters = [
                        ...(operation.parameters ?? []).filter(
                            (parameter) =>
                                !['visibility', 'ttlSeconds', 'persistent'].includes(
                                    (parameter as { name?: string }).name ?? '',
                                ),
                        ),
                        {
                            name: 'ttlSeconds',
                            in: 'query',
                            schema: {
                                type: 'integer',
                                minimum: 60,
                                maximum: 2592000,
                                default: 3600,
                            },
                            description:
                                'Lifetime from creation, bounded by the active plan. Resources default to one hour.',
                        },
                        {
                            name: 'persistent',
                            in: 'query',
                            schema: { type: 'boolean', default: false },
                            description:
                                'Requires an active paid plan. The lease follows the subscription period plus the cleanup grace period.',
                        },
                        {
                            name: 'visibility',
                            in: 'query',
                            schema: {
                                type: 'string',
                                enum: ['public', 'private'],
                                default: 'private',
                            },
                            description:
                                'Choose private to require a distinct access token. All interfaces default to private; choose public explicitly for an endpoint without credentials.',
                        },
                    ];
            }
            if (path === '/api/files' && method === 'post')
                operation.parameters = [
                    ...(operation.parameters ?? []),
                    {
                        name: 'maxDownloads',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 1000 },
                        description:
                            'Set 1 for one-time links. Defaults to 100 anonymously or 1000 for accounts. Final download removes stored file contents; metadata remains until expiry or deletion.',
                    },
                ];
            if (/^\/(files|mock|hooks)\//.test(path) || path.startsWith('/mcp/mock/'))
                operation.security = [
                    {},
                    { shareAccess: [] },
                    { accountKey: [] },
                    { sessionCookie: [] },
                ];
        }
    }
    const wav = spec.paths['/api/music/{id}/audio.wav'].get;
    Object.assign(spec.paths, {
        '/api/music/{id}/audio.mp3': {
            get: {
                ...wav,
                summary: 'Stream or download a full MP3 arrangement',
                description:
                    'Original 128 kbps MP3 arrangements, approximately 1½–3 minutes, included with the deployment under CC0. Supports byte ranges, conditional requests and download=1. The WAV endpoint provides the editable base loop.',
                responses: {
                    ...wav.responses,
                    '200': {
                        description: 'Complete MP3',
                        content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } },
                    },
                    '206': {
                        description: 'Requested MP3 byte range',
                        headers: { 'Content-Range': { schema: { type: 'string' } } },
                        content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } },
                    },
                },
            },
        },
    });
    return spec;
}
