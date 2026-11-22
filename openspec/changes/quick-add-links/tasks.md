# Tasks

## 1. Parser (first pull request, pre-reviewed)

- [x] 1.1 Link token behind `Context.Links` in `internal/quickadd` (`links.go`) and `links` in `web/src/lib/nlp` (`links.ts`): verified by `go test ./internal/quickadd` and `npm test` in web/ (`links.test.ts`, `links_test.go`)
- [x] 1.2 Shared vectors for links (plain, punctuation, brackets, quoting, a URL-only line, other schemes, no host, five at most, letter case, the switch off): verified by `TestSharedVectors` and `vectors.test.ts`
- [x] 1.3 Fuzz invariants for links: verified by `go test ./internal/quickadd -fuzz FuzzParse`
- [x] 1.4 The parse route reports `fields.links` and `link` chips reading the host: verified by `TestQuickAddParseLinks` and `TestQuickAddParseSharedVectors`

## 2. The app

- [ ] 2.1 Quick add turns `links` on and shows the link chip (tint, ×, two Backspaces) in every presentation: verified by a component test per presentation
- [ ] 2.2 Saving writes the link attachments in the same `mutate()` as the task, offline, one Undo; a link equal to the origin is not attached: verified by a test of the save path with the network off
- [ ] 2.3 A multi-line paste attaches each line's links: verified by a paste test
- [ ] 2.4 Title editing reads links typed during the edit and attaches them on commit in one undoable change: verified by a title-edit test

## 3. The command line, docs and archive

- [ ] 3.1 `ot add` attaches the line's links through `POST /api/v1/tasks/{id}/attachments`: verified by a CLI test against the test server
- [ ] 3.2 `docs/quick-add.md`, `docs/attachments.md` and the parse route in `docs/api.md` and `docs/openapi.json`: verified by `make docs-check`
- [ ] 3.3 Changelog fragment and archive: verified by `openspec validate --all --strict`
