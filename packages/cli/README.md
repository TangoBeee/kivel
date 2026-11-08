# @kivel.io/cli

The command-line client for [Kivel](https://kivel.io). Requires Node.js
22.13+. Commands share the HTTP API's access rules, plan limits and expiry.

Install the current beta:

```sh
npx --package=@kivel.io/cli@beta kivel --help
# Or install the command:
npm install --global @kivel.io/cli@beta
kivel --version
```

For source development, run `pnpm build:packages` and `pnpm cli --help` from the
repository, or use `pnpm test:packages` to verify SDK and CLI tarballs together. The CLI depends
on the matching SDK; it does not require the backend or media-processing packages.

```sh
export KIVEL_URL=https://kivel.io
export KIVEL_API_KEY=YOUR_WORKSPACE_KEY
kivel email create
kivel monitor list
printf '{"passed":true}' | kivel memory set project-a build/latest
kivel memory get project-a build/latest
```

Use `kivel agent login "Agent on my laptop"` to start device login. Open the
returned verification URL in your browser. Pipe a private JSON file containing
`deviceCode` to `kivel agent token` after approval, then save the returned
key privately. The CLI prints credentials only in the response to the request that
creates them; it does not automatically persist a login or modify client config.

JSON results go to stdout, errors to stderr with exit code 1, and downloads write
raw bytes. `--help` and `--version` print plain text. Input is limited to 10 MiB;
requests time out after 90 seconds. Mutations are never automatically retried.
`KIVEL_ACCESS_TOKEN` supplies a private file token for `download` when no
`--access-token` is passed. Keep secrets out of shell history and URLs.

`job`, `status-page`, `smtp`, `phone` and `event wait` use the same owned APIs. Operator-dependent services stay disabled until configured; phone sending and calls are not implemented. Run `kivel --help` for their current commands.

`listen` streams webhook events and can forward them to a local server. It runs on
your machine, and stops on Ctrl+C. The optional server SSH gateway supports bounded
commands; it does not provide this continuous listener or a shell/SCP/SFTP service.

[Command reference](https://kivel.io/docs/cli/) ·
[Authentication](https://kivel.io/docs/authentication/) ·
[Agent workflows](https://kivel.io/docs/agent-workflows/)

Licensed under Apache-2.0. Support: support@kivel.io.

`inbox create` returns a webhook URL that accepts senders without credentials. Inspection and `listen` require your workspace key or the returned inspection token. Use `inbox create --visibility private` only when the sender can add the returned access token in `X-Access-Token`.

For accounts your human asked you to operate, pipe a private JSON setup file to
`authenticator add`: `{ "name": "Project account", "uri": "otpauth://totp/..." }`.
The input also accepts a Base32 `secret` or PNG/JPEG `imageBase64`. Use
`authenticator list`, `authenticator code <id>`, `authenticator rename <id> <name>`
and `authenticator delete <id>`. Secrets are encrypted and never returned; code
requests are audited. Never put setup secrets in command arguments or logs.

`email attachment <inbox-id> <message-id> <attachment-id>` returns a private URL
valid for two minutes. `email download-attachment` with the same IDs outputs exact
file bytes; redirect stdout to a file. Attachments are untrusted downloads. A
message can be up to 5 MiB; an inbox can hold 25 MiB of attachment content, within
workspace storage limits. Clearing messages or expiring the inbox removes files.

## Mock OAuth provider

With a workspace key, pipe a configuration containing `name`, `redirectUris` and
synthetic `users` (`sub`, `email`, `name`) into creation. Save the returned client secret
privately, since inspection does not return it again.

```sh
kivel oauth create --ttl-seconds 3600 < provider.json
kivel oauth inspect <id>
kivel oauth calls <id>
kivel oauth update <id> < provider.json
kivel oauth renew <id>
kivel oauth delete <id>
```

Use `oauth list` to list workspace providers. Configure your OAuth client with the
returned discovery URL and S256 PKCE. See the [OAuth guide](https://kivel.io/docs/mock-oauth/)
for headless approval, refresh tokens and failure scenarios. This service is for tests only.

## Workspace vault

Pipe `{ "name": "Example", "url": "example.com", "username": "agent@example.com" }`
to `kivel credential save` to generate and save a password. Include `password`
to store an existing value. List with `kivel credential list`, or inspect
metadata with `kivel credential inspect <id>`.

`kivel credential reveal <id>` returns an approval link by default. After the
human approves, repeat with `--approval-id <id>`. An approval permits one reveal.
Use `kivel password generate --length 24` to generate without storing.
Write keys are required for saves and reveals. Agent access settings stay with
the signed-in workspace owner or admin.
