# Tasks

## 1. Data

- [ ] 1.1 `note.day` and `user_prefs.daily_notes`, `daily_notes_project`, `daily_notes_template` in `internal/sync/ops.go` `Schema` with comments; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify with `go test ./...`
- [ ] 1.2 Server check: an op setting `day` is refused unless the note id is `NameID("daily-note", author + ":" + day)`; sync tests "Forged day" and "Two devices offline" (one note, template text once after the fold-back); verify with `go test ./internal/sync`

## 2. The note

- [ ] 2.1 `web/src/lib/dailyNotes.ts`: today after the day start, the name-based id (shared with `web/src/lib/ids.ts`), the draft held until the first change, creation as plain-text text only, restore from the Trash; unit tests for every scenario of "One note per day" and "Opening a daily note"; verify with `npm test -- dailyNotes` in web/
- [ ] 2.2 Settings › Notes: Daily notes, project (project picker), template (Combobox of templates); interaction test "Turn on offline"; verify with `npm test` in web/

## 3. Opening

- [ ] 3.1 `g j` (`go.dailyNote`) and `[` / `]` in the daily-note scope in the registry; palette entry; the Notes sidebar row; Today's header button; the day arrows in the note header; all hidden while off; interaction tests "Browse without writing" and "Setting off"; stories in light and dark; verify with `npm test -- shortcuts` and `npm run build` in web/

## 4. Routines

- [ ] 4.1 Step kind `daily_note` in the catalogue, both type checkers and the shared step vectors, creation planned with the run, availability `daily_notes_off`, `outside_workspace`, content step on encrypted accounts, device planner parity; verify with `go test ./internal/rules/...` and `npm test -- rules` in web/
- [ ] 4.2 The step's card; a Go test for "Converges with a device"; verify with `go test ./...`

## 5. Docs and checks

- [ ] 5.1 `docs/daily-notes.md`, `docs/notes.md`, `docs/routines.md`; strings in every catalog (`make i18n-check`); `changelog.d/Added/daily-notes.md`; the ROADMAP row; verify with `make docs` (keyboard guide regenerated) and `make docs-check`
- [ ] 5.2 Bundle within `web/bundle-budget.json` (`make bundle-budget`); run `make openspec-validate` and `make check`
