## 1. Server

- [x] 1.1 `sync.WithoutCommentLimit` (`comments.go`), read by `newApplyBatch` (`apply.go`). Verify: `go test ./internal/sync -run TestCommentRateLimit` (an import-marked batch of five comments passes a limit of two, a device after it still gets its two, then is refused; a comment authored by another account is still refused)
- [x] 1.2 Todoist note rows read into `Row.Comments` (`profile_todoist.go`); `plan_comments.go` plans comments with the header, `MaxComments` and the description fallback with one preview note. Verify: `go test ./internal/importer -run TestTodoist` (order and header, missing author or date, cap, long note)
- [x] 1.3 The job applies with `WithoutCommentLimit`; Undo includes comments (`service.go`). Verify: `TestTodoistNotesImportJob` (100 comments under the default 60-a-minute limit, a device still limited, re-import writes nothing, Undo removes them); golden `rich.zip.golden.json` updated with `-update`

## 2. Docs and checks

- [x] 2.1 `docs/switch/todoist.md`, `docs/switch/README.md` and `docs/import.md` say notes become comments, with the cap. Then `make docs` and `make docs-check`
- [x] 2.2 Changelog fragment `changelog.d/Changed/todoist-notes-comments.md`; `go test ./internal/importer/... ./internal/sync/... ./internal/httpapi/...`, `go vet ./...`, `make openspec-validate`
