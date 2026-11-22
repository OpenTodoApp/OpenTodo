# Tasks

## 1. Parser (first pull request, pre-reviewed)

- [x] 1.1 Link token behind `Context.Links` in `internal/quickadd` (`links.go`) and `links` in `web/src/lib/nlp` (`links.ts`): verified by `go test ./internal/quickadd` and `npm test` in web/ (`links.test.ts`, `links_test.go`)
- [x] 1.2 Shared vectors for links (plain, punctuation, brackets, quoting, a URL-only line, other schemes, no host, five at most, letter case, the switch off): verified by `TestSharedVectors` and `vectors.test.ts`
- [x] 1.3 Fuzz invariants for links: verified by `go test ./internal/quickadd -fuzz FuzzParse`
- [x] 1.4 The parse route reports `fields.links` and `link` chips reading the host: verified by `TestQuickAddParseLinks` and `TestQuickAddParseSharedVectors`

## 2. The app

- [x] 2.1 Quick add (one parse context for the list's line, the phone's sheet, the capture screen and the command bar's Add mode) and Search's "Add as a task" turn `links` on; the link chip reads the host, × and two Backspaces keep it as text: verified by `quickAddLinks.test.tsx`
- [x] 2.2 Saving writes the link attachments in the task's batch (`withCompanions`, `linkAttachment.ts`, shared with Add a link…), once each and never the origin: verified by `quickAddLinks.test.ts`
- [x] 2.3 A multi-line paste attaches each line's links: verified by `quickAddLinks.test.ts` ("each line of a paste")
- [x] 2.4 Title editing reads links typed during the edit and attaches them in the same undoable change: verified by `quickAddLinks.test.ts` (title edit, Undo)

## 3. The command line, docs and archive

- [x] 3.1 `ot add --natural` attaches the line's links through `POST /api/v1/tasks/{id}/attachments`, once each, not the `--origin-url`, a retry with a key converging: verified by `TestAddNaturalLinks`
- [x] 3.2 `docs/quick-add.md`, `docs/attachments.md` and the parse route in `docs/api.md` (`docs/openapi.json` describes `fields` as an object, unchanged): verified by `make docs-check`
- [x] 3.3 Changelog fragment and archive: verified by `openspec validate --all --strict`
