import { developerNetworkOperations } from './developer-definitions.js';
import type { ExtraDefinition, UtilityField } from './extra-definitions.js';
import { sampleScenario } from './api-scenarios.js';
const record: UtilityField = {
    key: 'recordType',
    label: 'Record type',
    defaultValue: 'A',
    choices: [
        ['A', 'A'],
        ['AAAA', 'AAAA'],
        ['CNAME', 'CNAME'],
        ['MX', 'MX'],
        ['TXT', 'TXT'],
        ['NS', 'NS'],
        ['SOA', 'SOA'],
        ['CAA', 'CAA'],
    ],
};
const domainLimits =
    'Public DNS-over-HTTPS queries only. Results are fetched on the server and are not retained as execution history. Lookup sources are the public services queried for these checks, not the domain’s DNS hosting provider. These checks do not change DNS records.';
const webLimits =
    'Only public HTTP/HTTPS targets on ports 80, 443, 8080, or 8443. Private, loopback, link-local, and reserved IP ranges are blocked on every hop. Up to five redirects, 256 KiB response data, and a ten-second overall deadline. No cookies or user credentials are sent.';
export const networkOperations = {
    ...developerNetworkOperations,
    'network-websocket-tester': {
        action: 'Test connection',
        input: true,
        inputLabel: 'Public WebSocket URL',
        placeholder: 'wss://your-app.com/live',
        fields: [
            {
                key: 'body',
                label: 'Message to send (optional, sign in required)',
                type: 'textarea',
                defaultValue: '',
            },
            {
                key: 'format',
                label: 'Message format',
                defaultValue: 'text',
                choices: [
                    ['text', 'Text'],
                    ['base64', 'Binary (base64)'],
                ],
            },
            { key: 'protocol', label: 'Subprotocol (optional)', defaultValue: '' },
            {
                key: 'secret',
                label: 'Access token (optional, WSS only)',
                type: 'password',
                defaultValue: '',
            },
        ],
        intro: 'Check a WebSocket upgrade and capture the first messages from your server.',
        steps: [
            'Enter a public ws:// or wss:// URL.',
            'Optionally send one text or base64 message. Sign in to send messages.',
            'Review handshake timing, received messages and the close code.',
        ],
        limits: 'Captures up to 10 messages of 16 KiB over three seconds after connecting. No redirects. Private addresses are blocked. Access tokens are sent only as X-Access-Token over WSS.',
        example: 'wss://your-app.com/live',
        useCase:
            'Check whether a real-time endpoint upgrades, sends an expected reply and closes cleanly.',
    },
    'mock-apis-webhook-event-simulator': {
        action: 'Send test event',
        input: true,
        inputLabel: 'Your public test webhook URL',
        placeholder: 'https://your-app.com/hooks/test',
        fields: [
            {
                key: 'mode',
                label: 'Provider',
                defaultValue: 'stripe',
                choices: [
                    ['stripe', 'Stripe'],
                    ['github', 'GitHub'],
                    ['shopify', 'Shopify'],
                ],
            },
            {
                key: 'action',
                label: 'Event',
                defaultValue: 'default',
                choices: [
                    ['default', 'Provider default'],
                    ['checkout.session.completed', 'Stripe · checkout completed'],
                    ['payment_intent.succeeded', 'Stripe · payment succeeded'],
                    ['invoice.paid', 'Stripe · invoice paid'],
                    ['push', 'GitHub · push'],
                    ['pull_request', 'GitHub · pull request opened'],
                    ['orders/create', 'Shopify · order created'],
                    ['orders/paid', 'Shopify · order paid'],
                ],
            },
            { key: 'secret', label: 'Test signing secret', type: 'password', defaultValue: '' },
            {
                key: 'body',
                label: 'Custom JSON payload (optional)',
                type: 'textarea',
                defaultValue: '',
            },
        ],
        intro: 'Send realistic synthetic Stripe, GitHub or Shopify events to your public test endpoint, signed with required options.secret (1–256 bytes).',
        steps: [
            'Choose a provider, event and public test URL.',
            'Set options.secret to the same test signing secret your receiver uses (required, 1–256 bytes); optionally edit the JSON payload.',
            'Send one event and inspect its exact headers, body and receiver response.',
        ],
        limits: 'One outbound POST per successful run, with the normal ten-second network deadline. Private/local targets and redirects are blocked. Custom JSON is limited to 4 KiB. The secret is used only to sign the event and is not returned or retained. Test endpoints may change state when they receive the event; this simulator does not contact provider APIs.',
        useCase:
            'Exercise webhook signature validation and event handling without creating a real payment, commit or order.',
        example:
            'Stripe-Signature: t=<timestamp>,v1=<HMAC of timestamp.body>\nX-Hub-Signature-256: sha256=<HMAC of body>\nX-Shopify-Hmac-Sha256: <base64 HMAC of body>',
    },
    'mock-apis-api-test-scenarios': {
        action: 'Run scenario',
        input: true,
        inputLabel: 'Scenario JSON',
        placeholder: JSON.stringify(sampleScenario, null, 2),
        fields: [
            {
                key: 'secret',
                label: 'Secret values (JSON object; never included in exports)',
                type: 'password',
                defaultValue: '',
            },
        ],
        intro: 'Build and run an ordered API request collection with environment variables, status and response checks, captured JSON fields and a per-request report.',
        steps: [
            'Configure one public base origin and up to six requests.',
            'Add checks and optional variables; supply secret values separately.',
            'Run once, inspect each result, then export the reusable scenario.',
        ],
        limits: 'Hosted sequential execution: up to six requests, three seconds per request and twenty seconds overall, 32 KiB scenario JSON, 8 KiB body templates and 64 KiB responses. All requests stay on one public origin; redirects and cookies are not followed or replayed. Secret variables are restricted to headers and excluded from exports. No scripts, background polling or retained execution history. A completed report uses one hosted run, including failed assertions or request errors; invalid configurations do not. Requests can change the destination service. Cancellation does not undo requests already sent.',
        useCase:
            'Repeat a small integration check without manually editing and sending every request.',
        example:
            'GET /items → capture first ID → GET /items/{{itemId}} → check HTTP status and JSON fields',
    },
    'agents-mcp-server-inspector': {
        action: 'Inspect MCP server',
        input: true,
        inputLabel: 'Public Streamable HTTP endpoint',
        placeholder: 'https://example.com/mcp',
        fields: [
            {
                key: 'mode',
                label: 'Collection',
                defaultValue: 'tools',
                choices: [
                    ['tools', 'Tools and input schemas'],
                    ['resources', 'Resource descriptors'],
                    ['prompts', 'Prompt descriptors'],
                ],
            },
            {
                key: 'count',
                label: 'Item limit',
                type: 'number',
                defaultValue: '20',
                min: 1,
                max: 100,
            },
            { key: 'secret', label: 'Bearer token (optional)', type: 'password', defaultValue: '' },
            {
                key: 'headers',
                label: 'Additional X-* authentication headers (optional)',
                type: 'textarea',
                defaultValue: '',
            },
            { key: 'cursor', label: 'Page cursor (optional)', defaultValue: '' },
        ],
        intro: 'Initialize a public MCP server and inspect its negotiated protocol, capabilities and tool, resource or prompt descriptors without invoking its tools.',
        steps: [
            'Enter a public Streamable HTTP MCP endpoint.',
            'Choose the collection and add authentication only if the endpoint needs it.',
            'Inspect server metadata and schemas, then use a page cursor for larger collections.',
        ],
        limits: 'Public HTTP/HTTPS targets only, with address pinning and private-address protection. Supports protocol versions 2025-11-25, 2025-06-18 and 2025-03-26. JSON and SSE responses up to 256 KiB each, a ten-second overall deadline, up to five discovery pages and 100 items. Redirects are not followed. Bearer and X-* tokens are sent only to the supplied endpoint and are not returned or retained. OAuth login and local stdio subprocesses are unsupported. Remote descriptions are untrusted data. No tool invocation, resource-content read, sampling or elicitation is performed.',
        useCase:
            'Check an MCP server’s actual tool names, argument schemas and capabilities before connecting an application or agent.',
        example:
            'Initialize → notifications/initialized → tools/list → inspect returned descriptors',
    },
    'network-request-replay': {
        action: 'Send request',
        input: true,
        inputLabel: 'Public destination URL',
        placeholder: 'https://example.com/api/test',
        fields: [
            {
                key: 'method',
                label: 'Method',
                defaultValue: 'GET',
                choices: [
                    ['GET', 'GET'],
                    ['POST', 'POST'],
                    ['PUT', 'PUT'],
                    ['PATCH', 'PATCH'],
                    ['DELETE', 'DELETE'],
                    ['HEAD', 'HEAD'],
                    ['OPTIONS', 'OPTIONS'],
                ],
            },
            {
                key: 'headers',
                label: 'Request headers (Name: value per line)',
                type: 'textarea',
                defaultValue: '',
            },
            { key: 'body', label: 'Request body', type: 'textarea', defaultValue: '' },
        ],
        intro: 'Send an HTTP request from Kivel to a public test endpoint and inspect its response.',
        steps: [
            'Enter the public endpoint you intend to test.',
            'Choose the method, headers and body. Sending a request can change the destination service.',
            'Inspect response headers, body and server-side timings.',
        ],
        limits: 'Public HTTP/HTTPS targets only, with the standard private-address protections. Redirects are returned without following them. Up to 4 KiB per field and 256 KiB response data. Hop-by-hop, routing and cookie headers are blocked. Requests and responses are not retained. Only send test data to endpoints you control or are authorized to test.',
        useCase: 'Replay a test request with an edited body and inspect the server response.',
        example: 'GET https://example.com → status, response headers and body',
    },
    'network-sse-tester': {
        action: 'Inspect event stream',
        input: true,
        inputLabel: 'Public SSE URL',
        placeholder: 'https://example.com/events',
        intro: 'Capture up to three seconds of a public server-sent event stream and inspect complete events.',
        steps: [
            'Enter a public SSE endpoint.',
            'Run the bounded capture.',
            'Inspect event data, IDs, retry hints and comments.',
        ],
        limits:
            webLimits +
            ' Uses a three-second capture window, at most 100 complete events and 256 KiB of data. Partial events at the boundary are omitted. No authorization headers are sent; use your own client for private streams.',
        useCase: 'Debug the framing of a public EventSource endpoint.',
        example: 'data: hello\n\nid: 2\ndata: next event\n\n',
    },
    'network-dns-lookup': {
        action: 'Look up DNS',
        input: true,
        inputLabel: 'Domain',
        placeholder: 'example.com',
        fields: [record],
        intro: 'Look up public DNS records through a DNS-over-HTTPS resolver.',
        steps: [
            'Enter a domain and choose a record type.',
            'Inspect records, TTLs, and resolver status.',
        ],
        limits: domainLimits,
        useCase: 'Check a domain’s published records.',
        example: 'example.com → A, AAAA, MX, TXT, and other record types',
    },
    'network-dns-propagation': {
        action: 'Compare DNS answers',
        input: true,
        inputLabel: 'Domain',
        placeholder: 'example.com',
        fields: [record],
        intro: 'Compare the DNS answers returned by two independent public lookup sources.',
        steps: [
            'Enter a domain and choose a record type.',
            'Compare the two public resolver answers.',
        ],
        limits:
            domainLimits +
            ' This compares two resolvers; it is not a worldwide probe network. TTL and caching can explain differences.',
        useCase: 'Check whether two lookup sources see the same DNS change.',
        example: 'Compare A records returned by lookup source 1 and lookup source 2.',
    },
    'network-ssl-tls-inspector': {
        action: 'Inspect TLS',
        input: true,
        inputLabel: 'HTTPS URL or hostname',
        placeholder: 'example.com',
        intro: 'Inspect a public TLS server’s certificate, hostname match, protocol, cipher, and validity dates.',
        steps: [
            'Enter a hostname or HTTPS URL.',
            'Inspect certificate details and validation status.',
        ],
        limits:
            webLimits +
            ' The certificate probe can inspect invalid certificates but sends no application data. It does not weaken TLS verification for other requests.',
        useCase: 'Check certificate expiry and hostname configuration.',
        example: 'example.com → certificate subject, issuer, validity, protocol, and cipher',
    },
    'network-http-header-inspector': {
        action: 'Inspect headers',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'https://example.com',
        fields: [
            {
                key: 'method',
                label: 'Method',
                defaultValue: 'HEAD',
                choices: [
                    ['HEAD', 'HEAD'],
                    ['GET', 'GET'],
                ],
            },
        ],
        intro: 'Inspect status and response headers from a public HTTP endpoint.',
        steps: [
            'Enter a URL and choose HEAD or GET.',
            'Read the final response and redirect trail.',
        ],
        limits: webLimits + ' Response bodies are not retained for this tool.',
        useCase: 'Check caching, content type, and security headers.',
        example: 'HEAD https://example.com → status and headers',
    },
    'network-link-preview-inspector': {
        action: 'Inspect link metadata',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'https://example.com',
        intro: 'Read a public page’s title, description, canonical URL, and Open Graph and Twitter metadata.',
        steps: [
            'Enter a page URL.',
            'Inspect its declared metadata without executing page scripts.',
        ],
        limits:
            webLimits +
            ' HTML is parsed as data in a worker, with up to 5,000 elements, 64 nesting levels and three seconds of processing. Images are not downloaded, and JavaScript-rendered metadata may be absent.',
        useCase: 'Check the metadata a shared link declares.',
        example: 'title, description, canonical, og:title, og:image',
    },
    'network-redirect-tester': {
        action: 'Inspect redirects',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'http://example.com',
        intro: 'Follow a bounded public HTTP redirect chain and show each status and destination.',
        steps: ['Enter the starting URL.', 'Inspect hops, locations, and the final response.'],
        limits: webLimits + ' Uses HEAD requests and reports redirect loops and excessive chains.',
        useCase: 'Check a moved page or HTTPS redirect.',
        example: 'HTTP 301 → HTTPS 200',
    },
    'network-network-diagnostics': {
        action: 'Check endpoint',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'https://example.com',
        intro: 'Measure a public endpoint’s DNS lookup and HTTP response timings from this server.',
        steps: ['Enter an HTTP URL.', 'Inspect public addresses, status, and measured timings.'],
        limits:
            webLimits +
            ' This is a single server-side measurement, not ICMP ping or a multi-region benchmark.',
        useCase: 'Get a bounded connectivity and response check.',
        example: 'DNS milliseconds, first-response milliseconds, status, and addresses',
    },
    'network-whois-rdap-lookup': {
        action: 'Look up registration',
        input: true,
        inputLabel: 'Domain',
        placeholder: 'example.com',
        intro: 'Read structured domain registration data through the registry’s RDAP service.',
        steps: ['Enter a domain.', 'Inspect registrar, status, nameservers, and registry events.'],
        limits:
            webLimits +
            ' Uses IANA’s RDAP bootstrap rather than legacy port-43 WHOIS. Registry privacy redactions remain in place.',
        useCase: 'Inspect publicly available registration records.',
        example: 'Domain → registry RDAP response',
    },
    'network-cors-tester': {
        action: 'Check CORS headers',
        input: true,
        inputLabel: 'HTTP URL',
        placeholder: 'https://example.com/api',
        fields: [
            { key: 'origin', label: 'Test Origin', defaultValue: 'https://example.com' },
            {
                key: 'method',
                label: 'Requested method',
                defaultValue: 'GET',
                choices: [
                    ['GET', 'GET'],
                    ['POST', 'POST'],
                    ['PUT', 'PUT'],
                    ['PATCH', 'PATCH'],
                    ['DELETE', 'DELETE'],
                ],
            },
            {
                key: 'headerNames',
                label: 'Requested header names (comma-separated)',
                defaultValue: '',
            },
            {
                key: 'credentials',
                label: 'Evaluate credentialed access',
                defaultValue: 'omit',
                choices: [
                    ['omit', 'No credentials'],
                    ['include', 'Credentials required'],
                ],
            },
        ],
        intro: 'Send a public preflight request and inspect CORS response headers for a chosen origin, method, and header set.',
        steps: [
            'Enter a URL and the intended request context.',
            'Inspect the returned preflight headers and checks.',
        ],
        limits:
            webLimits +
            ' No cookies are sent. Header checks are diagnostic and do not replace a complete browser integration test.',
        useCase: 'Diagnose an API’s preflight configuration.',
        example: 'OPTIONS with Origin and Access-Control-Request-Method',
    },
    'domains-domain-validation': {
        action: 'Check domain records',
        input: true,
        inputLabel: 'Domain',
        placeholder: 'example.com',
        fields: [{ key: 'expectedTxt', label: 'Expected TXT value (optional)', defaultValue: '' }],
        intro: 'Check a domain’s public address and TXT records, including an optional expected challenge value.',
        steps: [
            'Enter a domain and optional expected TXT text.',
            'Inspect its public records and whether the text is present.',
        ],
        limits:
            domainLimits +
            ' A TXT match is informational; this tool does not grant domain ownership or configure hosting.',
        useCase: 'Check whether a DNS challenge has been published.',
        example: 'Domain + expected TXT value → record match',
    },
} as const satisfies Record<string, ExtraDefinition>;
export type NetworkOperationId = keyof typeof networkOperations;
