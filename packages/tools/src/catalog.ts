import { resourceOperations } from './resource-definitions.js';
import type { ToolIcon as IconName } from './icons.js';
import { tools } from './legacy-tools.js';
import { roadmap } from './roadmap.js';
import { mediaOperations } from './media-definitions.js';
import { networkOperations } from './network-definitions.js';
import { browserOperations } from './definitions.js';
import type { AccountPlan } from './plans.js';

export interface Category {
    id: keyof typeof roadmap;
    name: string;
    description: string;
    icon: IconName;
}

export const categories: Category[] = [
    {
        id: 'network',
        name: 'HTTP & webhooks',
        description: 'Catch requests. Inspect connections. Test the unexpected.',
        icon: 'webhook',
    },
    {
        id: 'mock-apis',
        name: 'Mock APIs',
        description: 'Stand-in services for the things you are building.',
        icon: 'cube',
    },
    {
        id: 'agents',
        name: 'AI & MCP',
        description: 'Disposable tools and test environments for agents.',
        icon: 'robot',
    },
    {
        id: 'files',
        name: 'Files & sharing',
        description: 'Move files, share text, and make space for temporary data.',
        icon: 'files',
    },
    {
        id: 'everyday',
        name: 'Everyday tools',
        description: 'Images, PDFs, video, audio, and the everyday essentials.',
        icon: 'shapes',
    },
    {
        id: 'email',
        name: 'Email & inboxes',
        description: 'Owned agent addresses and private email testing.',
        icon: 'mail',
    },
    {
        id: 'domains',
        name: 'Callback URLs',
        description: 'Callback addresses for your test integrations.',
        icon: 'globe',
    },
    {
        id: 'monitoring',
        name: 'Monitoring & status',
        description: 'Know what is up, what is slow, and what needs attention.',
        icon: 'pulse',
    },
    {
        id: 'databases',
        name: 'Databases & state',
        description: 'A little state for your next experiment.',
        icon: 'database',
    },
    {
        id: 'test-media',
        name: 'Test files & media',
        description: 'Realistic fixtures, sample files, and simulated streams.',
        icon: 'media',
    },
    {
        id: 'developer',
        name: 'Developer utilities',
        description: 'Format, encode, inspect, and make sense of your data.',
        icon: 'code',
    },
    {
        id: 'automation',
        name: 'Automation',
        description: 'Schedule a request or connect a few things together.',
        icon: 'lightning',
    },
];

// A muted tint per category, so the board reads as a patchwork of neighbourhoods.
export const categoryTints: Record<Category['id'], string> = {
    network: '#3a6f8f',
    'mock-apis': '#6a5a9e',
    agents: '#8a4f86',
    files: '#9a6b3a',
    everyday: '#4f7d5a',
    email: '#a0564f',
    domains: '#2f7c84',
    monitoring: '#7d7530',
    databases: '#4f64a0',
    'test-media': '#94566b',
    developer: '#286747',
    automation: '#9a7424',
};

export interface CatalogTool {
    id: string;
    name: string;
    description: string;
    categoryId: Category['id'];
    icon: IconName;
    status: 'available' | 'coming-soon';
    href?: string;
    local: boolean;
    minimumPlan?: AccountPlan;
}

