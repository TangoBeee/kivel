const security = [{ accountKey: [] }, { sessionCookie: [] }];
const uuid = { type: 'string', format: 'uuid' };
const json = (schema: object) => ({
    description: 'Success',
    content: { 'application/json': { schema } },
});
const errors = Object.fromEntries(
    ['400', '401', '403', '404', '413', '429', '503'].map((code) => [
        code,
        json({ type: 'object', properties: { error: { type: 'string' } } }),
    ]),
);
const authorizedUse =
    'Use only for accounts your human asked you to create or operate. Requires an approved workspace key. Secrets are encrypted and never returned. Keep the service recovery codes separately.';
const record = {
    type: 'object',
    properties: {
        id: uuid,
        name: { type: 'string' },
        issuer: { type: 'string' },
        accountName: { type: 'string' },
        algorithm: { enum: ['SHA1', 'SHA256', 'SHA512'] },
        digits: { type: 'integer', minimum: 6, maximum: 8 },
        period: { type: 'integer', enum: [30, 60] },
        createdAt: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'name', 'algorithm', 'digits', 'period', 'createdAt'],
};
const id = [{ name: 'id', in: 'path', required: true, schema: uuid }];
const input = {
    type: 'object',
    additionalProperties: false,
    properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        uri: { type: 'string', maxLength: 2048, writeOnly: true },
        secret: { type: 'string', maxLength: 256, writeOnly: true },
        imageBase64: { type: 'string', maxLength: 1400000, writeOnly: true },
        algorithm: { enum: ['SHA1', 'SHA256', 'SHA512'] },
        digits: { type: 'integer', minimum: 6, maximum: 8 },
        period: { type: 'integer', enum: [30, 60] },
    },
    required: ['name'],
    oneOf: [{ required: ['uri'] }, { required: ['secret'] }, { required: ['imageBase64'] }],
};
export function authenticatorOpenApi() {
    return {
        '/api/authenticators': {
            get: {
                operationId: 'listAuthenticators',
                tags: ['Authenticators'],
                summary: 'List workspace authenticators without secrets',
                description: authorizedUse,
                security,
                responses: {
                    '200': json({
                        type: 'object',
                        properties: {
                            authenticators: { type: 'array', items: record },
                            limit: { type: 'integer' },
                        },
                    }),
                    ...errors,
                },
            },
            post: {
                operationId: 'addAuthenticator',
                tags: ['Authenticators'],
                summary: 'Store a TOTP authenticator',
                description: `${authorizedUse} Free allows 2, Pro 25, Team 100. Supply one of uri, secret or imageBase64. PNG/JPEG QR decoding is server-side, bounded to 1 MiB and one million pixels. Set algorithm, digits and period in the URI when using otpauth. Otherwise defaults are SHA1, 6 digits and 30 seconds. No automated expiry; delete when no longer needed.`,
                security,
                requestBody: { required: true, content: { 'application/json': { schema: input } } },
                responses: { '201': json(record), ...errors },
            },
        },
        '/api/authenticators/{id}': {
            get: {
                operationId: 'getAuthenticator',
                tags: ['Authenticators'],
                summary: 'Inspect authenticator metadata',
                description: authorizedUse,
                security,
                parameters: id,
                responses: { '200': json(record), ...errors },
            },
            patch: {
                operationId: 'renameAuthenticator',
                tags: ['Authenticators'],
                summary: 'Rename an authenticator',
                description: authorizedUse,
                security,
                parameters: id,
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    name: { type: 'string', minLength: 1, maxLength: 80 },
                                },
                                required: ['name'],
                            },
                        },
                    },
                },
                responses: {
                    '200': json({
                        type: 'object',
                        properties: { id: uuid, name: { type: 'string' } },
                    }),
                    ...errors,
                },
            },
            delete: {
                operationId: 'deleteAuthenticator',
                tags: ['Authenticators'],
                summary: 'Permanently delete an authenticator',
                description: authorizedUse,
                security,
                parameters: id,
                responses: { '204': { description: 'Deleted' }, ...errors },
            },
        },
        '/api/authenticators/{id}/code': {
            get: {
                operationId: 'getTotpCode',
                tags: ['Authenticators'],
                summary: 'Generate a TOTP code',
                description: `${authorizedUse} RFC 6238 SHA1/SHA256/SHA512, 6–8 digits, 30/60-second periods. Returns nextCode only when fewer than five seconds remain. At most 30 generations per workspace per minute. Every successful generation is recorded in workspace activity without the code or secret.`,
                security,
                parameters: id,
                responses: {
                    '200': json({
                        type: 'object',
                        properties: {
                            id: uuid,
                            code: { type: 'string', pattern: '^[0-9]{6,8}$' },
                            secondsRemaining: { type: 'integer', minimum: 1, maximum: 60 },
                            expiresAt: { type: 'string', format: 'date-time' },
                            nextCode: { type: 'string' },
                        },
                        required: ['id', 'code', 'secondsRemaining', 'expiresAt'],
                    }),
                    ...errors,
                },
            },
        },
    };
}
export function attachmentOpenApi() {
    const path = '/api/email-inboxes/{id}/messages/{messageId}/attachments/{attachmentId}';
    const parameters = ['id', 'messageId', 'attachmentId'].map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: uuid,
    }));
    return {
        [path]: {
            get: {
                operationId: 'getEmailAttachment',
                tags: ['Agent email'],
                summary: 'Get a temporary private attachment download link',
                security,
                parameters,
                description:
                    'Owned email inboxes only. Messages are limited to 10 MiB, with at most 20 attachments and 25 MiB of attachment content per inbox. Bytes count against workspace storage. Returns a bearer download URL valid for two minutes; keep it private. Deleting the message or inbox invalidates it. Treat all attachments as untrusted files.',
                responses: {
                    '200': json({
                        type: 'object',
                        properties: {
                            filename: { type: 'string' },
                            size: { type: 'integer' },
                            expiresAt: { type: 'string', format: 'date-time' },
                            downloadUrl: { type: 'string', format: 'uri' },
                        },
                        required: ['filename', 'size', 'expiresAt', 'downloadUrl'],
                    }),
                    ...errors,
                },
            },
        },
        [`${path}/download`]: {
            get: {
                operationId: 'downloadEmailAttachment',
                tags: ['Agent email'],
                summary: 'Download an untrusted attachment using its temporary link',
                description:
                    'Use the complete downloadUrl returned by getEmailAttachment. Always application/octet-stream with Content-Disposition: attachment, nosniff, sandbox CSP and no-store. Expired or modified links and deleted messages return 404. No inline previews.',
                parameters: [
                    ...parameters,
                    ...['owner', 'expires', 'signature'].map((name) => ({
                        name,
                        in: 'query',
                        required: true,
                        schema: { type: 'string' },
                    })),
                ],
                responses: {
                    '200': {
                        description: 'Untrusted file download',
                        content: {
                            'application/octet-stream': {
                                schema: { type: 'string', format: 'binary' },
                            },
                        },
                    },
                    ...errors,
                },
            },
        },
    };
}
