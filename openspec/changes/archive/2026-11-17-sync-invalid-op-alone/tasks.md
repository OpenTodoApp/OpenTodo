## 1. Build

- [x] 1.1 `internal/sync`: `ReasonInvalid`, `SplitInvalid` (`Validate` and the reserved-device check per op)
- [x] 1.2 `handleSync`: with the feature `invalid_ops`, invalid ops are refused alone and the rest is applied and pulled; without it, the 400 as before
- [x] 1.3 Web: send `invalid_ops`; `invalid` is a held reason; the status is the error state with its own sentence (translations for every shipped language)
- [x] 1.4 Tests: `TestSyncRefusesAnInvalidOpAlone` (both modes); the client keeps an invalid op, syncs the rest, shows the error and offers it again a minute later
- [x] 1.5 Docs (`docs/sync.md`, `docs/build-a-client.md`), changelog fragment

## 2. Checks

- [x] 2.1 `go test ./internal/sync ./internal/httpapi`; web typecheck, lint and tests; `make i18n-check`; `make openspec-validate`; `make repo-check`
