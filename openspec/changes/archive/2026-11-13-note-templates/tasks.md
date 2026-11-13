# Tasks

## 1. The field

- [x] 1.1 `note.template` (`kBool`, default false, with its comment) in `internal/sync/ops.go` `Schema`; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; a sync test for concurrent marking and the viewer refusal; verify with `go test ./...`
- [x] 1.2 Use as template / Stop using as template in the standalone note's menu, hidden from viewers; interaction test "Mark offline"; verify with `npm test` in web/

## 2. Placeholders and creation

- [x] 2.1 `web/src/lib/noteTemplates.ts`: placeholder filling with date and time preferences and day start, and creation of the copy in one batch (viewer copies to the personal scope); unit tests for every scenario of "Placeholders" and "Creating a note from a template"; verify with `npm test -- noteTemplates` in web/
- [x] 2.2 Go twin in `internal/templatelib` with the shared vectors `internal/templatelib/testdata/placeholders.vectors.json`, run by Go and vitest; verify with `go test ./internal/templatelib` and `npm test -- noteTemplates` in web/

## 3. The Notes page

- [x] 3.1 New note as a split button with From template… (Combobox: user templates, then built-ins), `Shift+Q` registered in the shortcut registry, the Template word on rows and in the note header, Use template; stories in light and dark; verify with `npm test` and `npm run build` in web/
- [x] 3.2 The `template` token in `web/src/lib/noteQuery.ts`; unit test "Only templates"; verify with `npm test -- noteQuery` in web/

## 4. Library

- [x] 4.1 `templates/notes/` with Meeting, 1:1, Trip, Weekly review and Daily and translations; `scripts/templates-build.mjs` compiles them under `notes` and checks every rule of "Note template validation"; `templates/README.md`; verify with `make templates` and `make templates-check`
- [x] 4.2 `internal/templatelib` reads note templates; a test fills each one on a fixed date and compares with the web app's result; verify with `go test ./internal/templatelib`

## 5. Routines

- [x] 5.1 Step kind `note_from_template` in the catalogue, the Go and TypeScript type checkers and their shared step vectors, planned through `create_note`, `template_missing` failure, content step on encrypted accounts, device planner parity; verify with `go test ./internal/rules/...` and `npm test -- rules` in web/
- [x] 5.2 The step's card with the template picker; starter `templates/routines/monday-meeting-note/` with its test; verify with `make templates-check`, `go test ./...` and `npm test` in web/

## 6. Docs and checks

- [x] 6.1 `docs/note-templates.md`, `docs/notes.md`, `docs/routines.md`; strings in every catalog (`make i18n-check`); `changelog.d/Added/note-templates.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [x] 6.2 Bundle within `web/bundle-budget.json` (`make bundle-budget`); run `make openspec-validate` and `make check`
