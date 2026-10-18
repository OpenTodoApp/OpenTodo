## 1. Server

- [x] 1.1 `internal/email/parse.go`: `description` keeps the whole body when the encoded description fits `sync.MaxValueBytes`, otherwise cuts it at the longest rune boundary that fits, with the new note; verified by `go test ./internal/email/...`
- [x] 1.2 Tests: a 40 KB body is kept whole; a 200 KB body (multi-byte runes, characters JSON escapes, attachments) is cut with the note, within the limit and at a rune boundary, and the task ops it produces pass `sync` validation

## 2. Docs and checks

- [x] 2.1 `docs/email.md` states the new limit; CHANGELOG under Unreleased (Fixed, closes #161)
- [x] 2.2 `go test ./...`, `make openspec-validate`, `make check`
