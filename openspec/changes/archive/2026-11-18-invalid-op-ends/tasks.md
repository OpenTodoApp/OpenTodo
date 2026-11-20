## 1. Build

- [x] 1.1 Server: `ReasonUnknownField`; `SplitInvalid` returns it for an unknown entity or field and `invalid` otherwise; `WithInvalidRefused` lets `Apply` restore the server values of `invalid` ops, never for a request limited to workspaces
- [x] 1.2 Web: `unknown_field` is held and `invalid` ends; the field is reset to its default when no server value comes; the notice wording is "(this server could not accept the value)" in every shipped language
- [x] 1.3 Tests: route tests for the two reasons and the restored value; `TestInvalidRefusedOpsRestoreOnlyWithoutAReach`; client tests for the held `unknown_field`, the ending `invalid` with the server value and the notice, and the reset to default
- [x] 1.4 Docs (`docs/sync.md`, `docs/build-a-client.md`), changelog fragment

## 2. Checks

- [x] 2.1 `go test ./internal/sync ./internal/httpapi`; web typecheck, lint and tests; `make i18n-check`; `make openspec-validate`; `make repo-check`
