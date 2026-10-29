# socket.help

The internet toolkit for AI coding agents: webhook URLs, receive-only email,
mock APIs and MCP servers, files, workspace memory, monitors and human approval.
One MCP connection, with HTTP, a TypeScript SDK, CLI and optional SSH gateway.
Free browser utilities remain available alongside the agent tools.
Next.js, Radix UI, Motion, Fastify and PostgreSQL.

## Development

Requires Node.js 22+ and pnpm 10.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3001. Development starts a local PostgreSQL instance with
data in `.data/`; set `DATABASE_URL` to use an existing database.

```sh
pnpm check
```

Runs type checks, catalog and API tests, PostgreSQL integration tests, and production builds.

Audio/video tools need `ffmpeg` and `ffprobe` on `PATH` for local development.
The Docker image includes both. They accept files up to 10 MiB and 120 seconds,
produce at most 5 MiB, and cancel after 20 seconds. Uploads and results are removed
after processing; no media history is retained.

## Free open beta deployment

Follow [docs/deploy-open-beta.md](docs/deploy-open-beta.md) for VM sizing, Hostinger DNS,
SMTP, HTTPS, release checks and backups. `BILLING_ENABLED=false` is the default;
Pro/Team checkout stays closed even if Dodo credentials are present. Public
production startup requires recovery email configuration. Support is support@socket.help.

## Docker

```sh
node scripts/setup-env.mjs
docker compose up -d --build --wait
pnpm test:smoke
```

Open http://localhost:8080. `/account/` manages resources, scoped API keys, and usage;
`/plans/` describes quotas and `/integrations/` covers every interface.
Passwords are generated in ignored `.env` with owner-only
permissions. PostgreSQL uses a persistent volume; the app runs as a non-root user
with a read-only filesystem. Do not remove volumes when upgrading.

For public HTTPS, point your domain to the server, allow ports 80/443, set `DOMAIN`
in `.env`, then run:

```sh
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
```

Caddy provisions TLS. The app trusts only the proxy's configured IP. The proxy
network uses `10.203.0.0/24`; set `PROXY_NETWORK_PREFIX` to another unused prefix
if that range conflicts with your host. HTTP and SSH app ports bind to localhost; only the proxy exposes public ports by default.
If you add a CDN or another proxy, configure its trusted IP ranges in Caddy too.

## Operations

`/health` checks the process; `/ready` also checks PostgreSQL. Logs rotate and
exclude payloads, query strings, and tokens. Migrations run transactionally at startup.
Keep `.env` with the persistent volume; changing passwords there does not rotate
existing database credentials.

```sh
docker compose exec -T database pg_dump -U socket_admin -d socket -Fc > backup.dump
```

Protect backups and define a short retention period: they include captured data.
Restore while the app is stopped:

```sh
docker compose stop app
docker compose exec -T database pg_restore -U socket_admin -d socket --clean --if-exists --exit-on-error < backup.dump
docker compose up -d --wait
```

`node scripts/verify-backup.mjs` verifies a backup in an isolated temporary database.
`pnpm scan:images` checks all three built images for high/critical vulnerabilities.
`pnpm test:https` tests the built stack with verified local TLS and proxy trust.
See [backend/README.md](backend/README.md) for API details and [PROJECT.md](PROJECT.md)
for the broader roadmap. Start at `/docs/`; the interactive Scalar reference is at
`/docs/reference/`. Tool guides, `/blog/`, and `/compare/` are statically rendered
with canonical metadata and sitemap coverage. Unavailable tools remain Coming soon
and are excluded from search indexing.
Set `SITE_URL` at build time for custom SEO canonicals; the HTTPS Compose stack
uses `DOMAIN` automatically.

## Clients and billing

`pnpm build:packages` builds the shared engine, TypeScript SDK, and CLI.
SDK and CLI are published under the beta tag:
`npm install @socket-help/sdk@beta` and
`npx --package=@socket-help/cli@beta socket-help --help`.
Run `pnpm test:packages` to verify standalone installable tarballs in `release/`.
See [client releases](docs/client-releases.md) for publishing and installation.
Start with `/docs/agent-workflows/` for device login, email, memory, monitors and human questions.
Use `pnpm cli --help`; set `SOCKET_HELP_URL` and `SOCKET_HELP_API_KEY` for scripts.
For file utilities, pipe bytes to `run <id> --file <name>`. PDF merging and image-to-PDF
accept an ordered file array in SDK/HTTP execution; MCP uses the `files` argument.
The CLI exposes the same multi-file request through `api POST /api/tools/<id>/run`.
The optional SSH gateway listens on localhost:2222 in Docker and accepts API keys
as the password for user `socket`. Its host key persists in `ssh_host_keys`; verify
the fingerprint printed at startup. Set `SSH_PORT=0` to disable it. It exposes tool
commands, with no shell, forwarding, SCP, or SFTP.

