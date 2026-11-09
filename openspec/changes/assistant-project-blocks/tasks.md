# Tasks

## 1. Tools

- [ ] 1.1 The six display tools with schemas and checks, and offering by relevance (`displayOffered` with view), mirrored in the manifest. Verify with `internal/assistant` tests (offered sets per view and skill, strict limits kept) and `blocks.vectors.json`; run `go test ./...`.

## 2. Renderers

- [ ] 2.1 Read-only modes and renderers for board, timeline and activity. Verify with happy-dom tests per block and `budget.test.tsx`; run `npm test`.
- [ ] 2.2 Renderers for stats, task and habit, and stories for all six. Verify with happy-dom tests and `make ui-check`; run `npm test` and `npm run build`.
- [ ] 2.3 Instructions and eval scenarios. Verify with `go test ./internal/assistant` and a recorded eval run.
