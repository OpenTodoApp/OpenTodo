# Tasks

## 1. Data

- [ ] 1.1 Entity `memory` in `internal/sync/ops.go` (`text` as content, personal scope), generated files, a Dexie table, and export. Verify with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`, `go test ./...` and a sync convergence test for two devices editing different items.
- [ ] 1.2 Local limits (20 items, 200 characters) in `lib/memory.ts` through `mutate()`. Verify with vitest for the offline and 21st-item scenarios; run `npm test`.

## 2. Assistant

- [ ] 2.1 The `remember` tool (in-app only, plans a create), the review wording and the instructions. Verify with `internal/assistant` tests (never in MCP `tools/list`), the device manifest, and a review test; run `go test ./...` and `npm test`.
- [ ] 2.2 Memory in the system text on the server and the device, with the prompt vectors regenerated. Verify with `go test ./internal/assistant` and the vitest prompt vectors.
- [ ] 2.3 Disclosure version 5 and the one-time notice. Verify with `internal/httpapi` consent tests and `assistantConsent.test.tsx`.

## 3. Settings and docs

- [ ] 3.1 The Memory section in the assistant settings (add, edit, reorder, delete), strings and stories. Verify with happy-dom tests, `make i18n-check` and `make ui-check`; run `npm run build`.
- [ ] 3.2 The privacy and settings docs, and the ROADMAP row. Verify with `make docs-check`.
