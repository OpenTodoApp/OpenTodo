# Tasks

Prerequisites: `routines-engine`, `routines-editor`, `routines-dynamic-data` and `routines-starters` are merged.

## 1. Server

- [x] 1.1 `internal/assistant`: the `draft_routine` tool built from the available catalogue, the fixed instructions, context names marked untrusted, no other tool, type check and one retry, usage tagged `routine_draft`; verify `go test ./internal/assistant/...` with a stub provider (a draft that checks, a draft fixed on retry, one that fails twice)
- [x] 1.2 `POST /api/v1/assistant/routine-draft` through `routes.handle` with the session policy and `.demoDenied()`; limits (500 characters, one turn, allowance, 10 per hour); verify `go test ./internal/httpapi/...` (401, 403 `session_required`, 403 `consent_required`, 413, 409, 429 twice, 403 `demo_restricted`; `policy_test.go`; the demo deny list test)

## 2. Web

- [x] 2.1 The Describe it entry on the Routines page with its visibility rule and the palette hint; verify happy-dom tests ("No provider", not consented yet)
- [x] 2.2 The Describe it sheet (bottom sheet), the draft in the editor with the banner and errors on cards; never saves or runs; verify happy-dom tests ("A sentence becomes a draft", "Nothing is saved")
- [x] 2.3 Encrypted accounts: the same draft through the on-device assistant and the TypeScript checker, no request to the OpenTodo server; verify `npm test` (a request-count assertion)
- [x] 2.4 Strings in the six catalogs; verify `make i18n-check`

## 3. Checks

- [x] 3.1 `docs/routines.md` (Describe it), `docs/assistant.md`, `docs/api.md`; verify `make docs-check`
- [x] 3.2 CHANGELOG Unreleased entry (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
