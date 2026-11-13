# @kivel.io/cli

## 0.10.1

### Patch Changes

- 10de14b: Publish releases to the npm latest tag, so `npm install @kivel.io/sdk` and `npm install --global @kivel.io/cli` install the newest version. Install instructions no longer need `@beta`.
- Updated dependencies [10de14b]
    - @kivel.io/sdk@0.10.1

## 0.10.0

### Minor Changes

- ad5805c: Add live event streams to the SDK and use them in the webhook listener.

### Patch Changes

- ad5805c: Reconnect webhook listeners after transient network failures with backoff and resume from the last processed event cursor.
- Updated dependencies [ad5805c]
    - @kivel.io/sdk@0.10.0

## 0.9.0

### Minor Changes

- fde4ed4: Show clear messages and structured details for plan allowances and request rate limits.

### Patch Changes

- fde4ed4: Read the machine code from the new `code` field while retaining support for older servers. The HTTP `error` field remains a readable message. Exhausted hosted tool, email, and resource allowances return 402. Request rate limits return 429. Timed limits include `Retry-After`, which the SDK and CLI expose to callers.
- Updated dependencies [fde4ed4]
- Updated dependencies [fde4ed4]
- Updated dependencies [fde4ed4]
    - @kivel.io/sdk@0.9.0

## 0.8.0

### Minor Changes

- 7290344: Add test wallets, x402 paywalls and mock checkouts with approval-aware payments, ledgers and test outcome controls.

### Patch Changes

- Updated dependencies [7290344]
    - @kivel.io/sdk@0.8.0

## 0.7.0

### Minor Changes

- 7cbd3fc: Add workspace credential storage, password generation and approved reveals.

### Patch Changes

- Updated dependencies [7cbd3fc]
    - @kivel.io/sdk@0.7.0

## 0.6.1

### Patch Changes

- b6437db: Published as `@kivel.io/sdk` and `@kivel.io/cli`, under the npm organization for kivel.io.
- Updated dependencies [b6437db]
    - @kivel.io/sdk@0.6.1

## 0.6.0

### Minor Changes

- d096583: Add email threads, draft delivery and inbox rule inspection.
- a0aa58d: Renamed from `@socket-help/sdk` and `@socket-help/cli`. The client class is now `Kivel`, the error class `KivelError`, the CLI command `kivel`, and the default URL `https://kivel.io`. The CLI reads `KIVEL_URL`, `KIVEL_API_KEY` and `KIVEL_ACCESS_TOKEN`, and still accepts the old `SOCKET_HELP_*` names.

### Patch Changes

- 4185eed: Examples name the client `kivel`, and new API keys start with `kv_`. Existing `sh_` keys keep working.
- Updated dependencies [d096583]
- Updated dependencies [4185eed]
- Updated dependencies [a0aa58d]
    - @kivel.io/sdk@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [d69807d]
    - @socket-help/sdk@0.5.1

## 0.5.0

### Minor Changes

- 026f194: Add workspace TOTP authenticators and private email attachment links and downloads.
- 2f1574b: Add mock OAuth and OpenID Connect provider creation, configuration and lifecycle commands.

### Patch Changes

- Updated dependencies [026f194]
- Updated dependencies [2f1574b]
    - @socket-help/sdk@0.5.0

## 0.4.1

### Patch Changes

- 4b9c802: Default webhook inboxes to receiving without sender credentials while keeping inspection private. Document explicit private receiving and its X-Access-Token requirement.
- Updated dependencies [4b9c802]
    - @socket-help/sdk@0.4.1

## 0.4.0

### Minor Changes

- 858c876: Support owned agent email inboxes with Free lifetimes, paid custom addresses, inbox listing and webhook forwarding, guarded outbound mail and combined event waits. Email creation now requires an account and uses activeDays instead of generic resource retention settings.

    Add scheduled callbacks and delivery waits, authenticated SMTP capture, DNS monitor baselines and status-page lifecycle methods.

    Add scripted LLM responses and streaming configuration, guarded phone number and inbound SMS methods, and email history clearing. Surface paid-feature errors with the required plan and upgrade URL.

    Keep all event waits inside the configured client timeout and preserve structured upgrade fields in CLI and SSH errors.

### Patch Changes

- Updated dependencies [858c876]
    - @socket-help/sdk@0.4.0

## 0.3.1

### Patch Changes

- 5bd1172: Clarify beta installation, include package changelogs and automate reviewed client releases. Read the CLI version from its package manifest so SDK and CLI releases can version independently.
- Updated dependencies [5bd1172]
    - @socket-help/sdk@0.3.1

## 0.3.0

Initial public beta release.
