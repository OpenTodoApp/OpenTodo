## 1. The shared function

- [x] 1.1 `recurrence.Compatible` (Go) and `compatibleRule` (TypeScript), `FromRRULE` through it; verified by the `compatible` vectors in `web/src/lib/recurrence.vectors.json` (`go test ./internal/recurrence/...`, `npx vitest run src/lib/recurrenceCompatible`)
- [x] 1.2 The frozen 1.0.0 grammar and the check (`internal/recurrence/recurrence10`, `web/src/lib/testdata/`); verified by their own tests and `TestNotLinked`

## 2. Every writer

- [x] 2.1 Quick add in both parsers, with the issue's three lines on a Saturday and a Wednesday in `quickadd.vectors.json`; verified by `go test ./internal/quickadd` and `npx vitest run src/lib/nlp src/lib/recurrenceCompatible`
- [x] 2.2 CalDAV, the importer and the vault; verified by `go test ./internal/caldav ./internal/importer ./internal/vault`
- [x] 2.3 The agent tools, REST and a series split; verified by `go test ./internal/agenttools ./internal/httpapi ./internal/sync`
- [x] 2.4 The web app's `planTask`, `setRecurrence` (the repeat field) and `planSplit`; verified by `npx vitest run src/lib/recurring src/app/task-detail/whenControl`, `npm run build`

## 3. Docs

- [x] 3.1 `docs/stability.md`, `docs/recurrence.md`, `docs/quick-add.md`, `docs/repeat-rules.md`, the changelog fragment; `make docs-check`, `make openspec-validate`
