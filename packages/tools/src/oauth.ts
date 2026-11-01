export const oauthScenarios = [
    'none',
    'access_denied',
    'invalid_grant',
    'expired_code',
    'wrong_redirect_uri',
    'invalid_pkce_verifier',
    'expired_tokens',
    'slow_token_endpoint',
    'rotated_signing_key',
] as const;
export type OAuthScenario = (typeof oauthScenarios)[number];
export interface OAuthUser {
    sub: string;
    email: string;
    name: string;
    claims?: Record<string, unknown>;
}
export interface OAuthConfig {
    name: string;
    redirectUris: string[];
    users: OAuthUser[];
    claims: Record<string, unknown>;
    headless: boolean;
    scenario: OAuthScenario;
}
export { oauthLimits } from './billing-plans.js';
const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
export function validateOAuth(value: unknown): OAuthConfig {
    if (!object(value)) throw new Error('Provide a provider configuration.');
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80)
        throw new Error('Provide a name up to 80 characters.');
    if (
        !Array.isArray(value.redirectUris) ||
        !value.redirectUris.length ||
        value.redirectUris.length > 20
    )
        throw new Error('Provide 1 to 20 exact redirect URLs.');
    const redirectUris = value.redirectUris.map((uri: unknown) => {
        if (typeof uri !== 'string' || uri.length > 2048 || /[\s\\]/.test(uri))
            throw new Error('Use absolute redirect URLs without spaces.');
        let url: URL;
        try {
            url = new URL(uri);
        } catch {
            throw new Error('Use absolute redirect URLs.');
        }
        if (
            url.username ||
            url.password ||
            url.hash ||
            uri.includes('#') ||
            !(
                url.protocol === 'https:' ||
                (url.protocol === 'http:' &&
                    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
            )
        )
            throw new Error(
                'Redirect URLs need HTTPS, or HTTP on localhost, without credentials or fragments.',
            );
        return uri;
    });
    if (!Array.isArray(value.users) || !value.users.length || value.users.length > 25)
        throw new Error('Provide 1 to 25 synthetic test users.');
    const claims = (v: unknown) => {
        if (v === undefined) return {};
        if (!object(v) || JSON.stringify(v).length > 4096)
            throw new Error('Custom claims must be a JSON object up to 4 KiB.');
        if (
            Object.keys(v).some((k) =>
                [
                    'iss',
                    'aud',
                    'exp',
                    'iat',
                    'nbf',
                    'nonce',
                    'jti',
                    'sub',
                    'email',
                    'name',
                    'at_hash',
                    'c_hash',
                    '__proto__',
                    'constructor',
                    'prototype',
                ].includes(k),
            )
        )
            throw new Error('Custom claims cannot override identity or protocol claims.');
        return v;
    };
    const users = value.users.map((u: unknown) => {
        if (
            !object(u) ||
            !['sub', 'email', 'name'].every(
                (k) =>
                    typeof u[k] === 'string' &&
                    (u[k] as string).length > 0 &&
                    (u[k] as string).length <= 200,
            )
        )
            throw new Error('Each user needs sub, email and name up to 200 characters.');
        return {
            sub: u.sub as string,
            email: u.email as string,
            name: u.name as string,
            claims: claims(u.claims),
        };
    });
    if (
        new Set(users.map((u) => u.sub)).size !== users.length ||
        new Set(users.map((u) => u.email)).size !== users.length
    )
        throw new Error('User subjects and emails must be unique.');
    const scenario = value.scenario ?? 'none';
    if (!(oauthScenarios as readonly unknown[]).includes(scenario))
        throw new Error('Choose a supported failure scenario.');
    if (value.headless !== undefined && typeof value.headless !== 'boolean')
        throw new Error('headless must be true or false.');
    return {
        name: value.name.trim(),
        redirectUris: [...new Set(redirectUris)],
        users,
        claims: claims(value.claims),
        headless: value.headless === true,
        scenario: scenario as OAuthScenario,
    };
}
export const oauthSchema = {
    type: 'object',
    properties: {
        name: { type: 'string', maxLength: 80 },
        redirectUris: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { type: 'string', format: 'uri' },
        },
        users: {
            type: 'array',
            minItems: 1,
            maxItems: 25,
            items: {
                type: 'object',
                required: ['sub', 'email', 'name'],
                properties: {
                    sub: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    claims: { type: 'object', additionalProperties: true },
                },
            },
        },
        claims: { type: 'object', additionalProperties: true },
        headless: { type: 'boolean', default: false },
        scenario: { type: 'string', enum: oauthScenarios },
    },
    required: ['name', 'redirectUris', 'users'],
} as const;
