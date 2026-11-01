import type { DocPage } from './docs';
export const oauthDoc: DocPage = {
    slug: 'mock-oauth',
    title: 'Test OAuth and OpenID Connect sign in',
    navTitle: 'Mock OAuth provider',
    group: 'Resources',
    description:
        'Create an OAuth and OpenID Connect test issuer with synthetic users, S256 PKCE, signed ID tokens and controlled failures. Inspect each request in your workspace.',
    updatedAt: '2026-11-01',
    sections: [
        {
            id: 'create',
            title: 'Create a test issuer',
            paragraphs: [
                'Use an approved workspace key to create a provider. You get an issuer, discovery URL, client_id and client_secret. Save the secret when it is returned, since inspection does not show it again. Each provider has its own RS256 signing key and JWKS endpoint. Private keys are encrypted at rest with a key derived from AUTH_SECRET and bound to the resource ID. Keep AUTH_SECRET with your backups; restoring a different key requires recreating affected providers. Its public endpoints simulate an identity service; configuration and request history stay private to your workspace.',
                'Use synthetic users and claims. This provider does not authenticate real people, connect to Google or GitHub, or prove ownership of an email address. The hosted page says socket.help test provider and never asks for a password. Never configure a production app to trust these test tokens.',
            ],
            code: {
                title: 'Create with the TypeScript SDK',
                value: `const provider = await socket.createOAuthProvider({
  name: 'Checkout test',
  redirectUris: ['http://localhost:3000/auth/callback'],
  users: [{ sub: 'test-user', email: 'alex@example.test', name: 'Alex',
    claims: { role: 'tester' } }],
  claims: { tenant: 'sandbox' },
  headless: false,
});
// Save provider.client_secret privately.
// Configure your client with provider.discoveryUrl and provider.client_id.`,
            },
        },
        {
            id: 'flow',
            title: 'Run a code flow with S256 PKCE',
            paragraphs: [
                'Fetch {issuer}/.well-known/openid-configuration. Generate a random PKCE verifier of 43 to 128 unreserved characters, hash it with SHA256 and encode the digest as base64url without padding. Send response_type=code, client_id, an exactly registered redirect_uri, code_challenge, code_challenge_method=S256 and your own random state to the authorization endpoint. Use scope=openid email profile for an ID token and user profile, plus offline_access when testing refresh tokens. Send a nonce and check it in the returned ID token.',
                'Choose a test user and approve or deny on the hosted page. Your callback receives a code or error and the original state. Check state before proceeding. Exchange the code at the token endpoint with a form encoded POST containing grant_type=authorization_code, code, redirect_uri, client_id and code_verifier. Confidential clients also authenticate with client_secret_basic or client_secret_post. Public clients can exchange a code with the matching S256 verifier and client_id alone.',
                'Verify the ID token signature against JWKS and check its issuer, audience, expiration and nonce. Call userinfo with the access token in the Authorization: Bearer header. Email claims require the email scope; name requires profile. Custom claims cannot override identity or protocol fields. Tokens are fixtures for your own tests, not real identity evidence.',
            ],
        },
        {
            id: 'headless',
            title: 'Complete the flow without a browser',
            paragraphs: [
                'Set headless=true in the provider configuration, then add prompt=none and login_hint to the authorization request. The hint must match a configured test user email or sub. Immediate redirects are allowed only to localhost, 127.0.0.1 and [::1] callbacks. For every other host, including error responses, the provider first shows the destination origin and requires an explicit Continue step on its hosted page. Confirmations must come from that page’s origin. If headless mode is off or the hint does not match, it returns login_required. PKCE, client and redirect checks still apply.',
                'Agents use create_oauth_provider, then inspect_mock_api with the returned id to inspect configuration and recent calls. call_mock_api accepts owned provider protocol paths; pass token form fields as body, read location from authorization redirects, and use accessToken for the userinfo bearer token. resource_request with kind oauth-providers supports create, inspect, update, delete, list, calls and renew. Updates replace the configuration. delete_mock_api also deletes a provider. search_tools and describe_tool expose the schemas. The CLI provides oauth create, update, inspect, list, calls, renew and delete; pipe the JSON configuration to create or update.',
            ],
            code: {
                title: 'CLI and HTTP management',
                value: `socket-help oauth create < provider.json
socket-help oauth inspect <id>
socket-help oauth calls <id>
socket-help oauth update <id> < provider.json
socket-help oauth delete <id>

curl https://socket.help/api/oauth-providers \\
  -H "Authorization: Bearer $SOCKET_HELP_API_KEY" \\
  -H 'Content-Type: application/json' --data-binary @provider.json`,
            },
        },
        {
            id: 'tokens',
            title: 'Refresh, revoke and test service credentials',
            paragraphs: [
                'Codes last 60 seconds and can be exchanged once. Access and ID tokens last 5 minutes. The offline_access scope enables refresh tokens, which last 1 hour and rotate each time they are used. A refresh request cannot add scopes. Reusing an old refresh token revokes every active token in that grant family. Public PKCE clients can refresh and revoke their own grants using client_id without a secret; confidential grants still require the client secret. Expiry never extends the lifetime of the provider. Deleting or expiring the provider removes its keys and stored grants.',
                'For client credentials, POST grant_type=client_credentials to the token endpoint with your client credentials. It returns an access token and does not return an ID or refresh token. To revoke, POST token and client credentials to the revocation endpoint. Revocation removes the grant family, so userinfo and refresh requests fail. A JWT already held by an offline validator stays cryptographically valid until its expiration; use short lifetimes and validate against current JWKS in tests.',
            ],
        },
        {
            id: 'failures',
            title: 'Switch on a failure scenario',
            paragraphs: [
                'Set scenario through the tool page, SDK updateOAuthProvider, HTTP PUT or resource_request update. Use none to restore normal behavior. Failure simulation never redirects to an unregistered URL.',
            ],
            table: {
                caption: 'Available scenarios',
                headers: ['Scenario', 'Behavior'],
                rows: [
                    ['access_denied', 'Authorization redirects with access_denied.'],
                    ['invalid_grant', 'Token requests fail with invalid_grant.'],
                    ['expired_code', 'New codes are already expired when exchanged.'],
                    ['wrong_redirect_uri', 'Code exchange fails as if the redirect did not match.'],
                    ['invalid_pkce_verifier', 'Code exchange fails its PKCE check.'],
                    [
                        'expired_tokens',
                        'Access and ID tokens are already expired; userinfo rejects them.',
                    ],
                    ['slow_token_endpoint', 'Token responses wait 1.5 seconds.'],
                    [
                        'rotated_signing_key',
                        'Rotates at most once per provider per minute. Earlier public keys stay in JWKS until their tokens expire. A client with a stale JWKS cache must refresh it to verify tokens signed by the new key.',
                    ],
                ],
            },
        },
        {
            id: 'limits',
            title: 'Limits, retention and request history',
            paragraphs: [
                'Free workspaces can keep 1 active provider, Pro 10 and Team 50. The existing mock retention rules apply: providers start with one hour; ttlSeconds can select a longer duration within your plan, and paid persistent resources follow subscription validity. Renew through the dashboard or POST /api/mocks/{id}/renew. Providers and grant state count toward workspace resource and storage allowances. Up to 20 redirect URLs and 25 users can be configured per provider.',
                'Each provider accepts 120 requests per minute and keeps its latest 100 requests in the mock inspector. The history shows endpoint, method, status and duration. Each call is written before its response is sent, so inspection after a completed request includes that call. Codes, secrets, user hints, tokens and consent payloads are redacted. Active grant state is bounded at 500 entries and expired entries are discarded as new grants are created or used. Delete the provider after your test to remove keys, grants and its durable request history.',
            ],
        },
    ],
    related: [
        { title: 'HTTP API reference', href: '/docs/reference/' },
        { title: 'Mock OAuth provider', href: '/tools/mock-oauth-provider/' },
    ],
};
