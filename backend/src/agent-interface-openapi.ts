const object = { type: 'object', additionalProperties: true };
const json = (schema: object = object) => ({
    description: 'Success',
    content: { 'application/json': { schema } },
});
const errors = {
    '400': { description: 'Invalid input' },
    '401': { description: 'Authentication required' },
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
            post: operation('createEmailInbox', 'Email inboxes', 'Create a receive-only address', {
                security: [{}, ...security],
                description:
                    'Reading always needs a management token or workspace credential. Incoming mail needs MAIL_DOMAIN and the signed Email Worker; there is no arbitrary outbound mail.',
                responses: {
                    '201': json(),
                    '503': { description: 'Mail is not configured or capacity reached' },
                    ...errors,
                },
            }),
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
                'Renew an unexpired email inbox within the active plan limit',
                { security: token, requestBody: body({ persistent: { type: 'boolean' } }, []) },
            ),
        },
    };
}
