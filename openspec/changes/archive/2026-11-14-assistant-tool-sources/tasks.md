# Tasks

## 1. Server
- [x] 1.1 `internal/assistant/sources.go`: `SourceOf(tool, result)` per D1 and `Events.Source`, called after a successful read in `Loop.Run`; verified by `go test ./internal/assistant` (the shared vectors and a loop test)
- [x] 1.2 `internal/httpapi/assistant.go` streams `source`; verified by `go test ./internal/httpapi -run Assistant`

## 2. Web
- [x] 2.1 `web/src/lib/assistantSources.ts` (`sourceOfResult`, `sourceOf` for events) with the shared vectors; verified by `npm test`
- [x] 2.2 The device loop emits `source` after a successful read; verified by `loop.test.ts`
- [x] 2.3 The stream reader stores `sources`, `AnswerContent` places `SourcesLine` (lazy); verified by vitest and a story
- [x] 2.4 Strings in every catalog; verified by `make i18n-check`

## 3. Docs
- [x] 3.1 `docs/assistant.md` and a changelog fragment; verified by `make docs-check`, `npm run build` and `node scripts/bundle-budget.mjs`