const planned: Record<Category['id'], [string, string][]> = {
    network: [
        ['HTTP echo', 'See exactly what your HTTP client sends.'],
        ['Request replay', 'Resend a captured request to a test endpoint.'],
        ['Response builder', 'Return a custom status, headers, and response body.'],
        ['Redirect tester', 'Inspect redirect chains and callback behavior.'],
        ['HTTP status simulator', 'Test your application against any HTTP status.'],
        [
            'Delay & timeout simulator',
            'Test client loading states with configurable delays up to two seconds.',
        ],
        ['Fault injection', 'Introduce controlled failures into integration tests.'],
        ['Request forwarding', 'Capture requests and forward them to another endpoint.'],
        ['SSE tester', 'Inspect server-sent events as they arrive.'],
        ['CORS tester', 'Check cross-origin headers and preflight responses.'],
        ['DNS lookup', 'Look up domain records in one place.'],
        ['DNS propagation', 'Check how DNS changes are reaching resolvers.'],
        ['SSL & TLS inspector', 'Inspect certificates, expiry, and TLS configuration.'],
        ['WHOIS & RDAP lookup', 'Find publicly available domain registration details.'],
        ['HTTP header inspector', 'Inspect response headers from a URL.'],
        ['Link preview inspector', 'Check URL metadata and Open Graph previews.'],
        ['Network diagnostics', 'Check connectivity and response latency.'],
        ['Rate-limit simulator', 'Test retry and backoff behavior against quotas.'],
    ],
    'mock-apis': [
        ['Mock REST API', 'Create configurable REST endpoints for integration testing.'],
        [
            'Stateful CRUD API',
            'Test create, read, update, and delete workflows with temporary state.',
        ],
        ['OpenAPI to mock', 'Turn an OpenAPI specification into a mock service.'],
        ['GraphQL mock', 'Explore queries and responses against a stand-in GraphQL API.'],
        ['Mock response templates', 'Combine dynamic paths, conditions, and response templates.'],
        ['Mock configuration import', 'Import, export, and reuse mock API configurations.'],
        ['Authentication mock', 'Simulate authenticated endpoints and access failures.'],
        ['Third-party API simulator', 'Stand in for external services while you develop.'],
        ['Payment API sandbox', 'Simulate payment events, states, and failure cases.'],
        ['Webhook event simulator', 'Generate test callbacks for your application.'],
        ['API test scenarios', 'Save and reuse collections of integration test cases.'],
    ],
    agents: [
        [
            'Agent authenticator',
            'Store encrypted TOTP authenticators and get sign-in codes for accounts your human asked you to create or operate.',
        ],
        ['Mock MCP server', 'Give agents a temporary MCP server with configurable tools.'],
        ['MCP tool-call inspector', 'Inspect tool calls, responses, and request history.'],
        ['MCP server inspector', 'Explore the capabilities exposed by a remote MCP server.'],
        ['Mock LLM endpoint', 'Test model integrations against configurable responses.'],
        [
            'Mock agents & LLMs',
            'Script agent-facing model text using OpenAI Chat Completions or Anthropic Messages response shapes.',
        ],
        [
            'LLM streaming simulator',
            'Test paced assistant text and streams that end before the completion event.',
        ],
        ['Tool failure simulator', 'Test how an agent handles errors and tool latency.'],
        ['socket.help MCP', 'Create and manage platform resources from your AI agent.'],
    ],
    files: [
        ['Temporary file transfer', 'Upload a file and pick it up from another machine.'],
        [
            'One-time download links',
            'Share a file with one allowed download and automatic content removal.',
        ],
        ['Private file sharing', 'Require a separate access token for temporary file downloads.'],
        ['Temporary JSON storage', 'Store and retrieve a small JSON document over HTTP.'],
        ['Temporary binary storage', 'Keep short-lived binary objects accessible to scripts.'],
        ['Text & code sharing', 'Share an expiring note or code snippet.'],
        ['File metadata inspector', 'Inspect file size, format, and metadata.'],
    ],
    email: [
        [
            'Agent email inbox',
            'Own an address for your agent, with extracted codes and verification links.',
        ],
        ['Email inspector', 'Read headers, MIME content, and delivery details.'],
        ['Attachment inspector', 'Inspect attachments received by a test inbox.'],
        ['Email HTML preview', 'Preview the HTML content of received email.'],
        ['Email verification tester', 'Test signup and email verification workflows.'],
        ['Email template tester', 'Preview and inspect transactional email templates.'],
        ['Mock SMTP', 'Capture outgoing application mail in a test environment.'],
        ['Email webhook forwarding', 'Turn received email into a webhook event.'],
    ],
    domains: [
        ['Temporary callback URL', 'Give a test integration a public callback address.'],
        ['Domain validation', 'Validate domain ownership and DNS configuration.'],
    ],
    monitoring: [
        ['Uptime monitor', 'Check whether your website is reachable.'],
        ['Endpoint health checks', 'Monitor the health of an HTTP endpoint.'],
        ['Public status page', 'Share uptime and incident updates with your users.'],
        ['Response-time monitor', 'Track latency and historical response times.'],
        ['Certificate expiry alerts', 'Keep an eye on expiring SSL certificates.'],
        ['DNS monitor', 'Watch for changes to important DNS records.'],
        ['Monitoring notifications', 'Get notified when a service needs attention.'],
        ['API monitor', 'Check the availability and behavior of an API.'],
    ],
    databases: [
        ['Temporary key-value store', 'Keep a little state behind a simple HTTP API.'],
        ['JSON data store', 'Store and retrieve structured data for a test.'],
        ['Test fixtures', 'Prepare reusable data for integration tests.'],
        ['Seed data generator', 'Create sample records for a development database.'],
        ['Agent state store', 'Give an automated workflow a small temporary data store.'],
    ],
    'test-media': [
        [
            'Placeholder images',
            'Create configurable illustrations, gradients and graphics as SVG or PNG.',
        ],
        ['Sample video', 'Get a predictable video fixture for testing.'],
        ['Silent video', 'Generate a video fixture without an audio track.'],
        ['Sample audio', 'Create an editable instrumental sample with melody, bass and drums.'],
        ['Audio composer', 'Arrange melody, bass, drums and pads into a custom instrumental.'],
        ['Music library', 'Stream full original CC0 instrumentals and download editable loops.'],
        ['Tone generator', 'Generate a simple audio tone.'],
        ['Sample PDF', 'Create a PDF fixture for upload and document tests.'],
        ['Dummy CSV', 'Generate rows of sample CSV data.'],
        ['JSON fixtures', 'Create structured JSON test payloads.'],
        ['XML fixtures', 'Create predictable XML test documents.'],
        ['ZIP generator', 'Build a sample archive for file handling tests.'],
        ['Binary payload generator', 'Generate a test payload with a chosen file size.'],
        ['Corrupt file fixtures', 'Test how your application handles malformed files.'],
        ['Streaming response simulator', 'Generate a controlled stream of response data.'],
        ['SSE generator', 'Produce server-sent events for a client test.'],
        ['Media stream fixtures', 'Test audio and video streaming behavior.'],
        [
            'Sample avatars',
            'Create consistent avatars with styles, palettes, shapes and variations.',
        ],
    ],
    everyday: [
        ['Image compressor', 'Make an image smaller without unnecessary uploads.'],
        ['Image resizer', 'Resize images to the dimensions you need.'],
        ['Image converter', 'Convert between common image formats.'],
        ['Image cropper', 'Keep the part of an image that matters.'],
        ['Image metadata', 'Inspect an image and its embedded metadata.'],
        ['EXIF remover', 'Remove embedded location and camera metadata.'],
        ['Color extractor', 'Find colors used in an image.'],
        ['Simple image editor', 'Make small edits to an image.'],
        ['Merge PDFs', 'Combine several PDF documents into one.'],
        ['Split PDF', 'Separate a PDF into smaller documents.'],
        ['Compress PDF', 'Reduce the size of a PDF.'],
        ['PDF to image', 'Turn PDF pages into images.'],
        ['Image to PDF', 'Combine images into a PDF document.'],
        ['Reorder PDF pages', 'Rearrange the pages in a PDF.'],
        ['Extract PDF text', 'Get readable text out of a PDF.'],
        ['Document converter', 'Convert between supported document formats.'],
        ['Video compressor', 'Reduce video file size.'],
        ['Video converter', 'Convert video between supported formats.'],
        ['Audio extractor', 'Save the audio track from a video.'],
        ['Audio converter', 'Convert an audio file to another format.'],
        ['Video trimmer', 'Keep the section of a video you need.'],
        ['GIF maker', 'Create a GIF from a short video.'],
        ['Audio trimmer', 'Trim an audio file down to the useful part.'],
        ['Media metadata', 'Inspect video and audio file details.'],
        ['Text formatter', 'Clean up the layout of a block of text.'],
        ['Text comparison', 'See the differences between two pieces of text.'],
        ['Case converter', 'Switch text between common capitalization styles.'],
        ['Markdown preview', 'See how your Markdown will look.'],
        ['CSV to JSON', 'Turn tabular CSV data into JSON.'],
        ['JSON to CSV', 'Turn a JSON array into a CSV file.'],
        ['Data format converter', 'Convert between JSON and YAML in your browser.'],
        ['Text cleaner', 'Remove unwanted whitespace and tidy copied text.'],
        ['QR code generator', 'Make a QR code for a link or a piece of text.'],
        ['Barcode generator', 'Create a barcode from supported input.'],
        ['Unit converter', 'Convert measurements between common units.'],
        ['Timestamp converter', 'Move between readable dates and timestamps.'],
        ['Password generator', 'Create a strong random password.'],
        ['Random generator', 'Generate random values for everyday tasks.'],
        ['File checksums', 'Calculate a checksum for a local file.'],
        ['Temporary notes', 'Share a short note with an expiration time.'],
    ],
    developer: [
        [
            'Credit card generator',
            'Create credit-card test fixtures using published Stripe sandbox numbers.',
        ],
        [
            'Debit card generator',
            'Create Visa and Mastercard debit-card fixtures for sandbox testing.',
        ],
        [
            'Prepaid card generator',
            'Create Mastercard prepaid fixtures for Stripe sandbox checkout tests.',
        ],
        ['Card number validator', 'Check the Luhn checksum of a test card number locally.'],
        ['YAML formatter', 'Format and validate YAML data.'],
        ['XML formatter', 'Make an XML document readable.'],
        ['Regex tester', 'Try a regular expression against sample text.'],
        ['JWT inspector', 'Decode a token and inspect its header and claims.'],
        ['URL parser', 'Inspect the components of a URL.'],
        ['ULID generator', 'Generate sortable unique identifiers.'],
        ['Cron expression helper', 'Build and understand a cron schedule.'],
        ['Unix timestamp converter', 'Convert Unix timestamps to readable dates.'],
        ['HMAC generator', 'Calculate keyed message authentication codes.'],
        ['HTTP request builder', 'Prepare a request with headers, parameters, and a body.'],
        ['cURL builder & parser', 'Create a cURL command or inspect an existing one.'],
        ['Code diff checker', 'Compare two versions of a code snippet.'],
        [
            'Environment variable formatter',
            'Clean up and convert environment variable definitions.',
        ],
        ['API response formatter', 'Make a captured API response easier to read.'],
        ['Code paste sharing', 'Share an expiring code snippet.'],
    ],
    automation: [
        ['Temporary scheduled jobs', 'Schedule a small task with an expiration.'],
        ['Delayed webhooks', 'Deliver a test webhook after a chosen delay.'],
        ['Temporary cron triggers', 'Trigger a URL on a temporary recurring schedule.'],
        ['HTTP polling', 'Poll an endpoint for a limited time.'],
    ],
};

