import type { ExtraDefinition } from './extra-definitions.js';
const limits =
    'Uses an expiring mock resource, private by default, with separate management and access credentials. Public access is optional. Standard resource quotas, ownership, renewal and deletion apply. Private access tokens are sent in headers, never in share URLs.';
function resource(intro: string, example: string, extra: string): ExtraDefinition {
    return {
        input: false,
        action: 'Create endpoint',
        intro,
        steps: [
            'Configure the endpoint and choose private or public access.',
            'Create it and send requests from your client.',
            'Inspect test output, update or delete the resource when finished.',
        ],
        limits: limits + ' ' + extra,
        useCase: intro,
        example,
    };
}
export const resourceOperations = {
    'mock-apis-mock-websocket-server': resource(
        'Host an expiring WebSocket endpoint to test live messages, reconnects and connection failures.',
        '{"name":"Live updates","routes":[],"websocket":{"echo":true,"welcome":["ready"],"replies":[{"match":"ping","reply":"pong"}]}}',
        'Echo text or binary, send welcome messages in order, match exact text and set a reply delay or close code. Connections last up to one minute and accept messages up to 16 KiB. Inspect traffic with inspect_mock_api or the mock calls API. Private clients can use X-Access-Token in the handshake. Use synthetic messages because traffic previews are retained.',
    ),
    'network-http-echo': resource(
        'Create an expiring echo endpoint that reflects the method, path, query, headers and body observed by this server.',
        'POST /check?source=demo → method, path, query, redacted headers and parsed JSON body',
        'Requests are processed but not retained. Credential-like fields are redacted; use synthetic data because arbitrary text can still contain secrets. Bodies are limited to 100 KiB; binary content returns byte metadata, not the raw bytes. This does not forward requests or expose client IP addresses. Standard mock quotas, ownership, renewal and expiry apply.',
    ),
    'mock-apis-stateful-crud-api': resource(
        'Create a real stateful test API with seeded records, list/search/sort/pagination, record creation, replacement, patching and deletion.',
        'POST /items → GET /items/:id → PATCH /items/:id → DELETE /items/:id',
        'One collection per mock. Up to 200 live records, 4 KiB per record and 128 KiB of live JSON; seed data up to 64 KiB. Updates are atomic in memory and PostgreSQL. X-Mock-Revision and optional X-Mock-If-Revision prevent stale writes. Reset restores the configured seed and requires management access. Updating configuration resets live records. Ordinary mock resource storage, retention and rate limits apply. Public sharing allows others to modify the collection; private is the default. No SQL or user code executes.',
    ),
    'mock-apis-mock-response-templates': resource(
        'Build mock responses from named path segments, query parameters and top-level JSON body fields.',
        'GET /users/42?name=Ada → {"id":"42","name":"Ada"}',
        'Placeholders are inserted into JSON strings or plain text. Missing fields become empty strings. No expressions, loops, scripts or remote calls.',
    ),
    'mock-apis-authentication-mock': resource(
        'Test a protected route with a fake bearer token and a configurable unauthorized fallback.',
        'Authorization: Bearer test-token → 200; other values → 401',
        'The test token is stored in the mock configuration. Use fake credentials. Private sharing additionally requires X-Access-Token; public sharing removes only that outer access check. This is not an identity provider.',
    ),
    'mock-apis-graphql-mock': resource(
        'Mock GraphQL client responses by matching the operationName in a POST JSON body.',
        'POST /graphql with operationName GetViewer → a configured data response',
        'Static GraphQL-shaped responses selected by operationName. This does not parse GraphQL queries, execute resolvers, validate schemas or support subscriptions.',
    ),
    'mock-apis-third-party-api-simulator': resource(
        'Create editable user and search endpoints plus an unavailable-service response for integration tests.',
        'GET /users/user_test_1 → a synthetic user',
        'Generic fixtures, not provider replicas. No third-party requests are made. Routes can match one request field and return static or templated responses.',
    ),
    'mock-apis-payment-api-sandbox': resource(
        'Test success, decline, pending and refund client states against a disposable fake payment API.',
        'POST /payments/decline → HTTP 402 and a simulated decline',
        'No money moves and no payment provider is contacted. Responses are independent static fixtures; no ledger, payment processing, provider signature verification or persistent payment state.',
    ),
    'network-fault-injection': resource(
        'Create a test endpoint with a controlled failure status and optional response delay.',
        'GET /hello → HTTP 503',
        'Static failure responses with statuses 200–599 and delays up to two seconds. No packet loss or low-level transport fault injection.',
    ),
    'network-rate-limit-simulator': resource(
        'Create an endpoint with a shared, configurable requests-per-minute quota for testing retry and backoff.',
        'Two allowed requests → HTTP 429 with Retry-After',
        'Each route allows 1–120 requests per minute. A fixed window starts with its first counted request. Private access is checked before the configured quota is consumed. The general 120/minute mock limit also applies.',
    ),
    'test-media-streaming-response-simulator': resource(
        'Create a text endpoint that sends each configured line at a chosen interval.',
        'first chunk → wait → second chunk',
        'GET or ANY, status 200. Up to 20 lines of 4 KiB each, intervals of 10–1000 ms, and five seconds of delivery. Sixteen streams per server; proxy or client buffering can combine network chunks.',
    ),
    'test-media-sse-generator': resource(
        'Create a server-sent event endpoint with line-based event data, sequential IDs and a configurable interval.',
        'id: 1\nevent: message\ndata: {"step":1}\n\n',
        'GET or ANY, status 200. Up to 20 events of 4 KiB each, 10–1000 ms intervals and five seconds of delivery. Streams close after the final event; reconnects start at the first event. Native EventSource cannot attach custom headers, so use a header-capable client for private streams.',
    ),
    'agents-tool-failure-simulator': resource(
        'Create a mock MCP server whose tools return controlled errors and optional latency.',
        'tools/call → isError: true',
        'Static text results, isError and 0–2000 ms delay per tool. This models tool-level failures; it does not execute agent or model code.',
    ),
} as const;
