import type { Icon } from '@phosphor-icons/react';
import {
    BracketsCurly,
    DeviceMobile,
    EnvelopeSimple,
    LockKey,
    WebhooksLogo,
} from '@phosphor-icons/react';
import type { DashboardPanel } from '../../dashboard-shell';

/** One input of an MCP tool, as the agent sends it. */
export interface ToolInput {
    name: string;
    type: string;
    required?: boolean;
    description: string;
}

/** One callable MCP tool behind a Kivel tool. Names match backend/src/mcp.ts. */
export interface ToolEndpoint {
    id: string;
    label: string;
    summary: string;
    inputs: ToolInput[];
}

export type KivelToolId = 'email' | 'phone' | 'webhooks' | 'mocks' | 'totp';

export interface KivelTool {
    id: KivelToolId;
    name: string;
    description: string;
    icon: Icon;
    /** The tool's colour; used for the glyph only. */
    color: string;
    /** Its working page in the dashboard, when it has one. */
    panel?: DashboardPanel;
    /** The usage badge key in the workspace allowances. */
    usage?: DashboardPanel;
    note?: string;
    endpoints: ToolEndpoint[];
}

const id = (name: string, required = false, type = 'string', description = ''): ToolInput => ({
    name,
    type,
    required,
    description,
});

/**
 * The Kivel tools still offered (catalog-pivot-plan.md §2). Approvals, memory, monitors,
 * status pages, jobs, files, test payments and the vault are retired from the product.
 */
