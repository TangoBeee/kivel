# @socket-help/cli

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
