const string = { type: 'string' };
const uuid = { type: 'string', format: 'uuid' };
const security = [{ accountKey: [] }, { sessionCookie: [] }];
const id = [{ name: 'id', in: 'path', required: true, schema: uuid }];
const json = (
    schema: object = { type: 'object', additionalProperties: true },
    description = 'Success',
) => ({ description, content: { 'application/json': { schema } } });
const errors = {
    '400': json(undefined, 'Invalid input'),
    '401': json(undefined, 'Invalid credential'),
    '402': json(
        {
            type: 'object',
            properties: {
                error: string,
                requiredPlan: { enum: ['free', 'pro', 'team'] },
                upgradeUrl: { ...string, format: 'uri' },
            },
            required: ['error', 'requiredPlan', 'upgradeUrl'],
        },
        'Account or plan upgrade required; relay this to the human',
    ),
    '403': json(undefined, 'Insufficient scope'),
    '404': json(undefined, 'Unavailable or access denied'),
    '429': json(undefined, 'Plan or rate limit reached'),
    '503': json(undefined, 'Operator configuration or capacity unavailable'),
};
const body = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const operation = (operationId: string, summary: string, tag: string, extra = {}) => ({
    operationId,
    summary,
    tags: [tag],
    security,
    responses: { '200': json(), ...errors },
    ...extra,
});
const retention = [
    {
        name: 'ttlSeconds',
        in: 'query',
        schema: { type: 'integer', minimum: 60 },
        description:
            'Lifetime must cover all scheduled runs. Defaults to one hour; plan maximum applies.',
    },
    {
        name: 'persistent',
        in: 'query',
        schema: { type: 'boolean' },
        description: 'Pro/Team only. Extends while subscribed.',
    },
];
const statusConfig = {
    type: 'object',
    additionalProperties: false,
    properties: {
        name: { ...string, minLength: 1, maxLength: 80 },
        description: { ...string, maxLength: 240 },
        monitorIds: { type: 'array', items: uuid, minItems: 1, maxItems: 20, uniqueItems: true },
    },
    required: ['name', 'monitorIds'],
};
const jobConfig = {
    type: 'object',
    additionalProperties: false,
    properties: {
        name: { ...string, minLength: 1, maxLength: 80 },
        url: {
            ...string,
            format: 'uri',
            description:
                'Public HTTP(S), no credentials or query string. Redirects are not followed.',
        },
        body: { description: 'JSON callback body, at most 16 KiB.' },
        delaySeconds: { type: 'integer', minimum: 5, maximum: 604800, default: 60 },
        startAt: {
            ...string,
            format: 'date-time',
            description: 'Alternative to delaySeconds, 5 seconds to 7 days ahead.',
        },
        intervalSeconds: { type: 'integer', minimum: 300, maximum: 86400 },
        maxRuns: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
    },
    required: ['name', 'url'],
};
export function readinessOpenApi() {
    return {
        '/api/capabilities': {
            get: {
                operationId: 'getCapabilities',
                summary: 'Read operator-enabled features',
                tags: ['Platform'],
                responses: { '200': json() },
            },
        },
        '/api/phone-numbers': {
            get: operation(
                'listPhoneNumbers',
                'List owned numbers and paid-slot allowance',
                'Phone numbers',
            ),
            post: operation(
                'createPhoneNumber',
                'Buy a US number in an already-paid slot',
                'Phone numbers',
                {
                    parameters: [
                        { name: 'Idempotency-Key', in: 'header', required: true, schema: string },
                    ],
                    requestBody: body({
                        type: 'object',
                        properties: { number: { ...string, pattern: '^\\+1[2-9][0-9]{9}$' } },
                        required: ['number'],
                    }),
                    responses: {
                        '202': json(undefined, 'Order pending; retain its ID and retry key'),
                        ...errors,
                    },
                    description:
                        'Phase A, operator-enabled only. Requires Pro/Team and active paid phone add-on. Search available inventory first. Uncertain purchases are reconciled by customer reference; never retry with a different key.',
                },
            ),
        },
        '/api/phone-numbers/available': {
            get: operation(
                'availablePhoneNumbers',
                'Search available US local SMS numbers',
                'Phone numbers',
                {
                    parameters: [
                        {
                            name: 'areaCode',
                            in: 'query',
                            schema: { ...string, pattern: '^[2-9][0-9]{2}$' },
                        },
                    ],
                },
            ),
        },
        '/api/phone-numbers/{id}': {
            parameters: id,
            delete: operation(
                'releasePhoneNumber',
                'Release an owned number and stop its provider billing',
                'Phone numbers',
                {
                    responses: { '204': { description: 'Released at provider' }, ...errors },
                    description:
                        'Does not cancel paid add-on slots. Use the owner billing flow separately.',
                },
            ),
        },
        '/api/phone-numbers/{id}/sms': {
            parameters: id,
            get: operation('listSms', 'Read private received SMS and codes', 'Phone numbers'),
        },
        '/api/phone-numbers/{id}/wait': {
            parameters: id,
            get: operation(
                'waitForSms',
                'Wait for incoming SMS on an active number',
                'Phone numbers',
                {
                    parameters: [
                        { name: 'after', in: 'query', schema: string },
                        {
                            name: 'timeoutSeconds',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, maximum: 30, default: 20 },
                        },
                    ],
                },
            ),
        },
        '/api/billing/phone-addon': {
            post: operation('changePhoneAddon', 'Owner-only paid phone slot change', 'Billing', {
                security: [{ sessionCookie: [] }],
                parameters: [
                    { name: 'Idempotency-Key', in: 'header', required: true, schema: string },
                ],
                requestBody: body({
                    type: 'object',
                    properties: {
                        quantity: { type: 'integer', minimum: 0, maximum: 10 },
                        confirm: { const: true },
                    },
                    required: ['quantity', 'confirm'],
                }),
                description:
                    'Disabled until operator confirms pricing and activates phones. Collects a prorated payment link; no slots are granted until a verified billing event. A failed payment preserves the current subscription.',
            }),
        },
        '/api/status-pages': {
            post: operation(
                'createStatusPage',
                'Publish selected workspace monitor results',
                'Status pages',
                {
                    parameters: [
                        ...retention,
                        {
                            name: 'visibility',
                            in: 'query',
                            schema: { enum: ['private', 'public'], default: 'private' },
                        },
                    ],
                    requestBody: body(statusConfig),
                    responses: {
                        '201': json(
                            undefined,
                            'Created; caller credential returned once for private pages',
                        ),
                        ...errors,
                    },
                    description:
                        'Requires an account. Publishes only names, states, probe timings and recent status-change dates. Excludes target URLs, destinations and detailed errors.',
                },
            ),
        },
        '/api/status-pages/{id}': {
            parameters: id,
            get: operation('getStatusPage', 'Read owned status-page configuration', 'Status pages'),
            put: operation(
                'updateStatusPage',
                'Update selected monitors and page copy',
                'Status pages',
                { requestBody: body(statusConfig) },
            ),
            delete: operation('deleteStatusPage', 'Delete a status page', 'Status pages', {
                responses: { '204': { description: 'Deleted' }, ...errors },
            }),
        },
        '/status/{id}': {
            get: {
                operationId: 'viewStatusPage',
                summary: 'View a public or authorized private status page',
                tags: ['Status pages'],
                parameters: id,
                responses: {
                    '200': {
                        description: 'Escaped, noindex HTML; stale checks are flagged',
                        content: { 'text/html': { schema: string } },
                    },
                    '404': json(undefined, 'Unavailable or access denied'),
                },
                description:
                    'Private pages require X-Access-Token, a scoped workspace key or the owner browser session. Credentials never belong in URLs.',
            },
        },
        '/api/scheduled-jobs': {
            post: operation(
                'createScheduledJob',
                'Schedule a delayed or repeating JSON callback',
                'Scheduled jobs',
                {
                    parameters: retention,
                    requestBody: body(jobConfig),
                    responses: { '201': json(), ...errors },
                    description:
                        'Owned private job. At most 100 runs within its lifetime. Four deliveries run concurrently per process, with a 10-second attempt timeout. Network errors, 429 and 5xx retry twice after 60/120 seconds. At-least-once delivery: deduplicate X-Socket-Delivery-Id. Inspect recent events or use wait_for_event with kind job.',
                },
            ),
            get: operation(
                'listScheduledJobs',
                'List workspace callbacks and recent attempts',
                'Scheduled jobs',
            ),
        },
        '/api/scheduled-jobs/{id}': {
            parameters: id,
            get: operation(
                'getScheduledJob',
                'Read a callback and its latest 20 delivery attempts',
                'Scheduled jobs',
            ),
            delete: operation(
                'deleteScheduledJob',
                'Cancel future deliveries and delete the job',
                'Scheduled jobs',
                {
                    responses: {
                        '204': { description: 'Deleted; an in-flight request may still arrive' },
                        ...errors,
                    },
                },
            ),
        },
        '/api/smtp-inboxes': {
            post: operation(
                'createSmtpInbox',
                'Create an authenticated test SMTP capture',
                'SMTP capture',
                {
                    parameters: retention,
                    responses: {
                        '201': json({
                            type: 'object',
                            properties: {
                                id: uuid,
                                expiresAt: { ...string, format: 'date-time' },
                                smtp: {
                                    type: 'object',
                                    properties: {
                                        host: string,
                                        port: { type: 'integer' },
                                        secure: { type: 'boolean' },
                                        username: uuid,
                                        password: {
                                            ...string,
                                            description: 'Capture-only credential, shown once',
                                        },
                                    },
                                },
                            },
                        }),
                        ...errors,
                    },
                    description:
                        'Operator must enable the TLS SMTP listener first. Requires an account. Stores up to 100 messages of 128 KiB, never delivers recipients. Read/wait/delete using email-inboxes routes and the workspace key. Email domain setup is independent of SMTP capture.',
                },
            ),
        },
        '/api/smtp-inboxes/{id}': {
            parameters: id,
            get: operation(
                'getSmtpInbox',
                'Read capture settings without revealing its password',
                'SMTP capture',
            ),
        },
        '/api/smtp-inboxes/{id}/rotate': {
            parameters: id,
            post: operation(
                'rotateSmtpPassword',
                'Revoke the previous capture password and return a replacement',
                'SMTP capture',
            ),
        },
    };
}
