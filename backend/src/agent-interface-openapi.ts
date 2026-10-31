const object = { type: 'object', additionalProperties: true };
const json = (schema: object = object) => ({
    description: 'Success',
    content: { 'application/json': { schema } },
});
const errors = {
    '400': { description: 'Invalid input' },
    '401': { description: 'Authentication required' },
    '402': {
        description: 'Required account or plan',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['error', 'requiredPlan', 'upgradeUrl'],
                    properties: {
                        error: { type: 'string' },
                        requiredPlan: { type: 'string', enum: ['free', 'pro', 'team'] },
                        upgradeUrl: { type: 'string', format: 'uri' },
                    },
                },
            },
        },
    },
    '403': { description: 'Insufficient permission' },
    '404': { description: 'Not found or access denied' },
    '429': { description: 'Plan or rate limit reached' },
};
const security = [{ accountKey: [] }, { sessionCookie: [] }];
const session = [{ sessionCookie: [] }];
const id = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }];
const body = (properties: object, required: string[]) => ({
    required: true,
    content: {
        'application/json': {
            schema: { type: 'object', properties, required, additionalProperties: false },
        },
    },
});
const operation = (operationId: string, tag: string, summary: string, extra = {}) => ({
    operationId,
    tags: [tag],
    summary,
    security,
    responses: { '200': json(), ...errors },
    ...extra,
});
const token = [{ resourceToken: [] }, { privateResourceToken: [] }, ...security];