const liveCategories: Record<string, Category['id']> = {
    webhooks: 'network',
    json: 'developer',
    base64: 'developer',
    url: 'everyday',
    uuid: 'developer',
    hash: 'developer',
};
export const fileToolIds = [
    'files-temporary-file-transfer',
    'files-one-time-download-links',
    'files-private-file-sharing',
    'files-temporary-json-storage',
    'files-temporary-binary-storage',
    'files-text-code-sharing',
    'everyday-temporary-notes',
    'developer-code-paste-sharing',
];
export const scheduledToolIds = [
    'automation-temporary-scheduled-jobs',
    'automation-delayed-webhooks',
    'automation-temporary-cron-triggers',
];
export const monitorToolIds = [
    'monitoring-uptime-monitor',
    'monitoring-endpoint-health-checks',
    'monitoring-response-time-monitor',
    'monitoring-certificate-expiry-alerts',
    'monitoring-monitoring-notifications',
    'monitoring-api-monitor',
    'monitoring-dns-monitor',
    'automation-http-polling',
];
export const memoryToolIds = [
    'databases-temporary-key-value-store',
    'databases-json-data-store',
    'databases-agent-state-store',
];
export const backendToolIds = [
    ...new Set([
        ...Object.keys(resourceOperations),
        ...fileToolIds,
        ...monitorToolIds,
        ...memoryToolIds,
        ...scheduledToolIds,
        'email-email-webhook-forwarding',
        'email-mock-smtp',
        'agents-agent-authenticator',
        'test-media-music-library',
        ...Object.keys(networkOperations),
        ...Object.keys(mediaOperations),
        'domains-temporary-callback-url',
        'network-fault-injection',
        'network-rate-limit-simulator',
        'test-media-streaming-response-simulator',
        'test-media-sse-generator',
        'agents-tool-failure-simulator',
        'mock-apis-mock-rest-api',
        'network-response-builder',
        'network-request-forwarding',
        'agents-mock-llm-endpoint',
        'agents-mock-agents-llms',
        'agents-llm-streaming-simulator',
        'monitoring-public-status-page',
        'agents-mock-mcp-server',
        'agents-socket-help-mcp',
        'email-temporary-email-inbox',
        'network-http-status-simulator',
        'network-delay-timeout-simulator',
    ]),
];
export const toolSlug = (tool: { name: string }) =>
    (tool.name === 'Agent email inbox' ? 'Temporary email inbox' : tool.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-$/, '');
