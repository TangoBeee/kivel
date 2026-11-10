# Kivel

The internet toolkit for AI coding agents: HTTP and webhooks, email, mock APIs
and OAuth, files, monitors, memory, authenticators, a password vault, scheduled jobs and status
pages, test data and media, developer utilities, DNS and network checks.
One MCP connection, with HTTP, a TypeScript SDK, CLI and optional SSH gateway.
Use `search_tools` to discover the complete catalog, `describe_tool` for inputs
and `run_tool` for utilities. Hosted resources have dedicated tools and lifecycle
routes. The catalog drives tool counts and availability; browser utilities stay free.
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

## Production

Kivel runs on one VPS behind Cloudflare. Every push to `main` that passes CI runs the
Deploy workflow: it builds the app, database and proxy images, pushes them to the private
Docker Hub repository `tangobee/socket`, then runs [deploy/server-deploy.sh](deploy/server-deploy.sh)
on the server over SSH. That script backs up the database, pulls the release, waits for it to
become healthy and rolls back if it does not; the workflow then runs
`scripts/production-check.mjs` against the live site. Run the workflow by hand to redeploy any
commit. It needs the `DOCKERHUB_TOKEN`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` secrets and the
`DEPLOY_HOST` variable.

`BILLING_ENABLED=false` is the default for self-hosting; Pro/Team checkout stays closed even if
Dodo credentials are present. Public production startup requires recovery email configuration.
Support is support@kivel.io.

## Docker

```sh
node scripts/setup-env.mjs
docker compose up -d --build --wait
pnpm test:smoke
```

Open the public site at http://localhost:8080 and the workspace at http://127.0.0.1:8080. The workspace manages resources, keys and usage. The public site has pricing, docs and the tool catalog.
Passwords are generated in ignored `.env` with owner-only
permissions. PostgreSQL uses a persistent volume; the app runs as a non-root user
with a read-only filesystem. Do not remove volumes when upgrading.

For public HTTPS, point your domain and its `app` subdomain at the server. Set up both DNS records before deploying the host split, allow ports 80 and 443, and set `DOMAIN` in `.env`. Caddy serves both hosts from one app image and provisions their certificates.
Deploy the host split before enabling live events so the previous release can also start on database schema 20.

```sh
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
```

The app trusts only the proxy's configured IP. The proxy
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
See [backend/README.md](backend/README.md) for API details. Start at `/docs/`; the interactive Scalar reference is at
`/docs/reference/`. Tool guides, `/blog/`, and `/compare/` are statically rendered
with canonical metadata and sitemap coverage. Unavailable tools remain Coming soon
and are excluded from search indexing.
Set `SITE_URL` at build time for custom SEO canonicals; the HTTPS Compose stack
uses `DOMAIN` automatically.

## Clients and billing

`pnpm build:packages` builds the shared engine, TypeScript SDK, and CLI.
SDK and CLI are published under the beta tag:
`npm install @kivel.io/sdk@beta` and
`npx --package=@kivel.io/cli@beta kivel --help`.
Run `pnpm test:packages` to verify standalone installable tarballs in `release/`.
See [client releases](docs/client-releases.md) for publishing and installation.
Start with `/docs/agent-workflows/` for device login, email, memory, monitors and human questions.
Use `pnpm cli --help`; set `KIVEL_URL` and `KIVEL_API_KEY` for scripts.
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
available to workspace owners. When replacing a Dodo product, add its old ID to
`DODO_LEGACY_PRODUCT_IDS`, for example `{"pdt_oldpro":"pro"}`. Existing subscriptions
keep their paid access and new checkout uses the current product IDs.

The deploy workflow builds with the `legacy` pricing schedule by default. To
launch early pricing, create fixed USD monthly products for Pro ($5) and Team
($29) in Dodo. Configure their IDs on the server and map the retired IDs with
`DODO_LEGACY_PRODUCT_IDS`. Set the GitHub repository variable
`BILLING_PRICE_SCHEDULE` to `early` and deploy. The image uses the same schedule
for the public pages and checkout. Checkout checks the Dodo product prices
before creating a session. Test the matching products in Dodo test mode before
switching live. To move to the $9 Pro price, use `standard` and add the $5
product ID to the retired map. When rolling back pricing, restore the matching
current product IDs with the earlier image.

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
`GET /api/tools/:id`, `kivel describe <id>`, and MCP `describe_tool`.

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

## Test agent payments

Test mode wallets, x402 v1 paywalls and hosted checkouts use fake units only. There
are no real funds, blockchain transactions or private keys. Wallet limits and
approval thresholds require an owner/admin browser session; agent keys cannot
change them. Above the threshold, agents share the approval URL and resume with
the same idempotency key after a human answers. Hosted checkouts collect no card
details. Checkout webhooks are signed and retried using the existing forwarder.

Use `create_test_wallet`, `wallet_pay` and `list_wallet_transactions` over MCP,
the SDK test payment methods or `kivel test-wallet`, `test-paywall` and
`test-checkout`. All three use existing resource/storage quotas and mock retention.
Keep `AUTH_SECRET` stable for encrypted webhook secrets and payment tokens.
Guide: [Test an agent that pays](https://kivel.io/docs/test-an-agent-that-pays/).
