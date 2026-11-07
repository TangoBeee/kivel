import { oauthSchema } from '@kivel/tools/oauth';
export function oauthOpenApi() {
    const id = [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ];
    const json = (schema: object) => ({ content: { 'application/json': { schema } } });
    const management = [{ accountKey: [] }, { sessionCookie: [] }];
    const provider = {
        type: 'object',
        properties: {
            id: { type: 'string', format: 'uuid' },
            issuer: { type: 'string', format: 'uri' },
            discoveryUrl: { type: 'string', format: 'uri' },
            client_id: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
            oauth: oauthSchema,
        },
    };
    const response = (schema: object) => ({
        '200': { description: 'Success', ...json(schema) },
        '400': {
            description: 'Invalid OAuth parameters or a configured test failure',
            ...json({
                type: 'object',
                properties: { error: { type: 'string' }, error_description: { type: 'string' } },
            }),
        },
        '405': { description: 'Method not allowed' },
        '503': { description: 'Temporary storage or service capacity reached' },
        '401': { description: 'Workspace approval or client credentials required' },
        '404': { description: 'Provider unavailable or expired' },
        '429': { description: 'Plan or request limit reached' },
    });
    const operation = (summary: string, schema: object = { type: 'object' }) => ({
        summary,
        tags: ['OAuth test providers'],
        parameters: id,
        responses: response(schema),
    });
    const form = {
        required: true,
        content: {
            'application/x-www-form-urlencoded': {
                schema: {
                    type: 'object',
                    properties: Object.fromEntries(
                        [
                            'grant_type',
                            'client_id',
                            'client_secret',
                            'code',
                            'redirect_uri',
                            'code_verifier',
                            'refresh_token',
                            'scope',
                            'token',
                            'token_type_hint',
                        ].map((k) => [k, { type: 'string' }]),
                    ),
                },
            },
        },
    };
    return {
        '/api/oauth-providers': {
            post: {
                ...operation('Create an OAuth test provider'),
                parameters: [
                    { name: 'ttlSeconds', in: 'query', schema: { type: 'integer', minimum: 60 } },
                    { name: 'persistent', in: 'query', schema: { type: 'boolean' } },
                ],
                security: management,
                description:
                    'Workspace only. Free 1, Pro 10, Team 50 active providers. Same retention and storage rules as mock APIs. Receiver endpoints are public test endpoints; inspection and configuration stay private. Use synthetic users only. The client secret is returned once.',
                requestBody: { required: true, ...json(oauthSchema) },
                responses: {
                    '201': {
                        description: 'Created. Save client_secret now.',
                        ...json({
                            ...provider,
                            properties: {
                                ...provider.properties,
                                client_secret: { type: 'string' },
                            },
                        }),
                    },
                    '400': { description: 'Invalid configuration' },
                    '401': { description: 'Workspace key required' },
                    '429': { description: 'Plan or creation limit reached' },
                },
            },
            get: {
                ...operation('List workspace OAuth test providers', {
                    type: 'object',
                    properties: { providers: { type: 'array', items: provider } },
                }),
                parameters: [],
                security: management,
            },
        },
        '/api/oauth-providers/{id}': {
            get: { ...operation('Inspect an OAuth test provider', provider), security: management },
            put: {
                ...operation('Update users, claims and failure scenario'),
                security: management,
                description:
                    'Replaces the configuration. Saving rotated_signing_key rotates at most once per provider per minute. Earlier public keys remain in JWKS until tokens signed with them expire. Requests within the rotation window return 429 with Retry-After. Private keys are encrypted at rest using AUTH_SECRET and bound to the provider ID.',
                requestBody: { required: true, ...json(oauthSchema) },
                responses: {
                    '204': { description: 'Updated' },
                    '429': {
                        description: 'Signing key rotation is limited to once per minute',
                        headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
                    },
                    '400': { description: 'Invalid configuration' },
                    '404': { description: 'Provider unavailable or access denied' },
                },
            },
            delete: {
                ...operation('Delete a test provider and its signing keys'),
                security: management,
                responses: {
                    '204': { description: 'Deleted' },
                    '404': { description: 'Provider unavailable or access denied' },
                },
            },
        },
        '/oauth/{id}/.well-known/openid-configuration': {
            get: operation('Discover this test provider'),
        },
        '/oauth/{id}/jwks': { get: operation('Read the provider RS256 public signing key') },
        '/oauth/{id}/authorize': {
            get: {
                ...operation('Choose a test user and approve or deny'),
                parameters: [
                    ...id,
                    ...[
                        'client_id',
                        'redirect_uri',
                        'response_type',
                        'scope',
                        'state',
                        'nonce',
                        'code_challenge',
                        'code_challenge_method',
                        'prompt',
                        'login_hint',
                    ].map((name) => ({
                        name,
                        in: 'query',
                        required: [
                            'client_id',
                            'redirect_uri',
                            'response_type',
                            'code_challenge',
                            'code_challenge_method',
                        ].includes(name),
                        schema: { type: 'string' },
                    })),
                ],
                description:
                    'Exact registered redirect URI required. Only code with S256 PKCE. Codes expire after 60 seconds and can be used once. For headless approval enable headless and supply prompt=none with a configured user email or subject as login_hint. Immediate redirects, including error responses, are allowed only to localhost, 127.0.0.1 and [::1]. Public hosts always require a hosted page with the destination origin and an explicit Continue step; its confirmation POST must have the provider Origin. No real user passwords.',
                responses: {
                    '200': {
                        description: 'Hosted test consent or destination confirmation page',
                        content: { 'text/html': { schema: { type: 'string' } } },
                    },
                    '302': { description: 'Redirect with code or OAuth error, and original state' },
                    '400': { description: 'Unregistered client or redirect URI; no redirect' },
                },
            },
            post: {
                ...operation('Submit a signed test consent form'),
                requestBody: {
                    required: true,
                    content: {
                        'application/x-www-form-urlencoded': {
                            schema: {
                                type: 'object',
                                required: ['consent', 'decision'],
                                properties: {
                                    consent: { type: 'string' },
                                    user: { type: 'string' },
                                    decision: { enum: ['approve', 'deny', 'continue'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '302': { description: 'Redirect to the registered callback' },
                    '400': { description: 'Invalid or expired form' },
                    '403': {
                        description: 'Confirm public redirects from the provider page origin',
                    },
                },
            },
        },
        '/oauth/{id}/token': {
            post: {
                ...operation('Exchange a code, rotate a refresh token or issue client credentials'),
                requestBody: form,
                description:
                    'Form encoded. Authenticate with client_secret_basic or client_secret_post. Public code exchange may use client_id and S256 verifier without a secret. Public grants also support refresh without a secret; reusing an old refresh token revokes the entire family. Access and ID tokens last 5 minutes. offline_access requests refresh tokens, which rotate on use and last 1 hour. Expiry never extends the provider lifetime. Client credentials do not return ID or refresh tokens. Test failures return standard OAuth errors.',
                responses: response({
                    type: 'object',
                    properties: {
                        access_token: { type: 'string' },
                        token_type: { const: 'Bearer' },
                        expires_in: { type: 'integer' },
                        scope: { type: 'string' },
                        id_token: { type: 'string' },
                        refresh_token: { type: 'string' },
                    },
                }),
            },
        },
        '/oauth/{id}/userinfo': {
            get: {
                ...operation('Read the synthetic user claims'),
                security: [{ oauthTestToken: [] }],
            },
            post: {
                ...operation('Read the synthetic user claims'),
                security: [{ oauthTestToken: [] }],
            },
        },
        '/oauth/{id}/revoke': {
            post: {
                ...operation('Revoke an access or refresh token and its grant family'),
                requestBody: form,
                description:
                    'Confidential grants require the provider client secret. Public PKCE grants accept client_id without a secret. Unknown tokens succeed without revealing whether they existed. Locally validated JWTs remain cryptographically valid until expiry; userinfo and refresh reject revoked grants.',
            },
        },
    };
}
