const security = [{ accountKey: [] }, { sessionCookie: [] }];
const uuid = { type: 'string', format: 'uuid' };
const json = (schema: object = { type: 'object' }) => ({
    description: 'Success',
    content: { 'application/json': { schema } },
});
const errors = Object.fromEntries(
    ['400', '401', '403', '404', '409', '429', '503'].map((code) => [
        code,
        { description: 'Invalid input, permission, state or allowance' },
    ]),
);
const metadata = {
    type: 'object',
    properties: {
        id: uuid,
        name: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        username: { type: 'string' },
        agentMayRead: { type: 'boolean' },
        authenticatorId: uuid,
        inboxId: uuid,
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'name', 'url', 'username', 'agentMayRead'],
};
const fields = {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    url: { type: 'string', maxLength: 2048, description: 'HTTP or HTTPS URL, or domain.' },
    username: { type: 'string', minLength: 1, maxLength: 254 },
    password: { type: 'string', maxLength: 1024, writeOnly: true },
    passwordLength: {
        type: 'integer',
        minimum: 12,
        maximum: 128,
        default: 24,
        description:
            'On creation, omit password to generate one. The generated value is returned once.',
    },
    notes: { type: 'string', maxLength: 4000, writeOnly: true },
    agentMayRead: {
        type: 'boolean',
        default: false,
        description:
            'Only a signed-in workspace owner or admin may set this field, including during creation.',
    },
    authenticatorId: { ...uuid, nullable: true },
    inboxId: { ...uuid, nullable: true },
};
const body = (properties: object, required: string[] = []) => ({
    required: true,
    content: {
        'application/json': {
            schema: { type: 'object', additionalProperties: false, properties, required },
        },
    },
});
const id = [{ name: 'id', in: 'path', required: true, schema: uuid }];
export function credentialOpenApi() {
    const guide =
        'Use only for accounts your human asked you to create or operate. Passwords and notes are encrypted. Metadata responses never include them. Revealing requires resources:write and is logged without the password.';
    return {
        '/api/credentials': {
            get: {
                operationId: 'listCredentials',
                tags: ['Vault'],
                summary: 'List workspace credential metadata',
                security,
                description: guide,
                responses: {
                    '200': json({
                        type: 'object',
                        properties: {
                            credentials: { type: 'array', items: metadata },
                            limit: { type: 'integer' },
                        },
                    }),
                    ...errors,
                },
            },
            post: {
                operationId: 'saveCredential',
                tags: ['Vault'],
                summary: 'Save an encrypted credential or generate and save a password',
                security,
                description: `${guide} Free allows 10 entries, Pro 200 and Team 1000. When password is omitted, the response includes a generated password once. API keys must omit agentMayRead.`,
                requestBody: body(fields, ['name', 'url', 'username']),
                responses: {
                    '201': json({
                        type: 'object',
                        properties: { credential: metadata, password: { type: 'string' } },
                    }),
                    ...errors,
                },
            },
        },
        '/api/credentials/{id}': {
            parameters: id,
            get: {
                operationId: 'getCredential',
                tags: ['Vault'],
                summary: 'Read credential metadata',
                security,
                responses: { '200': json(metadata), ...errors },
            },
            patch: {
                operationId: 'updateCredential',
                tags: ['Vault'],
                summary: 'Update a credential',
                security,
                description:
                    'Only a signed-in owner or admin can change agentMayRead. Updating an entry invalidates its previous reveal approvals. passwordLength applies only during creation.',
                requestBody: body(fields),
                responses: { '200': json(metadata), ...errors },
            },
            delete: {
                operationId: 'deleteCredential',
                tags: ['Vault'],
                summary: 'Delete a workspace credential',
                security,
                responses: { '204': { description: 'Deleted' }, ...errors },
            },
        },
        '/api/credentials/{id}/reveal': {
            parameters: id,
            post: {
                operationId: 'revealCredential',
                tags: ['Vault'],
                summary: 'Reveal a password after human approval',
                security,
                description: `${guide} Default returns 202 with approvalId and answerUrl. Wait using the approval routes, then repeat with approvalId. Approval is bound to this entry version and requesting credential, lasts at most one hour and permits one reveal. An owner or admin browser session can confirm a reveal with confirm:true. Entries with agentMayRead enabled allow write keys to reveal directly. At most 30 requests per workspace per minute.`,
                requestBody: {
                    ...body({ approvalId: uuid, confirm: { type: 'boolean' } }),
                    required: false,
                },
                responses: {
                    '200': json({
                        type: 'object',
                        properties: {
                            status: { const: 'revealed' },
                            id: uuid,
                            password: { type: 'string' },
                            notes: { type: 'string' },
                        },
                    }),
                    '202': json({
                        type: 'object',
                        properties: {
                            status: { const: 'awaitingApproval' },
                            approvalId: uuid,
                            answerUrl: { type: 'string', format: 'uri' },
                        },
                    }),
                    ...errors,
                },
            },
        },
        '/api/passwords/generate': {
            post: {
                operationId: 'generatePassword',
                tags: ['Vault'],
                summary: 'Generate a strong password without storing it',
                security,
                requestBody: {
                    ...body({
                        length: { type: 'integer', minimum: 12, maximum: 128, default: 24 },
                    }),
                    required: false,
                },
                responses: {
                    '200': json({ type: 'object', properties: { password: { type: 'string' } } }),
                    ...errors,
                },
            },
        },
    };
}
