import {
    catalog,
    fileToolIds,
    memoryToolIds,
    monitorToolIds,
    scheduledToolIds,
    toolAvailability,
} from '@kivel.io/tools/catalog';
import type { ServerCapabilities } from '@kivel.io/tools/catalog';
import { executableIds, executionGuide } from './tool-routes.js';

export function catalogGuide(id: string, capabilities: ServerCapabilities) {
    const entry = catalog.find((tool) => tool.id === id);
    if (!entry) return undefined;
    const tool = toolAvailability(entry, capabilities);
    const base = {
        toolId: id,
        name: tool.name,
        description: tool.description,
        status: tool.status,
        ...('availabilityReason' in tool ? { availabilityReason: tool.availabilityReason } : {}),
    };
    if (executableIds.some((value) => value === id))
        return {
            ...base,
            mcpTool: 'run_tool',
            guide: executionGuide(id),
            http: `POST /api/tools/${id}/run`,
        };
    if (tool.status !== 'available') return base;
    if (id === 'mock-apis-mock-websocket-server')
        return {
            ...base,
            mcpTool: 'create_mock_api',
            relatedTools: ['inspect_mock_api', 'delete_mock_api', 'run_tool'],
            resourceRequest: {
                kind: 'mocks',
                action: 'create',
                config: { name: 'Live updates', routes: [], websocket: { echo: true } },
            },
            http: 'POST /api/mocks',
            next: 'Set routes to [] and provide websocket. Connect to endpointUrl, then inspect_mock_api. Use run_tool with network-websocket-tester to capture a public endpoint.',
        };
    if (id === 'agents-agent-authenticator')
        return {
            ...base,
            mcpTool: 'add_authenticator',
            relatedTools: ['get_totp_code', 'list_authenticators', 'delete_authenticator'],
            resourceRequest: { kind: 'authenticators', action: 'create' },
            http: 'POST /api/authenticators',
            next: 'Use only for accounts your human asked you to create or operate. Requires an approved workspace key.',
        };
    if (id === 'agents-kivel-mcp')
        return {
            ...base,
            http: 'POST /mcp',
            next: 'Use initialize, then tools/list to discover the platform tools.',
        };
    if (['network-request-forwarding', 'email-email-webhook-forwarding'].includes(id)) {
        const kind = id.startsWith('email-') ? 'email-inboxes' : 'inboxes';
        return {
            ...base,
            mcpTool: 'resource_request',
            resourceRequest: { kind, action: 'forward', id: 'your-inbox-id', config: {} },
            http: `PUT /api/${kind}/{id}/${kind === 'inboxes' ? 'forward' : 'forwarding'}`,
            next: 'Create an inbox first, then configure forwarding with resource_request. Requires Pro or Team.',
        };
    }
    let kind = 'mocks',
        mcpTool = 'create_mock_api';
    if (id === 'mock-apis-mock-oauth-provider') {
        kind = 'oauth-providers';
        mcpTool = 'create_oauth_provider';
    } else if (['webhooks', 'domains-temporary-callback-url'].includes(id)) {
        kind = 'inboxes';
        mcpTool = 'create_webhook_inbox';
    } else if (id === 'agents-mock-mcp-server') {
        kind = 'mcp-servers';
        mcpTool = 'resource_request';
    } else if (id === 'email-mock-smtp') {
        kind = 'smtp-inboxes';
        mcpTool = 'resource_request';
    } else if (id.startsWith('email-')) {
        kind = 'email-inboxes';
        mcpTool = 'create_email_inbox';
    } else if (fileToolIds.includes(id)) {
        kind = 'files';
        mcpTool = 'upload_temporary_file';
    } else if (memoryToolIds.includes(id))
        return {
            ...base,
            mcpTool: 'memory_set',
            relatedTools: ['memory_get', 'memory_list', 'memory_delete'],
            http: 'PUT /api/memory/{namespace}/{key}',
            next: 'Use an approved workspace key. Pass namespace, key and a JSON value.',
        };
    else if (monitorToolIds.includes(id))
        return {
            ...base,
            mcpTool: 'create_monitor',
            relatedTools: ['inspect_monitor', 'ping_monitor'],
            http: 'POST /api/monitors',
        };
    else if (scheduledToolIds.includes(id)) {
        kind = 'scheduled-jobs';
        mcpTool = 'resource_request';
    } else if (id === 'monitoring-public-status-page') {
        kind = 'status-pages';
        mcpTool = 'resource_request';
    }
    return {
        ...base,
        mcpTool,
        resourceRequest: { kind, action: 'create', config: {} },
        http: `POST /api/${kind}`,
        next:
            mcpTool === 'resource_request'
                ? `Use resource_request with kind ${kind}, action create and the documented config.`
                : `Use ${mcpTool}; its inputSchema is available through describe_tool or tools/list.`,
    };
}
