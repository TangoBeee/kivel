import { executableIds } from './tool-routes.js';
export function accountOpenApi() {
    const json = (
        schema: object = { type: 'object', additionalProperties: true },
        description = 'Success',
    ) => ({ description, content: { 'application/json': { schema } } });
    const body = (schema: object) => ({
        required: true,
        content: { 'application/json': { schema } },
    });
    const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    });
    const string = { type: 'string' },
        id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
    const auth = [{ accountKey: [] }, { sessionCookie: [] }];
    const errors = {
        '400': json(undefined, 'Invalid input'),
        '401': json(undefined, 'Authentication required or credential invalid'),
        '403': json(undefined, 'Insufficient scope, role, or plan'),
        '429': json(undefined, 'Quota exceeded; inspect Retry-After'),
        '503': json(undefined, 'Service or billing configuration unavailable'),
    };
    const operation = (
        operationId: string,
        summary: string,
        tag: string,
        requestBody?: object,
        secured = true,
        response = '200',
    ) => ({
        operationId,
        summary,
        tags: [tag],
        ...(secured ? { security: auth } : {}),
        ...(requestBody ? { requestBody } : {}),
        responses: {
            [response]: response === '204' ? { description: 'Completed' } : json(),
            ...errors,
        },
    });
    const credentials = body(
        object({
            username: { ...string, pattern: '^[a-z0-9][a-z0-9_.-]{2,31}$' },
            password: { ...string, minLength: 8, maxLength: 256, writeOnly: true },
        }),
    );
    const paths: Record<string, Record<string, unknown>> = {
        '/api/tools': {
            get: {
                ...operation(
                    'listTools',
                    'Discover all tools and availability',
                    'Utilities',
                    undefined,
                    false,
                ),
                description:
                    'Coming-soon tools have no execution endpoint. Resource tools use their dedicated endpoints. Utility IDs are stable across interfaces.',
            },
        },
        '/api/tools/{id}': {
            get: {
                ...operation(
                    'describeTool',
                    'Read tool inputs, options and examples',
                    'Utilities',
                    undefined,
                    false,
                ),
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                ],
                description:
                    'Includes input examples, option keys, labels, choices, defaults, file support, steps and limits for implemented utilities. Resource tools link to dedicated APIs.',
            },
        },
        '/api/tools/{id}/run': {
            post: {
                ...operation(
                    'runTool',
                    'Run a utility with bounded CPU, memory, and input',
                    'Utilities',
                    body(
                        object(
                            {
                                input: { ...string, default: '' },
                                options: {
                                    type: 'object',
                                    additionalProperties: { type: 'string' },
                                    description:
                                        'Tool-specific string options: action, count, mode, secret, length, min, max, algorithm, unit, brand, pattern, flags, comparison, timezone, start, method, headers, body, from, to, columns, size, width, height, format, frequency, duration, level, recordType, origin, headerNames, credentials, expectedTxt, quality, x, y, rotation, flip, pages, values, page, locale, country, schema, selector, disambiguation, userAgent. See the individual tool page for controls.',
                                },
                                file: {
                                    oneOf: [
                                        object({
                                            name: string,
                                            base64: { ...string, contentEncoding: 'base64' },
                                        }),
                                        {
                                            type: 'array',
                                            minItems: 1,
                                            maxItems: 20,
                                            items: object({
                                                name: string,
                                                base64: { ...string, contentEncoding: 'base64' },
                                            }),
                                        },
                                    ],
                                    description:
                                        'One file, or an ordered array for everyday-merge-pdfs and everyday-image-to-pdf. Up to 10 MiB combined decoded file bytes. Text input and options use the separate plan input allowance.',
                                },
                            },
                            [],
                        ),
                    ),
                    false,
                ),
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', enum: executableIds },
                    },
                ],
                security: [...auth, {}],
                description:
                    'Formatters and generators run in bounded workers. Network tools contact public targets with address pinning, private-address blocking on every redirect, a 256 KiB response cap and a ten-second deadline. Inputs and results are not retained as execution history. Successful, timed-out and cancelled runs consume the UTC daily allowance; failed validation and busy rejections release the reserved run. file is supported by everyday-file-checksums, files-file-metadata-inspector, email-email-inspector, email-attachment-inspector and the image/PDF/audio/video tools. Image inputs are bounded to 10 MiB and sixteen million pixels; hosted daily allowances also apply. Audio/video processing uses a 20-second deadline, up to 10 MiB input, 120 seconds source duration, 1920 × 1080 source pixels and 5 MiB output. Request replay never follows redirects or forwards cookies. Generated files return output as a JSON string with kind, filename, mediaType, bytes and base64. Successful responses contain toolId, output (string), and usage {used, limit, resetsAt}. JSON formatting preserves large numeric literals and duplicate keys.',
                responses: {
                    '200': json(
                        object({
                            toolId: string,
                            output: string,
                            usage: object({
                                used: { type: 'integer' },
                                limit: { type: 'integer' },
                                resetsAt: { type: 'string', format: 'date-time' },
                            }),
                        }),
                    ),
                    '408': json(undefined, 'Processing time limit exceeded'),
                    '413': json(undefined, 'Plan input allowance exceeded'),
                    ...errors,
                },
            },
        },
        '/api/plans': {
            get: operation(
                'listPlans',
                'Compare configured plan allowances',
                'Accounts',
                undefined,
                false,
            ),
        },
        '/api/usage': {
            get: {
                ...operation(
                    'getUsage',
                    'Read hosted execution usage and workspace allowance counters',
                    'Accounts',
                    undefined,
                    false,
                ),
                description:
                    'Hosted run usage is available to every caller. A workspace session or key with account:read also receives workspace counters in items. Each item includes key, label, unit, used, max and an optional UTC resetsAt. The period describes the current UTC day.',
                security: [...auth, {}],
                responses: {
                    '200': json(
                        object({
                            plan: { type: 'string', enum: ['anonymous', 'free', 'pro', 'team'] },
                            limits: { type: 'object', additionalProperties: true },
                            runsToday: { type: 'integer', minimum: 0 },
                            resetsAt: { type: 'string', format: 'date-time' },
                            period: object({
                                start: { type: 'string', format: 'date-time' },
                                end: { type: 'string', format: 'date-time' },
                            }),
                            items: {
                                type: 'array',
                                items: object(
                                    {
                                        key: string,
                                        label: string,
                                        unit: { type: 'string', enum: ['count', 'bytes'] },
                                        used: { type: 'integer', minimum: 0 },
                                        max: { type: 'integer', minimum: 0 },
                                        resetsAt: { type: 'string', format: 'date-time' },
                                    },
                                    ['key', 'label', 'unit', 'used', 'max'],
                                ),
                            },
                        }),
                    ),
                    ...errors,
                },
            },
        },
        '/api/email-sending/usage': {
            get: {
                ...operation(
                    'getEmailSendingUsage',
                    'Read how many emails this workspace sent today and this month, with its limits',
                    'Accounts',
                ),
                security: auth,
            },
        },
        '/api/auth/register': {
            post: operation(
                'register',
                'Create a free username/password account and session',
                'Accounts',
                body(
                    object(
                        {
                            username: { ...string, pattern: '^[a-z0-9][a-z0-9_.-]{2,31}$' },
                            password: { ...string, minLength: 8, maxLength: 256, writeOnly: true },
                            email: { ...string, format: 'email', maxLength: 254 },
                        },
                        ['username', 'password', 'email'],
                    ),
                ),
                false,
                '201',
            ),
        },
        '/api/auth/login': {
            post: operation(
                'login',
                'Sign in with a seven-day HttpOnly session cookie',
                'Accounts',
                credentials,
                false,
            ),
        },
        '/api/auth/logout': {
            post: operation(
                'logout',
                'Revoke the current browser session',
                'Accounts',
                undefined,
                true,
                '204',
            ),
        },
        '/api/account': {
            get: operation(
                'getAccount',
                'Read your user, workspace, effective plan, role, and scopes',
                'Accounts',
            ),
            patch: {
                ...operation(
                    'renameWorkspace',
                    'Rename a workspace as an owner or admin',
                    'Accounts',
                    body(object({ name: { ...string, minLength: 1, maxLength: 80 } })),
                    true,
                    '204',
                ),
                description:
                    'Requires a signed-in browser session and matching Origin. API keys cannot perform browser-only account administration.',
            },
        },
        '/api/account/keys': {
            get: operation(
                'listKeys',
                'List your active keys in the current workspace',
                'Accounts',
            ),
            post: {
                ...operation(
                    'createKey',
                    'Create a scoped key; its secret is returned once',
                    'Accounts',
                    body(
                        object(
                            {
                                name: { ...string, minLength: 1, maxLength: 80 },
                                scopes: {
                                    type: 'array',
                                    minItems: 1,
                                    uniqueItems: true,
                                    items: {
                                        type: 'string',
                                        enum: [
                                            'tools:run',
                                            'resources:read',
                                            'resources:write',
                                            'account:read',
                                        ],
                                    },
                                },
                                expiresInDays: {
                                    type: 'integer',
                                    minimum: 1,
                                    maximum: 365,
                                    default: 90,
                                },
                            },
                            ['name'],
                        ),
                    ),
                    true,
                    '201',
                ),
                description:
                    'Browser session only, at most 20 active keys per user and workspace. Requested scopes must be allowed by the current role. API key secrets are stored as hashes.',
            },
        },
        '/api/account/keys/{id}': {
            delete: {
                ...operation(
                    'revokeKey',
                    'Immediately revoke one of your workspace keys',
                    'Accounts',
                    undefined,
                    true,
                    '204',
                ),
                parameters: [id],
            },
        },
        '/api/account/resources': {
            get: operation(
                'listResources',
                'List active resources owned by your workspace and total storage',
                'Lifecycle',
            ),
        },
        '/api/account/workspaces': {
            get: operation('listWorkspaces', 'List your workspace memberships', 'Accounts'),
        },
        '/api/account/workspace': {
            post: operation(
                'switchWorkspace',
                'Switch the current browser session’s workspace',
                'Accounts',
                body(object({ accountId: { ...string, format: 'uuid' } })),
                true,
                '204',
            ),
        },
        '/api/account/members': {
            get: operation('listMembers', 'List current workspace members', 'Accounts'),
        },
        '/api/account/invites': {
            post: operation(
                'inviteMember',
                'Create a username-bound Team invitation valid for 24 hours',
                'Accounts',
                body(
                    object({
                        username: string,
                        role: { type: 'string', enum: ['admin', 'member', 'viewer'] },
                    }),
                ),
                true,
                '201',
            ),
        },
        '/api/account/invites/accept': {
            post: operation(
                'acceptInvite',
                'Accept an invitation for your username',
                'Accounts',
                body(object({ token: { ...string, minLength: 43, maxLength: 43 } })),
            ),
        },
        '/api/account/members/{id}': {
            delete: {
                ...operation(
                    'removeMember',
                    'Remove a member and revoke their access to this workspace',
                    'Accounts',
                    undefined,
                    true,
                    '204',
                ),
                parameters: [id],
            },
        },
        '/api/billing': {
            get: {
                ...operation(
                    'getBilling',
                    'Read billing availability and validated recurring prices',
                    'Billing',
                    undefined,
                    false,
                ),
                description:
                    'enabled is false and prices is empty unless BILLING_ENABLED=true and all Dodo Payments credentials and published monthly product IDs are configured. Amounts are in the currency’s smallest unit.',
            },
        },
        '/api/billing/checkout': {
            post: {
                ...operation(
                    'createCheckout',
                    'Open Dodo Payments subscription checkout for a workspace owner',
                    'Billing',
                    body(object({ plan: { type: 'string', enum: ['pro', 'team'] } })),
                ),
                description:
                    'Browser session only. Existing subscriptions must be managed through the billing portal. Checkout never grants entitlements; signed subscription events do.',
            },
        },
        '/api/billing/portal': {
            post: operation(
                'createBillingPortal',
                'Open the workspace owner’s Dodo Payments billing portal',
                'Billing',
            ),
        },
        '/billing/webhook': {
            post: {
                ...operation(
                    'dodoWebhook',
                    'Receive signed Dodo Payments subscription lifecycle events',
                    'Billing',
                    undefined,
                    false,
                ),
                parameters: [
                    ...['webhook-id', 'webhook-timestamp', 'webhook-signature'].map((name) => ({
                        name,
                        in: 'header',
                        required: true,
                        schema: string,
                    })),
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true },
                        },
                    },
                },
                description:
                    'Configure subscription lifecycle events (active, renewed, updated, plan_changed, on_hold, paused, cancelled, failed and expired). The unmodified request body is verified. Events are deduplicated and current Dodo Payments state is retrieved before entitlements are applied.',
            },
        },
    };
    for (const path of ['inboxes', 'mocks', 'files', 'mcp-servers', 'status-pages'])
        paths[`/api/${path}/{id}/renew`] = {
            post: {
                ...operation(
                    `renew_${path.replaceAll('-', '_')}`,
                    'Renew a live resource within the current plan',
                    'Lifecycle',
                    body(object({ persistent: { type: 'boolean', default: false } }, [])),
                    false,
                ),
                security: [...auth, { inspectionToken: [] }, { resourceToken: [] }],
                parameters: [id],
                description:
                    'Temporary renewal extends to the maximum lifetime measured from creation. Persistent leases require an active paid plan and end after the paid period plus 24 hours. Expired resources cannot be renewed.',
            },
        };
    const code = { type: 'string', pattern: '^[0-9]{8}$', writeOnly: true };
    const email = { type: 'string', format: 'email', maxLength: 254 };
    const password = { type: 'string', minLength: 8, maxLength: 256, writeOnly: true };
    paths['/api/auth/recovery'] = {
        get: operation(
            'recoveryAvailability',
            'Read email recovery availability',
            'Accounts',
            undefined,
            false,
        ),
    };
    paths['/api/account/recovery'] = {
        get: {
            ...operation(
                'recoverySettings',
                'Read your verified and pending recovery email',
                'Accounts',
            ),
            security: [{ sessionCookie: [] }],
        },
    };
    paths['/api/account/email'] = {
        post: {
            ...operation(
                'setRecoveryEmail',
                'Send a verification code after confirming your current password',
                'Accounts',
                body(object({ email, password })),
                true,
                '202',
            ),
            security: [{ sessionCookie: [] }],
        },
    };
    paths['/api/account/email/verify'] = {
        post: {
            ...operation(
                'verifyRecoveryEmail',
                'Verify a pending email with a single-use code',
                'Accounts',
                body(object({ code })),
                true,
                '204',
            ),
            security: [{ sessionCookie: [] }],
        },
    };
    paths['/api/auth/password/forgot'] = {
        post: {
            ...operation(
                'forgotPassword',
                'Request a password reset code',
                'Accounts',
                body(object({ email })),
                false,
                '202',
            ),
            description:
                'Requires the site Origin. Responses are identical for known and unknown addresses. Codes expire after 15 minutes, allow five attempts, and are sent only to verified recovery addresses. No codes appear in URLs or API responses.',
        },
    };
    paths['/api/auth/password/reset'] = {
        post: {
            ...operation(
                'resetPassword',
                'Consume an email code and replace your password',
                'Accounts',
                body(object({ email, code, password })),
                false,
                '204',
            ),
            description:
                'Requires the site Origin. Success revokes every user session and API key, consumes outstanding codes, and does not sign in automatically. Existing resources remain owned by the same account.',
        },
    };
    for (const kind of ['inboxes', 'mocks', 'files', 'mcp-servers', 'status-pages'])
        paths[`/api/${kind}/{id}/sharing`] = {
            post: {
                ...operation(
                    `sharing_${kind.replaceAll('-', '_')}`,
                    'Set visibility or rotate a private access token',
                    'Lifecycle',
                    body(object({ visibility: { type: 'string', enum: ['public', 'private'] } })),
                    false,
                ),
                security: [...auth, { inspectionToken: [] }, { resourceToken: [] }],
                parameters: [id],
                description:
                    'Private access tokens are separate from management and inspection tokens. Private-to-private rotates the token and immediately rejects future requests using the old token. Public mode removes access-token requirements. Owned resources require workspace membership to manage sharing. Access tokens are returned once and stored as hashes.',
            },
        };
    paths['/files/{id}/info'] = {
        get: {
            ...operation(
                'getSharedFileInfo',
                'Read shared file metadata without consuming a download',
                'Files',
                undefined,
                false,
            ),
            security: [{}, ...auth, { shareAccess: [] }],
            parameters: [id],
            description:
                'Private files require the sharing token or workspace access. Missing or incorrect credentials receive the same 404 as an unavailable file. No management credentials or token hashes are returned.',
        },
    };
    return {
        paths,
        tags: [
            {
                name: 'Utilities',
                description: 'Hosted versions of local formatters, encoders, and generators.',
            },
            {
                name: 'Accounts',
                description:
                    'Workspace accounts, role-limited keys, and usage. Browser session mutations require Origin matching the configured site.',
            },
            {
                name: 'Lifecycle',
                description: 'Inspect ownership, retention, and resource expiry.',
            },
            {
                name: 'Billing',
                description:
                    'Dodo Payments subscriptions. Checkout remains disabled until configured.',
            },
        ],
    };
}