export const kivelTools: KivelTool[] = [
    {
        id: 'email',
        name: 'Email inboxes',
        description: 'Real inboxes. Codes and links pulled out for your agent.',
        icon: EnvelopeSimple,
        color: '#d6336c',
        panel: 'email',
        usage: 'email',
        endpoints: [
            {
                id: 'create_email_inbox',
                label: 'Create an inbox',
                summary: 'A real address your agent owns, for sign ups and codes.',
                inputs: [
                    id(
                        'localPart',
                        false,
                        'string',
                        'The part before the @, when your plan allows it',
                    ),
                    id('activeDays', false, 'integer', 'How long the inbox stays active'),
                ],
            },
            {
                id: 'wait_for_email',
                label: 'Wait for an email',
                summary: 'Blocks until a matching email arrives and returns codes and links.',
                inputs: [
                    id('id', true, 'string', 'Inbox id'),
                    id('from', false, 'string', 'Only match this sender'),
                    id('cursor', false, 'string', 'Continue after the last message you saw'),
                ],
            },
            {
                id: 'email_message',
                label: 'Read a message',
                summary: 'One message with its extracted code and links.',
                inputs: [
                    id('id', true, 'string', 'Inbox id'),
                    id('messageId', true, 'string', 'Message id'),
                ],
            },
            {
                id: 'send_email',
                label: 'Send an email',
                summary: 'Send from the inbox address.',
                inputs: [
                    id('id', true, 'string', 'Inbox id'),
                    id('to', true, 'list', 'Recipients'),
                    id('subject', true, 'string', 'Subject line'),
                    id('idempotencyKey', true, 'string', 'Makes retries safe'),
                    id('text', false, 'string', 'Plain text body'),
                ],
            },
        ],
    },
    {
        id: 'phone',
        name: 'Phone and SMS',
        description: 'Real numbers that receive texts and one time codes.',
        icon: DeviceMobile,
        color: '#0f766e',
        note: 'Paid add on',
        endpoints: [
            {
                id: 'create_phone_number',
                label: 'Get a number',
                summary: 'A US number from a paid phone slot.',
                inputs: [
                    id('number', true, 'string', 'The number to buy'),
                    id('idempotencyKey', true, 'string', 'Makes retries safe'),
                ],
            },
            {
                id: 'wait_for_sms',
                label: 'Wait for a text',
                summary: 'Waits up to 30 seconds and returns the code it found.',
                inputs: [
                    id('id', true, 'string', 'Number id'),
                    id('after', false, 'string', 'The last message id you saw'),
                ],
            },
            {
                id: 'list_sms',
                label: 'Read texts',
                summary: 'Received messages with their extracted codes.',
                inputs: [id('id', true, 'string', 'Number id')],
            },
        ],
    },
    {
        id: 'webhooks',
        name: 'Webhooks',
        description: 'Public URLs to catch, verify and replay requests.',
        icon: WebhooksLogo,
        color: '#2f6bff',
        panel: 'webhooks',
        usage: 'webhooks',
        endpoints: [
            {
                id: 'create_webhook_inbox',
                label: 'Create a webhook URL',
                summary: 'A public URL that records every request it gets.',
                inputs: [
                    id('visibility', false, 'string', 'Who can read the captured requests'),
                    id('ttlSeconds', false, 'number', 'How long the URL lives'),
                ],
            },
            {
                id: 'wait_for_webhook',
                label: 'Wait for a request',
                summary: 'Blocks until a request arrives, then returns it.',
                inputs: [
                    id('id', true, 'string', 'Webhook id'),
                    id('method', false, 'string', 'Only match this method'),
                    id('after', false, 'string', 'The last request id you saw'),
                ],
            },
            {
                id: 'set_webhook_response',
                label: 'Set the response',
                summary: 'Choose the status, body and headers senders get back.',
                inputs: [
                    id('id', true, 'string', 'Webhook id'),
                    id('status', false, 'number', 'Status code, 200 to 599'),
                    id('body', false, 'string', 'Response body'),
                ],
            },
            {
                id: 'inspect_webhook_inbox',
                label: 'Inspect requests',
                summary: 'Captured requests with headers and bodies.',
                inputs: [
                    id('id', true, 'string', 'Webhook id'),
                    id('limit', false, 'integer', 'How many'),
                ],
            },
        ],
    },
    {
        id: 'mocks',
        name: 'Mock APIs',
        description: 'REST, GraphQL, WebSocket and MCP stand ins.',
        icon: BracketsCurly,
        color: '#7c4ddb',
        panel: 'mocks',
        usage: 'mocks',
        endpoints: [
            {
                id: 'create_mock_api',
                label: 'Create a mock API',
                summary: 'Routes with responses, latency and failure cases.',
                inputs: [
                    id('name', true, 'string', 'A name for the mock'),
                    id('routes', true, 'list', 'Method, path and response for each route'),
                ],
            },
            {
                id: 'call_mock_api',
                label: 'Call a mock route',
                summary: 'Send a request to a hosted mock.',
                inputs: [
                    id('id', true, 'string', 'Mock id'),
                    id('method', true, 'string', 'HTTP method'),
                    id('path', true, 'string', 'Route path'),
                ],
            },
            {
                id: 'inspect_mock_api',
                label: 'Inspect calls',
                summary: 'The configuration, usage and recent calls.',
                inputs: [id('id', true, 'string', 'Mock id')],
            },
        ],
    },
    {
        id: 'totp',
        name: '2FA codes',
        description: 'Authenticator codes for accounts you let your agent use.',
        icon: LockKey,
        color: '#5b6472',
        panel: 'authenticators',
        usage: 'authenticators',
        endpoints: [
            {
                id: 'add_authenticator',
                label: 'Add an authenticator',
                summary: 'Store a TOTP secret for an account you authorised.',
                inputs: [
                    id('name', true, 'string', 'Account name'),
                    id('uri', false, 'string', 'The otpauth link from the QR code'),
                ],
            },
            {
                id: 'get_totp_code',
                label: 'Get a code',
                summary: 'The current six digit code.',
                inputs: [id('id', true, 'string', 'Authenticator id')],
            },
            {
                id: 'list_authenticators',
                label: 'List authenticators',
                summary: 'Every stored account, without secrets.',
                inputs: [],
            },
        ],
    },
];

/** The MCP call an agent makes, with required inputs as placeholders. */
export function mcpExample(endpoint: ToolEndpoint) {
    const args = endpoint.inputs
        .filter((input) => input.required)
        .map((input) => `"${input.name}": "…"`)
        .join(', ');
    return `${endpoint.id}({ ${args} })`;
}
