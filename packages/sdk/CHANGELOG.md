# @socket-help/sdk

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
