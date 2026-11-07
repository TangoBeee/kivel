---
'@kivel/sdk': minor
'@kivel/cli': minor
---

Renamed from `@socket-help/sdk` and `@socket-help/cli`. The client class is now `Kivel`, the error class `KivelError`, the CLI command `kivel`, and the default URL `https://kivel.io`. The CLI reads `KIVEL_URL`, `KIVEL_API_KEY` and `KIVEL_ACCESS_TOKEN`, and still accepts the old `SOCKET_HELP_*` names.
