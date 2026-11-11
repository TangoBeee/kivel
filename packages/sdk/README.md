# @kivel.io/sdk

The TypeScript client for [Kivel](https://kivel.io): webhook URLs,
owned email when configured, mock APIs, files, workspace memory, monitors and human approval
for coding agents. Requires Node.js 22.13+ or a compatible fetch-based runtime.
The published package is ESM; use `import`, not CommonJS `require`.

```sh
npm install @kivel.io/sdk@beta
```

Use the explicit beta tag for the current beta channel. Pin an exact version
when you need reproducible application builds.

```ts
import { Kivel, KivelError } from '@kivel.io/sdk';

const kivel = new Kivel({ apiKey: process.env.KIVEL_API_KEY });
const inbox = await kivel.createInbox();
const received = await kivel.waitForRequests(inbox.id, { timeoutSeconds: 20 });
console.log(received.requests);
await kivel.remove('inboxes', inbox.id);
```

`createInbox()` returns a `webhookUrl` that accepts senders without credentials. Reading and waiting still require your workspace key or the private `inspectionToken`. For token-required receiving, pass `{ visibility: 'private' }` and give the sender the returned `accessToken` for its `X-Access-Token` header.

`baseUrl` defaults to `https://kivel.io`; set it to your self-hosted origin.
Remote origins require HTTPS. The default request timeout is 25 seconds. Requests
are not automatically retried and redirects are refused.

Without a key, supported operations use anonymous limits. Use `startLogin(name)`
to obtain the browser approval link, then `finishLogin(deviceCode)` until approval.
Save the returned key privately; it is delivered once. Never ask a human to paste
an API key into a chat. Human approvals and billing cannot be performed by a key.

Dedicated methods cover owned email and guarded sending, scheduled callbacks, event waits, DNS monitors, status pages, SMTP captures, phone Phase A, memory, questions, mocks and files. Read `GET /api/capabilities` first for operator-enabled features.
`request()` handles other `/api/` operations and `/mock/` caller requests. Anonymous
management tokens and private caller tokens serve different purposes; keep them
out of URLs. A timed-out wait is not a human approval or a received event.

Errors from the API use `KivelError` with `status` and optional `requestId` and
`retryAfter`, `requiredPlan` and `upgradeUrl`. Relay a 402 to the human instead of retrying. Inputs and credentials go to your configured server; the SDK does not
write a local credential file. Do not log responses that contain keys or tokens.

[Method reference](https://kivel.io/docs/sdk/) ·
[Agent workflows](https://kivel.io/docs/agent-workflows/) ·
[Plan limits](https://kivel.io/pricing/)

Licensed under Apache-2.0. Support: support@kivel.io.

Use `addAuthenticator({ name, uri })`, `getTotpCode(id)`, `listAuthenticators()`,
`renameAuthenticator(id, name)` and `deleteAuthenticator(id)` only for accounts your
human asked you to create or operate. Import also accepts `secret` (Base32) or
`imageBase64` (PNG/JPEG QR up to 1 MiB and one million pixels). Secrets are never
returned. Free supports 2, Pro 25 and Team 100 authenticators. Every code generation
requires `resources:write` and is audited with the user ID, key ID and agent name
(or the key name for a key without an approved agent). The limit is 30 per workspace
per minute; `nextCode` is included when fewer than five seconds remain. Keep the service recovery codes separately.

`getEmailAttachment(inboxId, messageId, attachmentId)` returns a private download
URL valid for two minutes. `downloadEmailAttachment(...)` fetches its exact bytes.
Attachment IDs come from email message metadata. Messages are limited to 5 MiB,
with 25 MiB of attachment content per inbox, counted against workspace storage.
Deletion and inbox expiry remove files and invalidate links. Treat every file as
untrusted; this SDK does not scan or execute attachments.

## Mock OAuth provider

Use an approved workspace key and synthetic users to test sign in. The issuer exposes
OIDC discovery, JWKS, authorization, token, userinfo and revocation endpoints.

```ts
const provider = await kivel.createOAuthProvider({
    name: 'Test app',
    redirectUris: ['http://localhost:3000/auth/callback'],
    users: [{ sub: 'test-user', email: 'alex@example.test', name: 'Alex' }],
});
// Save provider.client_secret privately at creation.
// Configure your OAuth client with provider.discoveryUrl and S256 PKCE.
await kivel.oauthProvider(provider.id);
await kivel.mockCalls(provider.id);
await kivel.deleteOAuthProvider(provider.id);
```

`oauthProviders()` lists workspace providers; `updateOAuthProvider(id, config)` replaces
the users, claims and test scenario. Endpoint use is public; management stays private.
See the [OAuth guide](https://kivel.io/docs/mock-oauth/) for token flows and failure scenarios.

## Workspace vault

Use `saveCredential({ name, url, username })` to generate and store a password, or
include `password` to save one you already have. The generated value is returned
once. `credentials()` and `credential(id)` return metadata.
`revealCredential(id)` requests human approval by default. Wait with
`waitForApproval(approvalId)`, then repeat the reveal with that approval ID.
Each approval permits one reveal by the same caller. Only signed-in owners and
admins can change `agentMayRead`. Use `generatePassword(length)` for a standalone
password, `updateCredential(id, changes)` to edit, and `deleteCredential(id)` to remove it.
