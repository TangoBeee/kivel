# @kivel/sdk

## 0.6.0

### Minor Changes

- d096583: Add email threads, draft delivery and inbox rule inspection.
- a0aa58d: Renamed from `@socket-help/sdk` and `@socket-help/cli`. The client class is now `Kivel`, the error class `KivelError`, the CLI command `kivel`, and the default URL `https://kivel.io`. The CLI reads `KIVEL_URL`, `KIVEL_API_KEY` and `KIVEL_ACCESS_TOKEN`, and still accepts the old `SOCKET_HELP_*` names.

### Patch Changes

- 4185eed: Examples name the client `kivel`, and new API keys start with `kv_`. Existing `sh_` keys keep working.

## 0.5.1

### Patch Changes

- d69807d: Expose the original query string on captured webhook requests.

## 0.5.0

### Minor Changes

- 026f194: Add workspace TOTP authenticators and private email attachment links and downloads.
- 2f1574b: Add mock OAuth and OpenID Connect provider creation, configuration and lifecycle commands.

## 0.4.1

### Patch Changes

- 4b9c802: Default webhook inboxes to receiving without sender credentials while keeping inspection private. Document explicit private receiving and its X-Access-Token requirement.

## 0.4.0

### Minor Changes

- 858c876: Support owned agent email inboxes with Free lifetimes, paid custom addresses, inbox listing and webhook forwarding, guarded outbound mail and combined event waits. Email creation now requires an account and uses activeDays instead of generic resource retention settings.

    Add scheduled callbacks and delivery waits, authenticated SMTP capture, DNS monitor baselines and status-page lifecycle methods.

    Add scripted LLM responses and streaming configuration, guarded phone number and inbound SMS methods, and email history clearing. Surface paid-feature errors with the required plan and upgrade URL.

    Keep all event waits inside the configured client timeout and preserve structured upgrade fields in CLI and SSH errors.

## 0.3.1

### Patch Changes

- 5bd1172: Clarify beta installation, include package changelogs and automate reviewed client releases. Read the CLI version from its package manifest so SDK and CLI releases can version independently.

## 0.3.0

Initial public beta release.
