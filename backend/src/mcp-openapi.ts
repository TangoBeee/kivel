const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const id = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }];
const security = [{ resourceToken: [] }];
const failures = {
    '400': json(ref('Error'), 'Invalid configuration'),
    '403': json(ref('Error'), 'Origin not allowed'),
    '404': json(ref('Error'), 'Unavailable or access denied'),
    '429': json(ref('Error'), 'Rate limit exceeded; Retry-After gives the delay'),
    '503': json(ref('Error'), 'Resource capacity reached'),
};
const initialization = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'my-client', version: '1.0' },
    },
};
export function mcpOpenApi(origin: string) {
    const transport = {
        tags: ['MCP'],
        summary: 'Send an MCP message over Streamable HTTP',
        description:
            'Stateless JSON responses over POST. Supports initialize, ping, tools/list, tools/call, and notifications. Protocol versions: 2025-11-25, 2025-06-18, and 2025-03-26. GET returns 405 because SSE streams are not provided. No transport session ID is issued. Private mock servers require X-Access-Token or authorized workspace access. Public access is an explicit choice. Platform tools use an account key or anonymous resource credentials for inspection and cleanup. Notifications return 202. Tool failures use isError; JSON-RPC method and parameter errors use the error field.',
        parameters: [
            {
                name: 'Accept',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                example: 'application/json, text/event-stream',
                description:
                    'MCP clients must accept both JSON and SSE media types, even when responses use JSON.',
            },
            {
                name: 'MCP-Protocol-Version',
                in: 'header',
                schema: { type: 'string', enum: ['2025-11-25', '2025-06-18', '2025-03-26'] },
                description: 'Send the negotiated version after initialization.',
            },
        ],
        requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('McpMessage'), example: initialization } },
        },
        responses: {
            '200': json(
                {
                    type: 'object',
                    properties: {
                        jsonrpc: { const: '2.0' },
                        id: { type: ['integer', 'string', 'null'] },
                        result: {},
                        error: {
                            type: 'object',
                            properties: { code: { type: 'integer' }, message: { type: 'string' } },
                        },
                    },
                },
                'JSON-RPC result or error',
            ),
            '202': { description: 'Notification accepted; no body' },
            '406': json(ref('Error'), 'Accept must include application/json and text/event-stream'),
            ...failures,
        },
    };
    return {
        paths: {
            '/mcp': {
                post: {
                    ...transport,
                    operationId: 'platformMcp',
                    'x-codeSamples': [
                        {
                            lang: 'Shell',
                            source: `curl -X POST ${origin}/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '${JSON.stringify(initialization)}'`,
                        },
                    ],
                },
            },
            '/mcp/mock/{id}': {
                post: {
                    ...transport,
                    operationId: 'mockMcp',
                    parameters: [...id, ...transport.parameters],
                },
            },
            '/api/mcp-servers': {
                post: {
                    operationId: 'createMockMcpServer',
                    tags: ['Mock MCP servers'],
                    summary: 'Create a temporary mock MCP server',
                    description:
                        'Up to 10 tools and 80 KiB total configuration. Tool schemas accept object arguments with string, number, integer, or boolean properties. Responses are static text, up to 10,000 UTF-8 bytes per tool. No custom code, outbound requests, or remote schema references are executed. Servers start with one hour, with plan-based retention and renewal. New servers are private. Up to 120 MCP requests per minute are allowed per server.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: ref('MockMcpConfig') } },
                    },
                    responses: {
                        '201': json(
                            ref('ResourceCredentials'),
                            'Created; endpointUrl is the Streamable HTTP endpoint',
                        ),
                        ...failures,
                    },
                },
            },
            '/api/mcp-servers/{id}': {
                get: {
                    operationId: 'inspectMockMcpServer',
                    tags: ['Mock MCP servers'],
                    summary: 'Read server configuration and usage',
                    security,
                    parameters: id,
                    responses: {
                        '200': json({
                            allOf: [
                                ref('MockMcpConfig'),
                                {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string', format: 'uuid' },
                                        expiresAt: { type: 'string', format: 'date-time' },
                                        uses: { type: 'integer' },
                                        endpointUrl: { type: 'string', format: 'uri' },
                                    },
                                },
                            ],
                        }),
                        ...failures,
                    },
                },
                put: {
                    operationId: 'updateMockMcpServer',
                    tags: ['Mock MCP servers'],
                    summary: 'Replace the mock tool configuration',
                    description: 'The existing expiry time is preserved.',
                    security,
                    parameters: id,
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: ref('MockMcpConfig') } },
                    },
                    responses: { '204': { description: 'Saved' }, ...failures },
                },
                delete: {
                    operationId: 'deleteMockMcpServer',
                    tags: ['Mock MCP servers'],
                    summary: 'Delete a mock MCP server',
                    security,
                    parameters: id,
                    responses: { '204': { description: 'Deleted' }, ...failures },
                },
            },
        },
        schemas: {
            McpMessage: {
                type: 'object',
                required: ['jsonrpc', 'method'],
                properties: {
                    jsonrpc: { const: '2.0' },
                    id: { type: ['string', 'integer'], description: 'Omit for notifications.' },
                    method: {
                        type: 'string',
                        enum: [
                            'initialize',
                            'ping',
                            'tools/list',
                            'tools/call',
                            'notifications/initialized',
                        ],
                    },
                    params: { type: 'object', additionalProperties: true },
                },
            },
            MockMcpConfig: {
                type: 'object',
                required: ['name', 'tools'],
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    tools: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 10,
                        items: {
                            type: 'object',
                            required: ['name', 'description', 'inputSchema', 'response'],
                            properties: {
                                name: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
                                description: { type: 'string', maxLength: 500 },
                                inputSchema: {
                                    type: 'object',
                                    required: ['type', 'properties'],
                                    description:
                                        'Root type must be object. Up to 20 primitive properties and a required array. Additional arguments are rejected.',
                                    properties: {
                                        type: { const: 'object' },
                                        properties: {
                                            type: 'object',
                                            maxProperties: 20,
                                            additionalProperties: {
                                                type: 'object',
                                                required: ['type'],
                                                properties: {
                                                    type: {
                                                        enum: [
                                                            'string',
                                                            'number',
                                                            'integer',
                                                            'boolean',
                                                        ],
                                                    },
                                                    description: { type: 'string', maxLength: 200 },
                                                },
                                            },
                                        },
                                        required: { type: 'array', items: { type: 'string' } },
                                    },
                                },
                                response: { type: 'string', maxLength: 10000 },
                                isError: { type: 'boolean', default: false },
                                delayMs: { type: 'integer', minimum: 0, maximum: 2000, default: 0 },
                            },
                        },
                    },
                },
                example: {
                    name: 'Greeting server',
                    tools: [
                        {
                            name: 'greet',
                            description: 'Return a static greeting.',
                            inputSchema: {
                                type: 'object',
                                properties: { name: { type: 'string' } },
                                required: ['name'],
                            },
                            response: 'Hello from socket.help.',
                            isError: false,
                        },
                    ],
                },
            },
        },
    };
}