export function agentInterfaceOpenApi() {
    return {
        '/ping/{token}': {
            parameters: [
                {
                    name: 'token',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{32}$' },
                },
            ],
            post: operation(
                'reportHeartbeat',
                'Monitors',
                'Report a successful heartbeat using its secret ping token',
                { security: [] },
            ),
            get: operation(
                'reportHeartbeatGet',
                'Monitors',
                'Report a successful heartbeat from a job',
                { security: [] },
            ),
        },
        '/ping/{token}/fail': {
            parameters: [
                {
                    name: 'token',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{32}$' },
                },
            ],
            post: operation(
                'reportHeartbeatFailure',
                'Monitors',
                'Report a failed heartbeat using its secret ping token',
                { security: [] },
            ),
            get: operation(
                'reportHeartbeatFailureGet',
                'Monitors',
                'Report a failed heartbeat from a job',
                { security: [] },
            ),
        },
        '/api/account/activity': {
            get: operation(
                'agentActivity',
                'Agents',
                'Read recent MCP tool calls; arguments and results are never included',
            ),
        },
        '/api/agents/{id}': {
            parameters: id,
            delete: operation(
                'revokeAgent',
                'Agents',
                'Revoke an agent (signed-in owner/admin only)',
                { security: session, responses: { '204': { description: 'Revoked' }, ...errors } },
            ),
        },
        '/api/agents/login/{code}': {
            parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
            get: operation(
                'inspectAgentLogin',
                'Agents',
                'Review an agent login in the signed-in browser',
                { security: session },
            ),
        },
        '/api/agents/login/{code}/approve': {
            parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
            post: operation(
                'approveAgentLogin',
                'Agents',
                'Approve an agent in the owner/admin browser; API keys cannot approve',
                {
                    security: session,
                    requestBody: body({ replaceAgentId: { type: 'string', format: 'uuid' } }, []),
                    responses: {
                        '200': json(),
                        '409': { description: 'Already answered or agent limit reached' },
                        '410': { description: 'Code expired' },
                        ...errors,
                    },
                },
            ),
        },
        '/api/agents/login/{code}/deny': {
            parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
            post: operation(
                'denyAgentLogin',
                'Agents',
                'Deny an agent in the owner/admin browser',
                { security: session },
            ),
        },
        '/api/approvals': {
            post: operation('askHuman', 'Human approvals', 'Ask the workspace owner a question', {
                description:
                    'Returns answerUrl and emailed. If email delivery is unavailable, show the link to the human. A pending or timed-out request is never approval.',
                requestBody: body(
                    {
                        question: { type: 'string', maxLength: 500 },
                        details: { type: 'string', maxLength: 4000 },
                        options: {
                            type: 'array',
                            minItems: 2,
                            maxItems: 5,
                            items: { type: 'string', maxLength: 60 },
                        },
                        timeoutMinutes: { type: 'integer', minimum: 1, maximum: 1440, default: 60 },
                    },
                    ['question'],
                ),
                responses: { '201': json(), ...errors },
            }),
            get: operation('listApprovals', 'Human approvals', 'List recent questions', {
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending'] } },
                ],
            }),
        },
        '/api/approvals/{id}': {
            parameters: id,
            get: operation(
                'inspectApproval',
                'Human approvals',
                'Read a question and its answer or expiry',
            ),
        },
        '/api/approvals/{id}/wait': {
            parameters: id,
            get: operation(
                'waitForApproval',
                'Human approvals',
                'Wait for an answer; repeat if timedOut is true',
                {
                    parameters: [
                        {
                            name: 'timeoutSeconds',
                            in: 'query',
                            schema: { type: 'integer', minimum: 1, maximum: 30, default: 25 },
                        },
                    ],
                },
            ),
        },
        '/api/approvals/{id}/answer': {
            parameters: id,
            post: operation(
                'answerApproval',
                'Human approvals',
                'Answer once from the signed-in owner/admin browser',
                {
                    security: session,
                    requestBody: body(
                        { answer: { type: 'string' }, note: { type: 'string', maxLength: 1000 } },
                        ['answer'],
                    ),
                    responses: {
                        '200': json(),
                        '409': { description: 'Already answered or expired' },
                        ...errors,
                    },
                },
            ),
        },
        '/api/email-inboxes': {
            post: operation(
                'createEmailInbox',
                'Email inboxes',
                'Create an owned agent email address',
                {
                    security,
                    description:
                        'Requires an account. Free gets one random inbox lasting 1–7 days (default 3); Pro gets 10 and Team 50 persistent inboxes while subscribed. Retired addresses are never reused. MAIL_DOMAIN and signed ingest must be configured.',
                    requestBody: body(
                        {
                            activeDays: { type: 'integer', minimum: 1, maximum: 7, default: 3 },
                            localPart: {
                                type: 'string',
                                minLength: 3,
                                maxLength: 48,
                                description:
                                    'Pro or Team only; lowercase letters, numbers and single hyphens. Reserved and retired names are unavailable.',
                            },
                        },
                        [],
                    ),
                    responses: {
                        '201': json(),
                        '503': { description: 'Mail is not configured or capacity reached' },
                        ...errors,
                    },
                },
            ),
            get: operation(
                'listEmailInboxes',
                'Email inboxes',
                'List owned addresses and their active or paused status',
                { security },
            ),
        },
        '/api/monitors/{id}/accept-dns': {
            parameters: id,
            post: operation(
                'acceptDnsChanges',
                'Monitors',
                'Accept the last observed DNS answers as a new baseline',
                { security },
            ),
        },
        '/api/events/wait': {
            post: operation(
                'waitForEvent',
                'Agents',
                'Wait for any webhook, email or human-answer event',
                {
                    security: [{}, ...security],
                    description:
                        'One shared wait slot for up to ten sources. Events have per-source cursors; send them back as after to consume new data. Waits return incoming mail only and never interpret an expired or negative answer as approval. Anonymous webhook/email resources need their own per-source token. New email inboxes and human questions require workspace access. SMS is not available yet.',
                    requestBody: body(
                        {
                            sources: {
                                type: 'array',
                                minItems: 1,
                                maxItems: 10,
                                items: {
                                    type: 'object',
                                    properties: {
                                        kind: {
                                            type: 'string',
                                            enum: ['webhook', 'email', 'approval', 'job', 'sms'],
                                        },
                                        id: { type: 'string', format: 'uuid' },
                                        token: { type: 'string' },
                                        after: { type: 'string', format: 'uuid' },
                                    },
                                    required: ['kind', 'id'],
                                },
                            },
                            timeoutSeconds: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 30,
                                default: 25,
                            },
                        },
                        ['sources'],
                    ),
                },
            ),
        },
        '/api/email-inboxes/{id}': {
            parameters: id,
            get: operation(
                'inspectEmailInbox',
                'Email inboxes',
                'Read address, expiry and message count',
                { security: token },
            ),
            delete: operation(
                'deleteEmailInbox',
                'Email inboxes',
                'Delete the inbox and received messages',
                { security: token, responses: { '204': { description: 'Deleted' }, ...errors } },
            ),
        },
        '/api/email-inboxes/{id}/messages': {
            parameters: id,
            delete: operation(
                'clearEmails',
                'Email inboxes',
                'Delete stored messages while keeping the address',
                {
                    security: token,
                    responses: {
                        '204': {
                            description:
                                'Messages removed and storage released; restart event cursors',
                        },
                        ...errors,
                    },
                },
            ),
            get: operation(
                'listEmails',
                'Email inboxes',
                'Read messages with extracted codes and links and attachment metadata',
                { security: token },
            ),
        },
        '/api/email-inboxes/{id}/wait': {
            parameters: id,
            get: operation('waitForEmail', 'Email inboxes', 'Wait for new messages', {
                security: token,
                parameters: [
                    { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' } },
                    {
                        name: 'timeoutSeconds',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 30, default: 25 },
                    },
                ],
            }),
        },
        '/api/email-inboxes/{id}/renew': {
            parameters: id,
            post: operation(
                'renewEmailInbox',
                'Email inboxes',
                'Check an active paid inbox; Free inbox lifetimes cannot be extended',
                { security: token },
            ),
        },
        '/api/email-inboxes/{id}/send': {
            parameters: id,
            post: operation(
                'sendEmail',
                'Email inboxes',
                'Send from an active owned agent address',
                {
                    security,
                    description:
                        'Operator-enabled private Postfix relay on socketspace.xyz. Free requires verified owner email and allows 30 deliveries/month and 3/day; Pro 500/month and 50/day; Team 3000/month and 300/day (UTC reset). Free allows 3 recipients/message; paid allows 10. A 1 MiB message limit, minute caps and suppressions apply. Reuse the same Idempotency-Key and identical content to inspect an earlier send. An uncertain relay outcome is not automatically resent. 202 means relay acceptance, not confirmed inbox delivery.',
                    parameters: [
                        {
                            name: 'Idempotency-Key',
                            in: 'header',
                            required: true,
                            schema: { type: 'string', minLength: 16, maxLength: 100 },
                        },
                    ],
                    requestBody: body(
                        {
                            to: {
                                type: 'array',
                                minItems: 1,
                                maxItems: 10,
                                items: { type: 'string', format: 'email' },
                            },
                            subject: { type: 'string', maxLength: 998 },
                            text: { type: 'string' },
                            html: { type: 'string' },
                            replyTo: {
                                type: 'string',
                                format: 'uuid',
                                description:
                                    'Received message ID in this inbox, for In-Reply-To and References headers.',
                            },
                        },
                        ['to', 'subject'],
                    ),
                    responses: {
                        '202': json(),
                        '409': { description: 'Retry key conflicts or inbox full' },
                        '503': { description: 'Sending disabled or busy' },
                        ...errors,
                    },
                },
            ),
        },
        '/api/email-inboxes/{id}/forwarding': {
            parameters: id,
            put: operation(
                'setEmailForwarding',
                'Email inboxes',
                'Forward received mail to a public webhook (Pro or Team)',
                {
                    security: token,
                    requestBody: body(
                        {
                            url: {
                                type: ['string', 'null'],
                                description:
                                    'Requires Pro or Team and pauses when the plan lapses. Public HTTP(S) URL, or null to disable. Latest delivery status is shown on inbox metadata; forwarding is best effort without retries.',
                            },
                        },
                        ['url'],
                    ),
                },
            ),
        },
    };
}
