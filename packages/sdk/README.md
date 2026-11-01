# @socket-help/sdk

The TypeScript client for [socket.help](https://socket.help): webhook URLs,
owned email when configured, mock APIs, files, workspace memory, monitors and human approval
for coding agents. Requires Node.js 22.13+ or a compatible fetch-based runtime.
The published package is ESM; use `import`, not CommonJS `require`.

```sh
npm install @socket-help/sdk@beta
```

Use the explicit beta tag for the current beta channel. Pin an exact version
when you need reproducible application builds.

```ts
import { SocketHelp, SocketError } from '@socket-help/sdk';

const socket = new SocketHelp({ apiKey: process.env.SOCKET_HELP_API_KEY });
const inbox = await socket.createInbox();
const received = await socket.waitForRequests(inbox.id, { timeoutSeconds: 20 });
console.log(received.requests);
await socket.remove('inboxes', inbox.id);
```

`createInbox()` returns a `webhookUrl` that accepts senders without credentials. Reading and waiting still require your workspace key or the private `inspectionToken`. For token-required receiving, pass `{ visibility: 'private' }` and give the sender the returned `accessToken` for its `X-Access-Token` header.

`baseUrl` defaults to `https://socket.help`; set it to your self-hosted origin.
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

Errors from the API use `SocketError` with `status` and optional `requestId` and
`retryAfter`, `requiredPlan` and `upgradeUrl`. Relay a 402 to the human instead of retrying. Inputs and credentials go to your configured server; the SDK does not
write a local credential file. Do not log responses that contain keys or tokens.

[Method reference](https://socket.help/docs/sdk/) ·
[Agent workflows](https://socket.help/docs/agent-workflows/) ·
[Plan limits](https://socket.help/plans/)

Licensed under Apache-2.0. Support: support@socket.help.

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
