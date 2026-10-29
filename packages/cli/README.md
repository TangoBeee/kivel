# @socket-help/cli

The command-line client for [socket.help](https://socket.help). Requires Node.js
22.13+. Commands share the HTTP API's access rules, plan limits and expiry.

After the first public release:

```sh
npx --package=@socket-help/cli socket-help --help
# Or install the command:
npm install --global @socket-help/cli
socket-help --version
```

Before publication, run `pnpm build:packages` and `pnpm cli --help` from the
repository, or install the verified SDK and CLI tarballs together. The CLI depends
on the matching SDK; it does not require the backend or media-processing packages.

```sh
export SOCKET_HELP_URL=https://socket.help
export SOCKET_HELP_API_KEY=YOUR_WORKSPACE_KEY
socket-help email create
socket-help monitor list
printf '{"passed":true}' | socket-help memory set project-a build/latest
socket-help memory get project-a build/latest
```

Use `socket-help agent login "Agent on my laptop"` to start device login. Open the
returned verification URL in your browser. Pipe a private JSON file containing
`deviceCode` to `socket-help agent token` after approval, then save the returned
key privately. The CLI prints credentials only in the response to the request that
creates them; it does not automatically persist a login or modify client config.

JSON results go to stdout, errors to stderr with exit code 1, and downloads write
raw bytes. `--help` and `--version` print plain text. Input is limited to 10 MiB;
requests time out after 90 seconds. Mutations are never automatically retried.
`SOCKET_HELP_ACCESS_TOKEN` supplies a private file token for `download` when no
`--access-token` is passed. Keep secrets out of shell history and URLs.

`listen` streams webhook events and can forward them to a local server. It runs on
your machine, and stops on Ctrl+C. The optional server SSH gateway supports bounded
commands; it does not provide this continuous listener or a shell/SCP/SFTP service.

[Command reference](https://socket.help/docs/cli/) ·
[Authentication](https://socket.help/docs/authentication/) ·
[Agent workflows](https://socket.help/docs/agent-workflows/)

Licensed under Apache-2.0. Support: support@socket.help.
