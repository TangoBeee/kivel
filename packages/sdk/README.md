# @socket-help/sdk

The TypeScript client for [socket.help](https://socket.help): webhook URLs,
receive-only email, mock APIs, files, workspace memory, monitors and human approval
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
const inbox = await socket.createInbox({ visibility: 'private' });
const received = await socket.waitForRequests(inbox.id, { timeoutSeconds: 20 });
console.log(received.requests);
await socket.remove('inboxes', inbox.id);
```

`baseUrl` defaults to `https://socket.help`; set it to your self-hosted origin.
Remote origins require HTTPS. The default request timeout is 25 seconds. Requests
are not automatically retried and redirects are refused.

Without a key, supported operations use anonymous limits. Use `startLogin(name)`
to obtain the browser approval link, then `finishLogin(deviceCode)` until approval.
Save the returned key privately; it is delivered once. Never ask a human to paste
an API key into a chat. Human approvals and billing cannot be performed by a key.

Dedicated methods cover email, memory, monitors, questions, mocks and files.
`request()` handles other `/api/` operations and `/mock/` caller requests. Anonymous
management tokens and private caller tokens serve different purposes; keep them
out of URLs. A timed-out wait is not a human approval or a received event.

Errors from the API use `SocketError` with `status` and optional `requestId` and
`retryAfter`. Inputs and credentials go to your configured server; the SDK does not
write a local credential file. Do not log responses that contain keys or tokens.

[Method reference](https://socket.help/docs/sdk/) ·
[Agent workflows](https://socket.help/docs/agent-workflows/) ·
[Plan limits](https://socket.help/plans/)

Licensed under Apache-2.0. Support: support@socket.help.