Dodo Payments checkout requires `BILLING_ENABLED=true` and the four `DODO_*` credentials/product
settings in `.env.example` to be configured. Rebuild after changing the billing flag so static pricing and
runtime checkout agree. `DODO_PAYMENTS_ENVIRONMENT` defaults to
`test_mode`; enable `live_mode` only after a complete sandbox checkout and renewal.
Use two distinct fixed recurring products with no trials, discounts or usage meters.
Set the subscription duration to 20 years, as required by this integration, with
a monthly payment frequency. Annual billing is not offered. Prices come from Dodo.
Register `/billing/webhook` for subscription lifecycle events, using the endpoint’s
Standard Webhooks signing secret. Entitlements follow verified events and a fresh
subscription retrieval, never the checkout return URL. The customer portal is
available to workspace owners. See `docs/billing.md` for setup and validation.

## Account recovery

Set `SMTP_HOST`, `SMTP_PORT` (587 by default), `SMTP_FROM` (an email address), and
`SMTP_USER` / `SMTP_PASSWORD` for your transactional email provider. Remote SMTP
requires TLS; credentials and sender settings stay in `.env`. Keep `AUTH_SECRET`
stable: it encrypts pending recovery mail. Delivery retries use the PostgreSQL
outbox. Configure SMTP before enabling Dodo Payments subscriptions.

Signup always requires and saves an email address, including before SMTP is
configured. Users verify that address from Account security. Password recovery uses an
eight-digit, single-use code entered on the site, never in a URL. Codes last 15
minutes with five attempts. Resetting revokes all sessions and API keys while
preserving workspace resources. Checkout requires a verified recovery email.

## Sharing and isolation

Resource pages default to private access. Public links work without a credential;
private downloads, mock calls, MCP calls, and webhook senders require a separate
sharing token (`X-Access-Token` or Bearer). Management/inspection tokens control
configuration and history; they cannot download private content. Account-owned
management requires current workspace access. Rotate a sharing token to invalidate
previously issued access tokens. All interfaces default to private; send
`?visibility=public` explicitly for public sharing. File links contain only the
resource ID. Share private access tokens separately; recipients enter them on
the receiver page, which sends them in a request header. URL fragments do not
authorize access.

Formatters, generators and image/PDF operations run in bounded worker threads.
Network tools contact public targets with address pinning, redirect validation and
a ten-second deadline (API scenarios allow up to six sequential requests and twenty seconds overall). Execution inputs and results are not retained; mock/MCP configuration never
executes user code. Uploads are served as attachments, and previews run locally.
Global PostgreSQL allocation caps can be set with `MAX_RESOURCE_BYTES`,
`MAX_RESOURCES`, `MAX_TOTAL_INBOX_BYTES`, and `MAX_INBOXES`, separately from plan limits.

Set `maxDownloads=1` for a one-time file link. Its final allowed download removes
the stored file contents and releases their storage; metadata remains manageable
until deletion or expiry. The web catalog includes one-time and private-sharing
pages. SDK and CLI uploads default to private access, and raw API creation uses the same private default.

## Original music assets

The built-in CC0 tracks include full MP3 arrangements and editable WAV loops.
Source recipes live in `packages/tools/src/audio.ts`; reproduce the MP3 files with
`pnpm build:packages` followed by `node scripts/build-music-library.mjs` (FFmpeg required).
Track-specific license notes ship in `frontend/public/music/LICENSE.txt`.
The composer and image tools also publish option metadata through
`GET /api/tools/:id`, `socket-help describe <id>`, and MCP `describe_tool`.

API test scenarios use the same hosted execution endpoint and clients. The workbench
supports variables, separate secret inputs, response checks and JSON captures; exports
exclude secret values. See `/docs/api-scenarios/` for the format and report contract.

Stateful CRUD mocks add one seeded collection to the existing mock lifecycle. Record
reads and writes use `/mock/:id/:collection`; management reset is
`POST /api/mocks/:id/reset`. SDK/CLI/SSH accept `/mock/` paths with a separate caller
token; MCP exposes `call_mock_api`. See `/docs/stateful-crud-mocks/` for formats,
revision guards, limits and the distinction between seed and live exports.

HTTP echo endpoints use the same mock lifecycle with `{name, routes: [], echo: true}`.
Call `/mock/:id` with an optional relative path to inspect redacted request metadata
and a parsed JSON/text body. Requests are not retained. See `/docs/http-echo/`.
