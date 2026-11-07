import type { DocPage } from './docs';

export const websocketDoc: DocPage = {
    slug: 'mock-websocket',
    title: 'Test a WebSocket client with a hosted mock',
    navTitle: 'Mock WebSocket server',
    group: 'Resources',
    description:
        'Create a temporary WebSocket mock with echo, scripted replies and close codes. Inspect its traffic and test public WebSocket connections from any interface.',
    updatedAt: '2026-11-04',
    sections: [
        {
            id: 'create',
            title: 'Create a mock and connect',
            paragraphs: [
                'Create a mock with empty HTTP routes and a websocket object. The response includes a WebSocket endpoint URL and management credentials. Mocks are private by default. Send the access token in the X-Access-Token handshake header. A browser on Kivel can also use its signed-in workspace session. For native browser clients on another site, explicitly enable public access and use synthetic data.',
                'The CLI accepts the same JSON through kivel mock create. With the TypeScript SDK, pass it to kivel.createMock(config). Agents can call create_mock_api with the same fields, or use resource_request with kind mocks and action create.',
            ],
            code: {
                title: 'Create a private mock over HTTP',
                value: `curl https://kivel.io/api/mocks \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Live updates","routes":[],"websocket":{"echo":true,"welcome":["ready"],"replies":[{"match":"ping","reply":"pong"}]}}'

# Save the returned credentials separately from the URL.
npx wscat -c "$ENDPOINT_URL" -H "X-Access-Token: $ACCESS_TOKEN"`,
            },
        },
        {
            id: 'behavior',
            title: 'Script replies and inspect traffic',
            paragraphs: [
                'Welcome messages are sent in order when a client connects. Replies match an exact text message. Unmatched text and binary messages echo by default. Set echo to false to ignore unmatched messages. Set delayMs to delay each scripted or echoed message by up to two seconds.',
                'Set closeAfter to an object with a code and optional reason to close after the first reply. For a welcome-only script with echo off, it closes after the welcome messages. Change the script with PUT /api/mocks/{id}; the new script applies to new connections.',
                'Use inspect_mock_api, kivel.mockCalls or GET /api/mocks/{id}/calls to read connection, message and close events. Use the workspace credential or the management token. Binary messages are recorded by size; text previews are retained. Standard mock expiry, sharing and quotas apply. Each connection lasts up to one minute, with up to 100 incoming frames and 16 KiB per message.',
            ],
        },
        {
            id: 'tester',
            title: 'Test a public WebSocket endpoint',
            paragraphs: [
                'Use the WebSocket tester to see the upgrade status, negotiated subprotocol, response messages and close code. The tester listens for up to three seconds or ten messages. Private addresses and redirects are blocked. Send one text or base64 test message from an approved workspace. A mock access token goes in the separate secret option and requires WSS.',
                'Agents use run_tool with toolId network-websocket-tester. HTTP clients send input and options to POST /api/tools/network-websocket-tester/run. The SDK uses kivel.run with the same tool ID and options.',
            ],
            code: {
                title: 'Capture messages with the CLI',
                value: `printf '%s' "$ENDPOINT_URL" | kivel run network-websocket-tester --options '{"body":"ping"}'`,
            },
        },
    ],
    related: [
        { title: 'Mock WebSocket server', href: '/tools/mock-websocket-server/' },
        { title: 'WebSocket tester', href: '/tools/websocket-tester/' },
        { title: 'HTTP API reference', href: '/docs/reference/' },
    ],
};
