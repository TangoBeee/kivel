export const roadmap = {
    network: [
        'Webhook capture and forwarding',
        'HTTP inspection and simulation',
        'DNS and TLS diagnostics',
    ],
    'mock-apis': [
        'REST and CRUD mock APIs',
        'OAuth and OpenID Connect test providers',
        'OpenAPI import and GraphQL mocks',
        'Signed test webhook events',
        'Reusable API test scenarios',
    ],
    agents: [
        'Mock MCP servers and tool-call history',
        'Scripted OpenAI and Anthropic text responses',
        'Paced and interrupted SSE streams',
        'Workspace memory and human approvals',
    ],
    files: [
        'Private and public file sharing',
        'One-time downloads',
        'Expiring text and JSON shares',
    ],
    email: [
        'Owned agent email addresses when configured',
        'Verification codes and links',
        'Guarded sending through the private relay when enabled',
        'Authenticated SMTP capture when configured',
        'Email webhook forwarding',
    ],
    domains: ['Temporary callback URLs'],
    monitoring: [
        'HTTP uptime and response-time checks',
        'Certificate expiry and DNS change alerts',
        'Cron heartbeat monitoring',
        'Selected-monitor status pages',
    ],
    databases: ['Workspace JSON memory', 'Namespaces and optional per-key expiry'],
    'test-media': [
        'Image, audio and video fixtures',
        'Original CC0 music',
        'Structured data and file fixtures',
        'Controlled HTTP and SSE streams',
    ],
    everyday: [
        'Image and PDF utilities',
        'Audio and video conversion',
        'Text and data converters',
        'Local generators and checksums',
    ],
    developer: [
        'Formatters and inspectors',
        'Sandbox payment fixtures',
        'HTTP and cURL builders',
        'Hash, HMAC and identifier utilities',
    ],
    automation: [
        'Delayed webhooks',
        'Bounded repeating triggers',
        'Delivery history and combined event waits',
        'HTTP monitoring',
    ],
};