export const toolPageHref = (tool: { name: string }) => `/tools/${toolSlug(tool)}/`;

export const catalog: CatalogTool[] = [
    ...tools.map((tool): CatalogTool => ({
        ...tool,
        categoryId: liveCategories[tool.id]!,
        status: 'available',
    })),
    ...categories.flatMap((category) =>
        planned[category.id].map(([name, description]): CatalogTool => {
            const id = `${category.id}-${toolSlug({ name })}`;
            const local = Object.hasOwn(browserOperations, id) && id !== 'test-media-music-library';
            const available = local || backendToolIds.includes(id);
            return {
                id,
                name,
                description,
                categoryId: category.id,
                icon: [
                    'test-media-music-library',
                    'test-media-audio-composer',
                    'test-media-sample-audio',
                    'test-media-tone-generator',
                ].includes(id)
                    ? 'music'
                    : category.icon,
                status: available ? 'available' : 'coming-soon',
                local,
                ...([
                    'email-mock-smtp',
                    'agents-agent-authenticator',
                    'email-temporary-email-inbox',
                    'email-email-webhook-forwarding',
                    'monitoring-public-status-page',
                    ...monitorToolIds,
                    ...memoryToolIds,
                    ...scheduledToolIds,
                ].includes(id)
                    ? { minimumPlan: 'free' as const }
                    : {}),
                ...(['network-request-forwarding', 'email-email-webhook-forwarding'].includes(id)
                    ? { minimumPlan: 'pro' as const }
                    : {}),
                ...(['domains-temporary-static-hosting', 'domains-html-sharing'].includes(id)
                    ? { minimumPlan: 'pro' as const }
                    : {}),
                ...(available ? { href: toolPageHref({ name }) } : {}),
            };
        }),
    ),
];

