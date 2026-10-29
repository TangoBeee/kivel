import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isUuid } from './security.js';
import { API_VERSION } from './version.js';
import { validateInboxResponse } from './inboxes.js';
import type { InboxRepository } from './inboxes.js';
import type { ResourceRepository } from './resources.js';
import type { RateLimitRepository } from './rate-limit.js';
import { Access, resourceToken, HttpError } from './access.js';
import { executableIds, executionGuide, searchExecutable } from './tool-routes.js';
import type { ToolService } from './tool-routes.js';
import { validateMock, mockPayload } from '@socket-help/tools/mock-config';
import { checkMockProxy } from './resource-routes.js';
import { crudSchema } from '@socket-help/tools/mock-crud';
import { waitForRequests, waitSeconds, WAIT_MAX_SECONDS } from './waiting.js';
import type { Waiters } from './waiting.js';
import type { MockCallRepository } from './mock-calls.js';
import type { ActivityRepository } from './activity.js';

const versions = ['2025-11-25', '2025-06-18', '2025-03-26'];
const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const stringProperty = (description: string) => ({ type: 'string', description });
const schema = (
    properties: Record<string, unknown>,
    required: string[] = Object.keys(properties),
) => ({ type: 'object', properties, required, additionalProperties: false });
const access = {
    id: stringProperty('Resource UUID.'),
    token: stringProperty(
        'Management or inspection token for anonymous resources. Omit for resources owned by your authenticated workspace.',
    ),
};
const readonly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
const creates = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
const deletes = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
export const platformTools = [
    {
        name: 'call_mock_api',
        description:
            'Call a hosted mock route or mutate its CRUD records. Uses the same caller access, limits and revision checks as HTTP. Management tokens do not grant caller access.',
        inputSchema: schema(
            {
                id: stringProperty('Mock resource UUID.'),
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
                },
                path: stringProperty(
                    'Relative collection or route path, optionally with query parameters.',
                ),
                accessToken: stringProperty(
                    'Private caller access token, supplied separately from the URL.',
                ),
                body: { type: 'object', additionalProperties: true },
                revision: { type: 'number' },
            },
            ['id', 'method', 'path'],
        ),
        annotations: { ...deletes, idempotentHint: false },
    },
    {
        name: 'create_webhook_inbox',
        description:
            'Create a webhook receiver. It expires after one hour unless ttlSeconds is set (up to the plan maximum: 1 hour anonymously, 7 days on Free). Save the private inspection token, then use wait_for_webhook.',
        inputSchema: schema(
            {
                visibility: { type: 'string', enum: ['public', 'private'] },
                ttlSeconds: { type: 'number', description: 'Lifetime in seconds, from 60.' },
            },
            [],
        ),
        annotations: creates,
    },
    {
        name: 'inspect_webhook_inbox',
        description: 'Read a webhook inbox and captured requests using its private token.',
        inputSchema: schema(access, ['id']),
        annotations: readonly,
    },
    {
        name: 'wait_for_webhook',
        description: `Block until a webhook inbox receives a request, then return the new requests. Pass after (the last request ID you have seen) to wait for newer ones only. Returns timedOut: true after timeoutSeconds (default 25, max ${WAIT_MAX_SECONDS}); call again to keep waiting.`,
        inputSchema: schema(
            {
                ...access,
                after: stringProperty(
                    'Optional request ID; only requests captured after it are returned.',
                ),
                timeoutSeconds: {
                    type: 'number',
                    description: `1 to ${WAIT_MAX_SECONDS} seconds.`,
                },
            },
            ['id'],
        ),
        annotations: readonly,
    },
    {
        name: 'set_webhook_response',
        description:
            'Choose what a webhook inbox answers senders with: status (200-599), contentType (application/json, text/plain, application/xml or text/xml), body (up to 16 KiB), X- headers and delayMs (0-5000). Pass reset: true to restore the default JSON receipt.',
        inputSchema: schema(
            {
                ...access,
                status: { type: 'number' },
                contentType: {
                    type: 'string',
                    enum: ['application/json', 'text/plain', 'application/xml', 'text/xml'],
                },
                body: stringProperty('Response body.'),
                headers: { type: 'object', additionalProperties: { type: 'string' } },
                delayMs: { type: 'number' },
                reset: { type: 'boolean' },
            },
            ['id'],
        ),
        annotations: { ...creates, idempotentHint: true },
    },
    {
        name: 'delete_webhook_inbox',
        description: 'Permanently delete an inbox and its history.',
        inputSchema: schema(access, ['id']),
        annotations: deletes,
    },
    {
        name: 'create_email_inbox',
        description:
            'Create a receive-only email address (for example to sign up to a site under test). Lasts one hour unless ttlSeconds is set, up to the plan maximum. Save the managementToken, then call wait_for_email.',
        inputSchema: schema(
            {
                ttlSeconds: { type: 'number', description: 'Lifetime in seconds, from 60.' },
                persistent: { type: 'boolean' },
            },
            [],
        ),
        annotations: creates,
    },
    {
        name: 'wait_for_email',
        description: `Block until the email inbox receives a message, then return new messages with extracted one-time codes and links (verification links first). Pass after (the last message ID seen) to wait for newer ones. Returns timedOut: true after timeoutSeconds (default 25, max ${WAIT_MAX_SECONDS}); call again to keep waiting.`,
        inputSchema: schema(
            {
                ...access,
                after: stringProperty('Optional message ID; only newer messages are returned.'),
                timeoutSeconds: { type: 'number' },
            },
            ['id'],
        ),
        annotations: readonly,
    },
    {
        name: 'list_emails',
        description:
            'Read every message in an email inbox (up to 100): sender, subject, text, HTML, extracted codes and links, attachment names.',
        inputSchema: schema(access, ['id']),
        annotations: readonly,
    },
    {
        name: 'start_login',
        description:
            'Connect this agent to its human’s socket.help workspace (no API key needed). Returns a link and code for the human to approve in their browser, and a deviceCode for finish_login. Never ask the human to paste an API key into the chat.',
        inputSchema: schema(
            {
                name: stringProperty(
                    'How the human will recognise you, e.g. "Claude Code on MacBook".',
                ),
                client: stringProperty('Your client, e.g. "Claude Code".'),
            },
            [],
        ),
        annotations: creates,
    },
    {
        name: 'start_trial',
        description:
            'Only if no human is available right now: get a 72-hour trial key with anonymous limits (webhooks, mocks, files, email inboxes, tools) and a claim link for your human. Prefer start_login when a human can approve. Pass humanEmail to notify them.',
        inputSchema: schema(
            {
                name: stringProperty('How your human will recognise you.'),
                humanEmail: stringProperty('Optional address to tell your human about the trial.'),
            },
            [],
        ),
        annotations: creates,
    },
    {
        name: 'finish_login',
        description:
            'Wait (up to 25 seconds per call) for the human to approve the login from start_login. Returns status pending, denied, expired, or approved with the API key and MCP settings to save in your client config.',
        inputSchema: schema({ deviceCode: stringProperty('deviceCode from start_login.') }),
        annotations: readonly,
    },
    {
        name: 'ask_human',
        description:
            'Ask your human before a risky or irreversible step (deploying, paying, deleting, emailing real people). Emails the workspace owner a link; only they can answer, signed in. Returns an id and answerUrl (show it in chat too), then call wait_for_approval. Needs a connected agent.',
        inputSchema: schema(
            {
                question: stringProperty('One clear question, up to 500 characters.'),
                details: stringProperty('Optional context: what will happen, diff summary, cost.'),
                options: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 5,
                    items: { type: 'string' },
                    description: 'Answer choices; defaults to ["Approve", "Deny"].',
                },
                timeoutMinutes: { type: 'number' },
            },
            ['question'],
        ),
        annotations: creates,
    },
    {
        name: 'wait_for_approval',
        description: `Block until your human answers an ask_human request. Returns status answered (with answer and optional note), expired, or timedOut: true after timeoutSeconds (default 25, max ${WAIT_MAX_SECONDS}); call again to keep waiting. Do not proceed without an answer.`,
        inputSchema: schema(
            { id: stringProperty('id from ask_human.'), timeoutSeconds: { type: 'number' } },
            ['id'],
        ),
        annotations: readonly,
    },
    {
        name: 'create_monitor',
        description:
            'Watch something on a schedule and alert the workspace owner by email (and optionally a webhook) when it goes down or recovers. kind "http" checks a public URL (expectStatus, expectText), "ssl" warns before a certificate expires (sslDays), "heartbeat" returns a pingUrl your job calls when it finishes. Needs an API key; Free allows 20 monitors every 5 minutes or slower.',
        inputSchema: schema(
            {
                kind: { type: 'string', enum: ['http', 'ssl', 'heartbeat'] },
                name: stringProperty('Short label, up to 80 characters.'),
                target: stringProperty('URL or hostname for http and ssl.'),
                intervalSeconds: { type: 'number' },
                graceSeconds: { type: 'number' },
                expectStatus: { type: 'number' },
                expectText: stringProperty('Text the response must contain.'),
                sslDays: { type: 'number' },
                alertWebhook: stringProperty('Public URL that receives alert JSON.'),
            },
            ['kind', 'name'],
        ),
        annotations: creates,
    },
    {
        name: 'list_monitors',
        description: 'List the workspace’s monitors with their current status and last message.',
        inputSchema: schema({}),
        annotations: readonly,
    },
    {
        name: 'delete_monitor',
        description: 'Delete a monitor by ID.',
        inputSchema: schema({ id: stringProperty('Monitor UUID.') }),
        annotations: deletes,
    },
    {
        name: 'memory_set',
        description:
            'Remember a JSON value for later sessions, under a namespace and key (for example namespace "project-x", key "last-deploy"). Values up to 256 KiB; optional ttlSeconds. Needs an API key; space depends on the plan (5 MiB on Free).',
        inputSchema: schema(
            {
                namespace: stringProperty('1-64 characters: letters, digits, . : - _'),
                key: stringProperty('1-200 characters: letters, digits, . : / - _'),
                value: { description: 'Any JSON value.' },
                ttlSeconds: { type: 'number' },
            },
            ['namespace', 'key', 'value'],
        ),
        annotations: { ...creates, idempotentHint: true },
    },
    {
        name: 'memory_get',
        description: 'Read a remembered value by namespace and key.',
        inputSchema: schema({
            namespace: stringProperty('Namespace.'),
            key: stringProperty('Key.'),
        }),
        annotations: readonly,
    },
    {
        name: 'memory_list',
        description:
            'List keys (without values) in a namespace, optionally by prefix, and the space used.',
        inputSchema: schema(
            { namespace: stringProperty('Namespace.'), prefix: stringProperty('Key prefix.') },
            ['namespace'],
        ),
        annotations: readonly,
    },
    {
        name: 'memory_delete',
        description: 'Forget a remembered value.',
        inputSchema: schema({
            namespace: stringProperty('Namespace.'),
            key: stringProperty('Key.'),
        }),
        annotations: deletes,
    },
    {
        name: 'create_mock_api',
        description:
            'Create an expiring mock API with static or request-value response templates and optional request-field conditions. Up to 20 routes and 80 KiB total.',
        inputSchema: schema(
            {
                visibility: { type: 'string', enum: ['public', 'private'] },
                name: stringProperty('API name, up to 80 characters.'),
                crud: crudSchema,
                echo: {
                    type: 'boolean',
                    enum: [true],
                    description: 'Reflect requests; requires empty routes and no CRUD.',
                },
                routes: {
                    type: 'array',
                    minItems: 0,
                    maxItems: 20,
                    items: {
                        type: 'object',
                        required: ['method', 'path', 'status', 'body'],
                        properties: {
                            method: {
                                type: 'string',
                                enum: [
                                    'GET',
                                    'POST',
                                    'PUT',
                                    'PATCH',
                                    'DELETE',
                                    'HEAD',
                                    'OPTIONS',
                                    'ANY',
                                ],
                            },
                            path: stringProperty('Route path, for example /users/:id.'),
                            status: { type: 'integer', minimum: 200, maximum: 599 },
                            body: stringProperty(
                                'Response body; templates insert path, query or top-level JSON body values inside strings.',
                            ),
                            template: { type: 'boolean' },
                            condition: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['source', 'key', 'value'],
                                properties: {
                                    source: { type: 'string', enum: ['header', 'query', 'body'] },
                                    key: { type: 'string', maxLength: 80 },
                                    value: { type: 'string', maxLength: 512 },
                                },
                            },
                            requestsPerMinute: { type: 'integer', minimum: 1, maximum: 120 },
                            stream: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['mode', 'intervalMs'],
                                properties: {
                                    mode: { type: 'string', enum: ['sse', 'text'] },
                                    intervalMs: { type: 'integer', minimum: 10, maximum: 1000 },
                                },
                            },
                            headers: { type: 'object', additionalProperties: { type: 'string' } },
                            delayMs: { type: 'integer', minimum: 0, maximum: 2000 },
                        },
                    },
                },
            },
            ['name', 'routes'],
        ),
        annotations: creates,
    },
    {
        name: 'inspect_mock_api',
        description:
            'Read a mock API configuration, usage and its 20 most recent calls (method, path, status, body preview) with its private token.',
        inputSchema: schema(access, ['id']),
        annotations: readonly,
    },
    {
        name: 'delete_mock_api',
        description: 'Permanently delete a mock API.',
        inputSchema: schema(access, ['id']),
        annotations: deletes,
    },
    {
        name: 'upload_temporary_file',
        description:
            'Upload a file up to 64 KiB as base64. Files expire after one hour or 100 downloads. Use HTTP for larger files.',
        inputSchema: schema(
            {
                visibility: { type: 'string', enum: ['public', 'private'] },
                maxDownloads: {
                    type: 'number',
                    description: 'Set 1 for a one-time link. Maximum depends on plan.',
                },
                name: stringProperty('Filename without directory components.'),
                base64: stringProperty(
                    'Standard padded Base64 file contents, up to 64 KiB decoded.',
                ),
            },
            ['name', 'base64'],
        ),
        annotations: creates,
    },
    {
        name: 'inspect_temporary_file',
        description: 'Read file metadata and remaining downloads with its private token.',
        inputSchema: schema(access, ['id']),
        annotations: readonly,
    },
    {
        name: 'delete_temporary_file',
        description: 'Permanently delete an uploaded file.',
        inputSchema: schema(access, ['id']),
        annotations: deletes,
    },
    {
        name: 'download_temporary_file',
        description:
            'Download a file up to 64 KiB as base64. Private files need their access token or workspace access. This consumes one download; one-time files become unavailable afterward. Use HTTP for larger files.',
        inputSchema: schema(
            {
                id: stringProperty('File UUID.'),
                accessToken: stringProperty(
                    'Private sharing token, when required. This is separate from the management token.',
                ),
            },
            ['id'],
        ),
        annotations: { ...creates, destructiveHint: true },
    },
    {
        name: 'run_tool',
        description:
            'Run a supported utility, image/PDF/audio/video processor, email inspector or public network check. Call list_tools to discover supported IDs. Hosted plan quotas apply.',
        inputSchema: schema(
            {
                toolId: stringProperty('Executable tool ID.'),
                input: stringProperty('Text input.'),
                options: { type: 'object', additionalProperties: { type: 'string' } },
                file: {
                    type: 'object',
                    properties: { name: { type: 'string' }, base64: { type: 'string' } },
                    required: ['name', 'base64'],
                    additionalProperties: false,
                },
                files: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 20,
                    items: {
                        type: 'object',
                        properties: { name: { type: 'string' }, base64: { type: 'string' } },
                        required: ['name', 'base64'],
                        additionalProperties: false,
                    },
                },
            },
            ['toolId'],
        ),
        annotations: creates,
    },
    {
        name: 'ping_monitor',
        description:
            'Report success or failure for a heartbeat monitor. token is the secret last segment of its pingUrl, not its monitor UUID. Anyone holding this token can report a heartbeat; keep it private.',
        inputSchema: schema(
            {
                token: stringProperty('32-character token from pingUrl.'),
                failed: { type: 'boolean' },
            },
            ['token'],
        ),
        annotations: { ...creates, idempotentHint: true },
    },
    {
        name: 'inspect_monitor',
        description: 'Read one workspace monitor and its recent status events.',
        inputSchema: schema({ id: stringProperty('Monitor UUID.') }),
        annotations: readonly,
    },
    {
        name: 'pause_monitor',
        description: 'Pause or resume a workspace monitor without deleting it.',
        inputSchema: schema({ id: stringProperty('Monitor UUID.'), paused: { type: 'boolean' } }),
        annotations: deletes,
    },
    {
        name: 'workspace_status',
        description:
            'Read workspace agents, MCP activity, plan limits, usage, or human questions. This cannot approve agents, answer questions or manage billing.',
        inputSchema: schema({
            section: {
                type: 'string',
                enum: ['agents', 'activity', 'plans', 'usage', 'approvals'],
            },
        }),
        annotations: readonly,
    },
    {
        name: 'resource_request',
        description:
            'Manage webhook, email, mock API, file and mock MCP resources through HTTP lifecycle routes. Use calls for mock history; response or forward with config to configure a webhook (config.reset=true restores defaults); deliveries reads forwarding history. Email supports create, inspect, delete and renew; mail reading stays private.',
        inputSchema: schema(
            {
                kind: {
                    type: 'string',
                    enum: ['inboxes', 'mocks', 'files', 'mcp-servers', 'email-inboxes'],
                },
                action: {
                    type: 'string',
                    enum: [
                        'create',
                        'inspect',
                        'update',
                        'delete',
                        'renew',
                        'sharing',
                        'list',
                        'reset',
                        'calls',
                        'response',
                        'forward',
                        'deliveries',
                    ],
                },
                id: stringProperty('Resource UUID for existing resources.'),
                token: stringProperty('Anonymous resource token, when needed.'),
                config: { type: 'object', additionalProperties: true },
                ttlSeconds: { type: 'number' },
                persistent: { type: 'boolean' },
                visibility: { type: 'string', enum: ['public', 'private'] },
            },
            ['action'],
        ),
        annotations: deletes,
    },
    {
        name: 'describe_tool',
        description:
            'Read input examples, option names, choices, defaults, limits and usage steps for one executable tool.',
        inputSchema: schema({ toolId: stringProperty('Executable tool ID.') }),
        annotations: readonly,
    },
    {
        name: 'search_tools',
        description:
            'Find utility tools by keyword (for example "json format", "pdf merge", "dns"). Returns up to 25 matches with ID, name and description; then call describe_tool and run_tool.',
        inputSchema: schema(
            { query: stringProperty('Keywords; leave empty to list the first 25 tools.') },
            [],
        ),
        annotations: readonly,
    },
    {
        name: 'list_tools',
        description: 'List every executable utility tool ID. Prefer search_tools.',
        inputSchema: schema({}),
        annotations: readonly,
    },
] as const;
export interface MockTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description?: string }>;
        required: string[];
        additionalProperties: false;
    };
    response: string;
    isError: boolean;
    delayMs: number;
}
export function validateMcp(value: unknown): { name: string; tools: MockTool[] } {
    if (
        !object(value) ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 80 ||
        !Array.isArray(value.tools) ||
        !value.tools.length ||
        value.tools.length > 10
    )
        throw new Error('Provide a server name and 1–10 tools.');
    const names = new Set<string>();
    const tools = value.tools.map((item): MockTool => {
        if (
            !object(item) ||
            typeof item.name !== 'string' ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(item.name) ||
            names.has(item.name) ||
            typeof item.description !== 'string' ||
            item.description.length > 500 ||
            typeof item.response !== 'string' ||
            Buffer.byteLength(item.response) > 10000 ||
            (item.isError !== undefined && typeof item.isError !== 'boolean') ||
            !Number.isInteger(item.delayMs ?? 0) ||
            Number(item.delayMs ?? 0) < 0 ||
            Number(item.delayMs ?? 0) > 2000 ||
            !object(item.inputSchema) ||
            item.inputSchema.type !== 'object' ||
            !object(item.inputSchema.properties) ||
            Object.keys(item.inputSchema.properties).length > 20 ||
            !Array.isArray(item.inputSchema.required ?? [])
        )
            throw new Error(
                'Each tool needs a unique name, description, primitive object schema, and a response up to 10,000 bytes.',
            );
        names.add(item.name);
        const properties: MockTool['inputSchema']['properties'] = {};
        for (const [key, definition] of Object.entries(item.inputSchema.properties)) {
            if (
                !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
                !object(definition) ||
                !['string', 'number', 'integer', 'boolean'].includes(String(definition.type)) ||
                (definition.description !== undefined &&
                    (typeof definition.description !== 'string' ||
                        definition.description.length > 200))
            )
                throw new Error(
                    'Arguments support named string, number, integer, or boolean properties.',
                );
            Object.defineProperty(properties, key, {
                enumerable: true,
                value: {
                    type: String(definition.type),
                    ...(definition.description
                        ? { description: definition.description as string }
                        : {}),
                },
            });
        }
        const required = (item.inputSchema.required ?? []) as unknown[];
        if (
            !required.every((key) => typeof key === 'string' && Object.hasOwn(properties, key)) ||
            new Set(required).size !== required.length
        )
            throw new Error('Required arguments must name unique schema properties.');
        return {
            name: item.name,
            description: item.description,
            inputSchema: {
                type: 'object',
                properties,
                required: required as string[],
                additionalProperties: false,
            },
            response: item.response,
            isError: item.isError === true,
            delayMs: Number(item.delayMs ?? 0),
        };
    });
    const config = { name: value.name.trim(), tools };
    if (Buffer.byteLength(JSON.stringify(config)) > 80 * 1024)
        throw new Error('The complete server configuration must fit within 80 KiB.');
    return config;
}
const result = (value: unknown, isError = false) => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    isError,
});
class RpcError extends Error {
    constructor(
        public code: number,
        message: string,
    ) {
        super(message);
    }
}
function args(value: unknown) {
    if (!object(value)) throw new RpcError(-32602, 'Tool arguments must be an object.');
    return value;
}
function credentials(value: Record<string, unknown>) {
    if (
        typeof value.id !== 'string' ||
        (value.token !== undefined &&
            (typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token)))
    )
        throw new RpcError(-32602, 'Provide a resource ID and private token.');
    return { id: value.id, token: typeof value.token === 'string' ? value.token : '' };
}
function customArguments(tool: MockTool, value: Record<string, unknown>) {
    for (const key of tool.inputSchema.required)
        if (!Object.hasOwn(value, key)) throw new RpcError(-32602, `Missing argument: ${key}`);
    for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(tool.inputSchema.properties, key))
            throw new RpcError(-32602, `Unknown argument: ${key}`);
        const type = tool.inputSchema.properties[key]!.type;
        if (type === 'integer' ? !Number.isInteger(item) : typeof item !== type)
            throw new RpcError(-32602, `Invalid argument type: ${key}`);
    }
}
interface Context {
    app: FastifyInstance;
    inboxes: InboxRepository;
    resources: ResourceRepository;
    limits: RateLimitRepository;
    origin: string;
    access: Access;
    tools: ToolService;
    waiters: Waiters;
    mockCalls: MockCallRepository;
    activity: ActivityRepository;
}
export function registerMcp({
    app,
    inboxes,
    resources,
    limits,
    origin,
    access,
    tools,
    waiters,
    mockCalls,
    activity,
}: Context) {
    const uploads = new Set<FastifyRequest>();
    app.addHook('onResponse', async (request) => {
        uploads.delete(request);
    });
    app.addHook('onRequestAbort', async (request) => {
        uploads.delete(request);
    });
    async function callPlatform(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        if (['create_webhook_inbox', 'create_mock_api', 'upload_temporary_file'].includes(name)) {
            await access.rate(request, true);
        }
        const actor = await access.scope(
            request,
            name.startsWith('inspect_') ||
                name.startsWith('wait_for_') ||
                name === 'download_temporary_file'
                ? 'resources:read'
                : 'resources:write',
        );
        const ownerId = actor.identity?.account.id;
        switch (name) {
            case 'create_webhook_inbox': {
                const inbox = await inboxes.create(await access.allocation(request, value));
                return inbox
                    ? result({ ...inbox, webhookUrl: `${origin}/hooks/${inbox.id}` })
                    : result({ error: 'Inbox capacity reached.' }, true);
            }
            case 'inspect_webhook_inbox': {
                const { id, token } = credentials(value);
                const info = await inboxes.info(id, token, ownerId);
                return info
                    ? result({ ...info, requests: await inboxes.listRequests(id, token, ownerId) })
                    : result({ error: 'Inbox unavailable or access denied.' }, true);
            }
            case 'wait_for_webhook': {
                const { id, token } = credentials(value);
                const timeout = waitSeconds(value.timeoutSeconds);
                // Waiting holds no upload slot, so other MCP calls are not blocked meanwhile.
                uploads.delete(request);
                const abort = new AbortController();
                request.raw.once('close', () => abort.abort());
                const outcome = await waiters.run(actor.quotaKey, () =>
                    waitForRequests(
                        inboxes,
                        {
                            id,
                            token,
                            ...(ownerId ? { ownerId } : {}),
                            ...(typeof value.after === 'string' ? { after: value.after } : {}),
                        },
                        timeout * 1000,
                        abort.signal,
                    ),
                );
                if (outcome.status === 'gone')
                    return result({ error: 'Inbox unavailable or access denied.' }, true);
                return result(
                    outcome.status === 'ready'
                        ? { timedOut: false, requests: outcome.requests }
                        : { timedOut: true, requests: [] },
                );
            }
            case 'set_webhook_response': {
                const { id, token } = credentials(value);
                let response = null;
                if (value.reset !== true) {
                    const fields = Object.fromEntries(
                        ['status', 'contentType', 'body', 'headers', 'delayMs']
                            .filter((key) => value[key] !== undefined)
                            .map((key) => [key, value[key]]),
                    );
                    try {
                        response = validateInboxResponse(fields);
                    } catch (error) {
                        return result({ error: (error as Error).message }, true);
                    }
                }
                return (await inboxes.setResponse(id, token, response, ownerId))
                    ? result({ response: response ?? 'default' })
                    : result({ error: 'Inbox unavailable or access denied.' }, true);
            }
            case 'delete_webhook_inbox': {
                const { id, token } = credentials(value);
                return (await inboxes.delete(id, token, ownerId))
                    ? result({ deleted: true })
                    : result({ error: 'Inbox unavailable or access denied.' }, true);
            }
            case 'create_mock_api': {
                let config;
                try {
                    config = validateMock(value);
                } catch (error) {
                    return result({ error: (error as Error).message }, true);
                }
                checkMockProxy(config, actor, origin);
                const mock = await resources.create(
                    'mock',
                    mockPayload(config),
                    undefined,
                    await access.allocation(request, value),
                );
                return mock
                    ? result({ ...mock, endpointUrl: `${origin}/mock/${mock.id}` })
                    : result({ error: 'Resource capacity reached.' }, true);
            }
            case 'inspect_mock_api':
            case 'inspect_temporary_file': {
                const { id, token } = credentials(value);
                const kind = name === 'inspect_mock_api' ? 'mock' : 'file';
                const item = await resources.read(id, kind, token, ownerId);
                return item
                    ? result({
                          id,
                          ...item.payload,
                          visibility: item.visibility,
                          accessVersion: item.accessVersion,
                          expiresAt: item.expiresAt,
                          uses: item.uses,
                          ...(kind === 'mock'
                              ? {
                                    endpointUrl: `${origin}/mock/${id}`,
                                    recentCalls: (await mockCalls.list(id)).slice(-20),
                                }
                              : {
                                    downloadUrl: `${origin}/files/${id}`,
                                    remainingDownloads: Math.max(
                                        0,
                                        (item.maxUses ?? 100) - item.uses,
                                    ),
                                }),
                      })
                    : result({ error: 'Resource unavailable or access denied.' }, true);
            }
            case 'delete_mock_api':
            case 'delete_temporary_file': {
                const { id, token } = credentials(value);
                return (await resources.delete(
                    id,
                    name === 'delete_mock_api' ? 'mock' : 'file',
                    token,
                    ownerId,
                ))
                    ? result({ deleted: true })
                    : result({ error: 'Resource unavailable or access denied.' }, true);
            }
            case 'download_temporary_file': {
                const credential = await access.publicCredential(request);
                if (value.accessToken !== undefined) {
                    if (
                        typeof value.accessToken !== 'string' ||
                        !/^[A-Za-z0-9_-]{43}$/.test(value.accessToken)
                    )
                        throw new RpcError(-32602, 'Provide a valid private sharing token.');
                    credential.token = value.accessToken;
                }
                const info = await resources.peek(String(value.id), 'file', credential);
                if (!info) return result({ error: 'File unavailable or access denied.' }, true);
                if (!Number.isInteger(info.payload.size) || Number(info.payload.size) > 65536)
                    return result(
                        {
                            error: 'Use HTTP to download files larger than 64 KiB. This request did not consume a download.',
                        },
                        true,
                    );
                const file = await resources.use(String(value.id), 'file', undefined, credential);
                return file
                    ? result({
                          id: file.id,
                          name: file.payload.name,
                          size: file.data.length,
                          base64: file.data.toString('base64'),
                      })
                    : result({ error: 'File unavailable or access denied.' }, true);
            }
            case 'upload_temporary_file': {
                if (
                    typeof value.name !== 'string' ||
                    !value.name ||
                    value.name.length > 150 ||
                    /[\\/\x00-\x1f\x7f]/.test(value.name) ||
                    typeof value.base64 !== 'string' ||
                    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                        value.base64,
                    )
                )
                    throw new RpcError(-32602, 'Provide a filename and valid padded base64.');
                const data = Buffer.from(value.base64, 'base64');
                if (!data.length || data.length > 65536 || data.toString('base64') !== value.base64)
                    throw new RpcError(
                        -32602,
                        'Files must contain 1–65536 bytes in canonical base64.',
                    );
                const file = await resources.create(
                    'file',
                    { name: value.name, size: data.length },
                    data,
                    await access.allocation(request, value),
                );
                return file
                    ? result({
                          ...file,
                          downloadUrl: `${origin}/files/${file.id}`,
                          name: value.name,
                          size: data.length,
                          remainingDownloads: (await access.allocation(request, value)).maxUses,
                      })
                    : result({ error: 'Resource capacity reached.' }, true);
            }
            default:
                throw new RpcError(-32602, 'Unknown tool.');
        }
    }
    async function callMock(value: Record<string, unknown>, request: FastifyRequest) {
        if (
            typeof value.id !== 'string' ||
            !/^[a-f0-9-]{36}$/i.test(value.id) ||
            typeof value.path !== 'string' ||
            !/^\/[a-zA-Z0-9_/?=&%.,:-]*$/.test(value.path) ||
            value.path.includes('..') ||
            /%2f|%5c|%2e/i.test(value.path) ||
            !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
                String(value.method),
            )
        )
            throw new RpcError(
                -32602,
                'Provide a resource UUID, HTTP method and relative mock path.',
            );
        if (
            value.revision !== undefined &&
            (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)
        )
            throw new RpcError(-32602, 'Revision must be a nonnegative safe integer.');
        const headers: Record<string, string> = {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        if (typeof value.accessToken === 'string') headers['x-access-token'] = value.accessToken;
        if (value.revision !== undefined) headers['x-mock-if-revision'] = String(value.revision);
        if (value.body !== undefined && !object(value.body))
            throw new RpcError(-32602, 'Body must be a JSON object.');
        const response = await app.inject({
            method: value.method as
                'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
            url: `/mock/${value.id}${value.path}`,
            headers,
            remoteAddress: request.ip,
            ...(value.body !== undefined ? { payload: value.body as Record<string, unknown> } : {}),
        });
        let body: unknown = response.body;
        try {
            body = JSON.parse(response.body);
        } catch {}
        return result(
            {
                status: response.statusCode,
                ...(response.headers['x-mock-revision'] !== undefined
                    ? { revision: Number(response.headers['x-mock-revision']) }
                    : {}),
                body,
            },
            response.statusCode >= 400,
        );
    }
    // Email tools reuse the HTTP routes so quotas, scopes and errors stay identical.
    async function emailRequest(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        const headers: Record<string, string> = {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        let url: string;
        if (name === 'create_email_inbox') {
            const query = new URLSearchParams();
            for (const key of ['ttlSeconds', 'persistent'])
                if (value[key] !== undefined) query.set(key, String(value[key]));
            url = `/api/email-inboxes${query.size ? `?${query}` : ''}`;
        } else {
            const { id, token } = credentials(value);
            if (!isUuid(id)) throw new RpcError(-32602, 'Provide an email inbox UUID.');
            headers['x-resource-token'] = token;
            const query = new URLSearchParams();
            if (typeof value.after === 'string') query.set('after', value.after);
            if (value.timeoutSeconds !== undefined)
                query.set('timeoutSeconds', String(value.timeoutSeconds));
            url = `/api/email-inboxes/${id}/${name === 'wait_for_email' ? 'wait' : 'messages'}${query.size ? `?${query}` : ''}`;
            // Waiting holds no MCP upload slot, so other calls are not blocked meanwhile.
            if (name === 'wait_for_email') uploads.delete(request);
        }
        const response = await app.inject({
            method: name === 'create_email_inbox' ? 'POST' : 'GET',
            url,
            headers,
            remoteAddress: request.ip,
        });
        return result(response.json(), response.statusCode >= 400);
    }
    // Memory tools reuse the HTTP routes so plan limits and errors stay identical.
    async function memoryRequest(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        const headers: Record<string, string> =
            name === 'memory_set' ? { 'content-type': 'application/json' } : {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        const namespace = encodeURIComponent(String(value.namespace ?? ''));
        const key = String(value.key ?? '')
            .split('/')
            .map(encodeURIComponent)
            .join('/');
        const response = await app.inject({
            method: name === 'memory_set' ? 'PUT' : name === 'memory_delete' ? 'DELETE' : 'GET',
            url:
                name === 'memory_list'
                    ? `/api/memory/${namespace}?prefix=${encodeURIComponent(String(value.prefix ?? ''))}`
                    : `/api/memory/${namespace}/${key}`,
            headers,
            remoteAddress: request.ip,
            ...(name === 'memory_set'
                ? {
                      payload: {
                          value: value.value,
                          ...(value.ttlSeconds !== undefined
                              ? { ttlSeconds: value.ttlSeconds }
                              : {}),
                      },
                  }
                : {}),
        });
        return result(
            response.statusCode === 204 ? { deleted: true } : response.json(),
            response.statusCode >= 400,
        );
    }
    // Login tools reuse the device-login routes; finish_login polls briefly so agents wait less.
    async function loginRequest(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        if (name === 'start_login' || name === 'start_trial') {
            const response = await app.inject({
                method: 'POST',
                url: name === 'start_trial' ? '/api/agents/trial' : '/api/agents/login',
                headers: { 'content-type': 'application/json' },
                remoteAddress: request.ip,
                payload: { name: value.name, client: value.client, humanEmail: value.humanEmail },
            });
            return result(response.json(), response.statusCode >= 400);
        }
        uploads.delete(request);
        const deadline = Date.now() + 25000;
        for (;;) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/agents/token',
                headers: { 'content-type': 'application/json' },
                remoteAddress: request.ip,
                payload: { deviceCode: value.deviceCode },
            });
            if (response.statusCode !== 202 || Date.now() + 3000 > deadline)
                return result(
                    response.json(),
                    response.statusCode >= 400 && response.statusCode !== 202,
                );
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
    // Approval tools reuse the HTTP routes; answering is left to the human's signed-in browser.
    async function approvalRequest(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        const headers: Record<string, string> =
            name === 'ask_human' ? { 'content-type': 'application/json' } : {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        if (name === 'wait_for_approval') {
            uploads.delete(request);
            if (!isUuid(String(value.id))) throw new RpcError(-32602, 'Provide an approval UUID.');
            uploads.delete(request);
        }
        const response = await app.inject({
            method: name === 'ask_human' ? 'POST' : 'GET',
            url:
                name === 'ask_human'
                    ? '/api/approvals'
                    : `/api/approvals/${value.id}/wait${value.timeoutSeconds !== undefined ? `?timeoutSeconds=${Number(value.timeoutSeconds)}` : ''}`,
            headers,
            remoteAddress: request.ip,
            ...(name === 'ask_human' ? { payload: value } : {}),
        });
        return result(response.json(), response.statusCode >= 400);
    }
    // Monitor tools reuse the HTTP routes so plan limits and validation stay identical.
    async function monitorRequest(
        name: string,
        value: Record<string, unknown>,
        request: FastifyRequest,
    ) {
        const headers: Record<string, string> = ['create_monitor', 'pause_monitor'].includes(name)
            ? { 'content-type': 'application/json' }
            : {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        if (
            ['delete_monitor', 'inspect_monitor', 'pause_monitor'].includes(name) &&
            !isUuid(String(value.id))
        )
            throw new RpcError(-32602, 'Provide a monitor UUID.');
        if (name === 'ping_monitor' && !/^[A-Za-z0-9_-]{32}$/.test(String(value.token)))
            throw new RpcError(-32602, 'Provide the 32-character token from pingUrl.');
        const response = await app.inject({
            method:
                name === 'create_monitor' || name === 'ping_monitor'
                    ? 'POST'
                    : name === 'delete_monitor'
                      ? 'DELETE'
                      : name === 'pause_monitor'
                        ? 'PATCH'
                        : 'GET',
            url:
                name === 'ping_monitor'
                    ? `/ping/${value.token}${value.failed === true ? '/fail' : ''}`
                    : ['delete_monitor', 'inspect_monitor', 'pause_monitor'].includes(name)
                      ? `/api/monitors/${value.id}`
                      : '/api/monitors',
            headers,
            remoteAddress: request.ip,
            ...(name === 'create_monitor'
                ? { payload: value }
                : name === 'pause_monitor'
                  ? { payload: { paused: value.paused } }
                  : {}),
        });
        return result(
            response.statusCode === 204 ? { deleted: true } : response.json(),
            response.statusCode >= 400,
        );
    }
    async function workspaceStatus(value: Record<string, unknown>, request: FastifyRequest) {
        const paths: Record<string, string> = {
            agents: '/api/agents',
            activity: '/api/account/activity',
            plans: '/api/plans',
            usage: '/api/usage',
            approvals: '/api/approvals',
        };
        const path = paths[String(value.section)];
        if (!Object.hasOwn(paths, String(value.section)) || !path)
            throw new RpcError(-32602, 'Choose agents, activity, plans, usage or approvals.');
        const headers: Record<string, string> = {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        const response = await app.inject({
            method: 'GET',
            url: path,
            headers,
            remoteAddress: request.ip,
        });
        return result(response.json(), response.statusCode >= 400);
    }
    async function resourceRequest(value: Record<string, unknown>, request: FastifyRequest) {
        const kind = String(value.kind ?? ''),
            action = String(value.action ?? '');
        if (
            ![
                'create',
                'inspect',
                'update',
                'delete',
                'renew',
                'sharing',
                'list',
                'reset',
                'calls',
                'response',
                'forward',
                'deliveries',
            ].includes(action) ||
            (action !== 'list' &&
                !['inboxes', 'mocks', 'files', 'mcp-servers', 'email-inboxes'].includes(kind))
        )
            throw new RpcError(-32602, 'Choose a resource kind and action.');
        if (
            (['calls', 'reset'].includes(action) && kind !== 'mocks') ||
            (['response', 'forward', 'deliveries'].includes(action) && kind !== 'inboxes') ||
            (action === 'update' && kind !== 'mocks') ||
            (action === 'sharing' && kind === 'email-inboxes')
        )
            throw new RpcError(-32602, 'This resource does not support that action.');
        if (action === 'create' && kind === 'files')
            throw new RpcError(-32602, 'Use upload_temporary_file for file creation.');
        if (
            !['create', 'list'].includes(action) &&
            (typeof value.id !== 'string' ||
                !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id))
        )
            throw new RpcError(-32602, 'Provide a resource UUID.');
        const query = new URLSearchParams();
        for (const key of ['ttlSeconds', 'persistent', 'visibility'])
            if (value[key] !== undefined) query.set(key, String(value[key]));
        const suffix = [
            'sharing',
            'renew',
            'reset',
            'calls',
            'response',
            'forward',
            'deliveries',
        ].includes(action)
            ? `/${action}`
            : action === 'inspect' && kind === 'inboxes'
              ? '/requests'
              : '';
        const path =
            action === 'list'
                ? '/api/account/resources'
                : `/api/${kind}${action === 'create' ? '' : `/${value.id}`}${suffix}${query.size ? `?${query}` : ''}`;
        const headers: Record<string, string> = {};
        for (const key of ['authorization', 'cookie', 'origin'])
            if (typeof request.headers[key] === 'string') headers[key] = request.headers[key];
        if (typeof value.token === 'string') headers['x-resource-token'] = value.token;
        const resetSetting =
            ['response', 'forward'].includes(action) &&
            object(value.config) &&
            value.config.reset === true;
        const method =
            action === 'delete' || resetSetting
                ? 'DELETE'
                : ['update', 'response', 'forward'].includes(action)
                  ? 'PUT'
                  : ['create', 'renew', 'sharing', 'reset'].includes(action)
                    ? 'POST'
                    : 'GET';
        // A JSON content type without a body is rejected, so only writes declare one.
        if (['POST', 'PUT'].includes(method)) headers['content-type'] = 'application/json';
        const response = await app.inject({
            method,
            url: path,
            headers,
            remoteAddress: request.ip,
            ...(['POST', 'PUT'].includes(method)
                ? {
                      payload:
                          action === 'sharing'
                              ? { visibility: value.visibility }
                              : action === 'renew'
                                ? { persistent: value.persistent ?? false }
                                : (value.config ?? {}),
                  }
                : {}),
        });
        return result(
            response.statusCode === 204 ? { completed: true } : response.json(),
            response.statusCode >= 400,
        );
    }
    async function transport(request: FastifyRequest, reply: FastifyReply, customId?: string) {
        if (request.headers.origin && request.headers.origin !== origin)
            return reply.code(403).send({ error: 'Origin not allowed.' });
        if (request.method !== 'POST')
            return reply.header('Allow', 'POST').code(405).send({
                error: 'Use Streamable HTTP POST. SSE streams and transport sessions are not provided.',
            });
        const accept = request.headers.accept ?? '';
        if (!accept.includes('application/json') || !accept.includes('text/event-stream'))
            return reply
                .code(406)
                .send({ error: 'Accept must include application/json and text/event-stream.' });
        const version = request.headers['mcp-protocol-version'];
        if (version && (typeof version !== 'string' || !versions.includes(version)))
            return reply.code(400).send({ error: 'Unsupported MCP protocol version.' });
        const body = request.body;
        if (
            !object(body) ||
            body.jsonrpc !== '2.0' ||
            typeof body.method !== 'string' ||
            (body.id !== undefined &&
                typeof body.id !== 'string' &&
                !(typeof body.id === 'number' && Number.isSafeInteger(body.id)))
        )
            return reply.code(400).send({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32600, message: 'Invalid JSON-RPC request.' },
            });
        let config: { name: string; tools: MockTool[] } | undefined;
        if (customId) {
            if (!isUuid(customId))
                return reply.code(404).send({ error: 'MCP server unavailable or expired.' });
            const retry = await limits.consume(`mcp:${customId}`, 120);
            if (retry)
                return reply
                    .header('Retry-After', retry)
                    .code(429)
                    .send({ error: 'MCP server request limit exceeded.' });
            const server = await resources.use(
                customId,
                'mcp',
                undefined,
                await access.publicCredential(request),
            );
            if (!server)
                return reply.code(404).send({ error: 'MCP server unavailable or expired.' });
            config = server.payload as unknown as typeof config;
        }
        if (body.id === undefined) return reply.code(202).send();
        const started = Date.now();
        let calledTool: string | undefined;
        // Workspace activity: which tool an agent called and whether it worked, never its data.
        const log = (ok: boolean) => {
            if (!calledTool) return;
            const tool = calledTool;
            void access
                .actor(request)
                .then((actor) =>
                    actor.identity
                        ? activity.record(actor.identity.account.id, {
                              at: new Date().toISOString(),
                              tool,
                              ok,
                              durationMs: Date.now() - started,
                              ...(actor.identity.keyId ? { keyId: actor.identity.keyId } : {}),
                          })
                        : undefined,
                )
                .catch((error) => request.log.warn({ err: error }, 'Unable to record activity.'));
        };
        try {
            const params = body.params === undefined ? {} : args(body.params);
            if (!config && body.method === 'tools/call' && typeof params.name === 'string')
                calledTool = params.name.slice(0, 64);
            let response: unknown;
            switch (body.method) {
                case 'initialize': {
                    if (
                        typeof params.protocolVersion !== 'string' ||
                        !object(params.capabilities) ||
                        !object(params.clientInfo) ||
                        typeof params.clientInfo.name !== 'string' ||
                        typeof params.clientInfo.version !== 'string'
                    )
                        throw new RpcError(
                            -32602,
                            'Provide protocolVersion, capabilities, and clientInfo.',
                        );
                    response = {
                        protocolVersion: versions.includes(params.protocolVersion)
                            ? params.protocolVersion
                            : versions[0],
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: config?.name ?? 'socket.help', version: API_VERSION },
                        instructions: config
                            ? 'A temporary mock MCP server. Tools return configured static responses.'
                            : 'Temporary resources expire after one hour. Keep returned management and inspection tokens private.',
                    };
                    break;
                }
                case 'ping':
                    response = {};
                    break;
                case 'tools/list':
                    response = {
                        tools: config
                            ? config.tools.map(
                                  ({ response: _, isError: __, delayMs: ___, ...tool }) => ({
                                      ...tool,
                                      annotations: readonly,
                                  }),
                              )
                            : platformTools,
                    };
                    break;
                case 'tools/call': {
                    if (typeof params.name !== 'string')
                        throw new RpcError(-32602, 'Provide the tool name.');
                    const values = params.arguments === undefined ? {} : args(params.arguments);
                    if (config) {
                        const tool = config.tools.find((tool) => tool.name === params.name);
                        if (!tool) throw new RpcError(-32602, 'Unknown tool.');
                        customArguments(tool, values);
                        if (tool.delayMs)
                            await new Promise((resolve) => setTimeout(resolve, tool.delayMs));
                        response = result(tool.response, tool.isError);
                    } else {
                        const definition = platformTools.find((tool) => tool.name === params.name);
                        if (!definition) throw new RpcError(-32602, 'Unknown tool.');
                        const properties = definition.inputSchema.properties as Record<
                            string,
                            { type?: string }
                        >;
                        for (const key of definition.inputSchema.required)
                            if (!Object.hasOwn(values, key))
                                throw new RpcError(-32602, `Missing argument: ${key}`);
                        for (const [key, value] of Object.entries(values)) {
                            if (!Object.hasOwn(properties, key))
                                throw new RpcError(-32602, `Unknown argument: ${key}`);
                            // Untyped properties (such as memory values) accept any JSON value.
                            const expected = properties[key]!.type;
                            if (
                                expected !== undefined &&
                                (expected === 'array'
                                    ? !Array.isArray(value)
                                    : typeof value !== expected)
                            )
                                throw new RpcError(-32602, `Invalid argument type: ${key}`);
                        }
                        if (
                            params.name === 'describe_tool' &&
                            !executableIds.some((id) => id === values.toolId)
                        )
                            throw new RpcError(-32602, 'Choose an executable tool ID.');
                        response =
                            params.name === 'call_mock_api'
                                ? await callMock(values, request)
                                : params.name === 'workspace_status'
                                  ? await workspaceStatus(values, request)
                                  : params.name === 'resource_request'
                                    ? await resourceRequest(values, request)
                                    : ['start_login', 'start_trial', 'finish_login'].includes(
                                            params.name,
                                        )
                                      ? await loginRequest(params.name, values, request)
                                      : ['ask_human', 'wait_for_approval'].includes(params.name)
                                        ? await approvalRequest(params.name, values, request)
                                        : [
                                                'create_monitor',
                                                'list_monitors',
                                                'ping_monitor',
                                                'inspect_monitor',
                                                'pause_monitor',
                                                'delete_monitor',
                                            ].includes(params.name)
                                          ? await monitorRequest(params.name, values, request)
                                          : params.name.startsWith('memory_')
                                            ? await memoryRequest(params.name, values, request)
                                            : [
                                                    'create_email_inbox',
                                                    'wait_for_email',
                                                    'list_emails',
                                                ].includes(params.name)
                                              ? await emailRequest(params.name, values, request)
                                              : params.name === 'describe_tool'
                                                ? result({
                                                      toolId: values.toolId,
                                                      guide:
                                                          executionGuide(String(values.toolId)) ??
                                                          null,
                                                  })
                                                : params.name === 'search_tools'
                                                  ? result({
                                                        tools: searchExecutable(
                                                            typeof values.query === 'string'
                                                                ? values.query
                                                                : '',
                                                        ),
                                                    })
                                                  : params.name === 'list_tools'
                                                    ? result({ tools: executableIds })
                                                    : params.name === 'run_tool'
                                                      ? result(
                                                            await tools.run(
                                                                request,
                                                                String(values.toolId),
                                                                {
                                                                    input: values.input ?? '',
                                                                    options: values.options ?? {},
                                                                    ...(values.files || values.file
                                                                        ? {
                                                                              file:
                                                                                  values.files ??
                                                                                  values.file,
                                                                          }
                                                                        : {}),
                                                                },
                                                            ),
                                                        )
                                                      : await callPlatform(
                                                            params.name,
                                                            values,
                                                            request,
                                                        );
                    }
                    break;
                }
                default:
                    throw new RpcError(-32601, 'Method not found.');
            }
            log(!(response as { isError?: boolean } | undefined)?.isError);
            return reply.send({ jsonrpc: '2.0', id: body.id, result: response });
        } catch (error) {
            log(false);
            if (error instanceof HttpError)
                return reply.send({
                    jsonrpc: '2.0',
                    id: body.id,
                    result: result({ error: error.message, status: error.statusCode }, true),
                });
            if (!(error instanceof RpcError)) throw error;
            return reply.send({
                jsonrpc: '2.0',
                id: body.id,
                error: { code: error.code, message: error.message },
            });
        }
    }
    const originCheck = async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.headers.origin && request.headers.origin !== origin)
            return reply.code(403).send({ error: 'Origin not allowed.' });
        if (request.routeOptions.url === '/mcp' && request.method === 'POST') {
            if (uploads.size >= 4)
                return reply
                    .header('Retry-After', '2')
                    .code(503)
                    .send({ error: 'MCP requests are busy. Try again shortly.' });
            uploads.add(request);
        }
    };
    app.route({
        method: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'HEAD', 'OPTIONS'],
        url: '/mcp',
        bodyLimit: 16 * 1024 * 1024,
        onRequest: originCheck,
        handler: (request, reply) => transport(request, reply),
    });
    app.route<{ Params: { id: string } }>({
        method: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'HEAD', 'OPTIONS'],
        url: '/mcp/mock/:id',
        onRequest: originCheck,
        handler: (request, reply) => transport(request, reply, request.params.id),
    });
    const createLimit = async (request: FastifyRequest, reply: FastifyReply) => {
        await access.rate(request, true);
    };
    app.post('/api/mcp-servers', { onRequest: createLimit }, async (request, reply) => {
        let config;
        try {
            config = validateMcp(request.body);
        } catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
        const server = await resources.create(
            'mcp',
            { ...config },
            undefined,
            await access.allocation(request),
        );
        return server
            ? reply.code(201).send({ ...server, endpointUrl: `${origin}/mcp/mock/${server.id}` })
            : reply.code(503).send({ error: 'Resource capacity reached.' });
    });
    for (const method of ['GET', 'PUT', 'DELETE'] as const)
        app.route<{ Params: { id: string } }>({
            method,
            url: '/api/mcp-servers/:id',
            handler: async (request, reply) => {
                const token = resourceToken(request);
                const ownerId = (await access.actor(request)).identity?.account.id;
                const server = await resources.read(request.params.id, 'mcp', token, ownerId);
                if (!server)
                    return reply
                        .code(404)
                        .send({ error: 'Resource unavailable or access denied.' });
                if (method === 'GET')
                    return {
                        id: server.id,
                        ...server.payload,
                        visibility: server.visibility,
                        accessVersion: server.accessVersion,
                        expiresAt: server.expiresAt,
                        uses: server.uses,
                        endpointUrl: `${origin}/mcp/mock/${server.id}`,
                    };
                if (method === 'DELETE')
                    return (await resources.delete(server.id, 'mcp', token, ownerId))
                        ? reply.code(204).send()
                        : reply.code(404).send({ error: 'Resource unavailable or access denied.' });
                let config;
                try {
                    config = validateMcp(request.body);
                } catch (error) {
                    return reply.code(400).send({ error: (error as Error).message });
                }
                const saved = await resources.update(
                    server.id,
                    'mcp',
                    token,
                    { ...config },
                    ownerId,
                );
                return saved === 'updated'
                    ? reply.code(204).send()
                    : reply
                          .code(saved === 'full' ? 503 : 404)
                          .send({ error: 'Unable to update MCP server.' });
            },
        });
}
