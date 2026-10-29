# Backend

Fastify serves the static Next.js export, API, public resource endpoints, and MCP.
PostgreSQL provides durable resources, account ownership, atomic quotas, rate
windows, and billing event deduplication. Migrations run transactionally at startup.

Use `/docs/reference/` for the Scalar API reference and `/api/openapi.json` for schemas.
`/api/tools` lists implemented and planned tools; utilities execute through
`POST /api/tools/{id}/run`. Formatters, generators and image/PDF tools run in bounded
workers. Network tools use pinned public addresses and validate every redirect,
with a ten-second deadline. Execution history is not retained. Browser utilities run locally by default.

Account keys use `Authorization: Bearer sh_…`. Anonymous resource tokens use
Bearer authentication or `X-Resource-Token`. Owned resources require current
workspace access; leaking their original token does not grant management access.
Private endpoint access uses a separate hashed sharing token in `X-Access-Token`
or Bearer, or an authorized workspace credential. Public endpoints are explicitly
unauthenticated. `POST /api/{kind}/{id}/sharing` changes visibility or rotates a
private token. Invalid access does not consume downloads or capture requests.
Browser session mutations require the configured Origin. Keys cannot create new
keys, change workspace membership, or open billing sessions.

`GET /api/plans` and `/api/usage` describe plan limits and hosted execution usage.
`/api/account/resources` lists owned resources. Resource renewal uses each
`/api/{kind}/{id}/renew` endpoint; expired resources cannot be renewed. Cleanup
removes expired resources and releases storage quotas at least once per minute.
Paid persistent leases extend through a successful billing period plus 24 hours.

Platform MCP uses Streamable HTTP at `/mcp`. `run_tool`, `list_tools`, resource
operations, and `resource_request` share the same permissions and quotas as HTTP.
Mock MCP servers at `/mcp/mock/{id}` return configured static responses.

`pnpm test` runs unit and API checks. From the repository root,
`pnpm test:integration` creates an isolated PostgreSQL instance and checks
migration, persistence, replica concurrency, billing lifecycle, and SSH parity.
See the root README for Docker, secrets, backups, HTTPS, and Dodo Payments setup.


Agent capabilities are shared by HTTP, MCP, the TypeScript SDK, CLI and optional SSH
commands: device login/trials, receive-only email, webhooks, mocks, memory, monitors
and human questions. Agent approval/revocation, answering questions, workspace
membership and billing require the human browser session. CLI `listen` runs locally;
SSH uses bounded single commands. See `/docs/sdk/`, `/docs/cli/`, `/docs/ssh/` and
`/docs/mcp/` for commands and credential handling. SDK and CLI 0.3.0 are published to npm as @socket-help/sdk@beta and
@socket-help/cli@beta. See docs/client-releases.md for the release process.