export const featuredIds = ['webhooks', 'mock-apis-mock-rest-api', 'agents-mock-mcp-server'];
export const categoryHref = (id: Category['id']) => `/catalog/${id}/`;
export function categoryTools(id: string): CatalogTool[] {
    return catalog.filter((tool) => id === 'all' || tool.categoryId === id);
}
export function categoryRoadmap(id: Category['id']): string[] {
    return roadmap[id];
}
export function searchTools(query: string, list = catalog): CatalogTool[] {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return list.filter((tool) =>
        words.every((word) =>
            `${tool.name} ${tool.description} ${tool.categoryId}`.toLowerCase().includes(word),
        ),
    );
}

export { tools } from './legacy-tools.js';

export interface ServerCapabilities {
    emailReceiving: boolean;
    smtpCapture: boolean;
    phones: boolean;
    authenticators?: boolean;
}
export function toolCapability(id: string): keyof ServerCapabilities | undefined {
    if (id === 'agents-agent-authenticator') return 'authenticators';
    if (id === 'email-mock-smtp') return 'smtpCapture';
    if (['email-temporary-email-inbox', 'email-email-webhook-forwarding'].includes(id))
        return 'emailReceiving';
    if (id.startsWith('phone-') || id.startsWith('phones-')) return 'phones';
    return undefined;
}
export function toolAvailability(tool: CatalogTool, capabilities: ServerCapabilities) {
    const capability = toolCapability(tool.id);
    return capability && !capabilities[capability]
        ? {
              ...tool,
              status: 'coming-soon' as const,
              availabilityReason: 'Not enabled on this server.',
              capability,
          }
        : { ...tool, capability };
}
