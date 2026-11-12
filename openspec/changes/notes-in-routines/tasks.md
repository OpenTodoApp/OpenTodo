# Tasks

## 1. Types and steps

- [ ] 1.1 `internal/ruleval/steps.go` and `web/src/lib/rules/steps.ts`: types Note and Notes, the Note→Notes conversion, the note steps (`find_notes`, `get_note`, `create_note`, `change_notes`, `note_to_task`) and the Note input of `note_text` (with `field`), `append_to_note`, `clear_note`, Sort/Pick/Count/Repeat over Notes; new vectors in `steps.vectors.json` for "Each note" and "A note is not text"; verify with `go test ./internal/ruleval/...` and `npm test -- steps` in web/
- [ ] 1.2 Server planning of the note steps in `internal/rules/routine_steps.go` through `internal/agenttools` (create, append, trash, to-task), labels written whole, cross-scope move as copy and trash; tests for "Append while editing", "Only standalone notes", "Undo a run" and "Note deleted in between"; verify with `go test ./internal/rules/...`
- [ ] 1.3 Device planner (`web/src/lib/rules/run/`) with the same note steps, pinned by the plan fixture; verify with `npm test -- rules` in web/

## 2. Triggers

- [ ] 2.1 Rule validation: kinds `note.created`, `note.edited`, `note.label.added`, `manual` with `on`, project and labels conditions only, note triggers need steps; matcher vectors for note conditions in `web/src/lib/rules/match.vectors.json`; verify with `go test ./internal/ruleval/... ./internal/rules/...` and `npm test -- match`
- [ ] 2.2 `observe.go` note events after a batch (imports, undo and the routine's own batches excluded) and the `note.edited` quiet wait as a job in `internal/tenant/jobs.go`; tests "Many saves, one event", "Restart during the wait", "Import does not fire note triggers"; verify with `go test ./internal/rules/... ./internal/tenant/...`

## 3. Runs, scope and encryption

- [ ] 3.1 `POST /api/v1/rules/{id}/run` with `note_id` (`note_required`, both ids `invalid_input`, 401 without credentials, 403 for `read` tokens); MCP `run_routine` `note_id`; verify with `go test ./internal/httpapi/... ./internal/mcp/...`
- [ ] 3.2 Shared and workspace scope for notes (`shared.go`, `workspace.go`), viewer's note fails before writing, pin unavailable in shared routines; tests for every scenario of "Notes in shared and workspace routines"; verify with `go test ./internal/rules/...`
- [ ] 3.3 Encrypted accounts: content flags on the note steps, device runs for them, server runs for label/project/date-only routines; tests "Labels on the server", "Text on the device"; verify with `go test ./internal/rules/...` and `npm test -- deviceRun`

## 4. Editor, note menu, CLI

- [ ] 4.1 Editor: note pickers ("each note", "the note", "Find notes…", "A specific note…" with the Combobox), the live count of Find notes, Run now asking for a note; interaction tests in happy-dom; verify with `npm test` and `npm run build` in web/
- [ ] 4.2 Run routine… in a standalone note's menu and the palette while a note is open (lazy with the Notes chunk), offline message; verify with `npm test -- notes` and `make bundle-budget`
- [ ] 4.3 `ot routine run --note`, notes and note triggers by name in routine files; verify with `go test ./internal/cli/...`

## 5. Use cases, docs and checks

- [ ] 5.1 Add the five note cases to `web/src/lib/rules/usecases.json` (and starters where they fit); verify with `go test ./internal/rules/ -run UseCases` and `npm test -- usecases`
- [ ] 5.2 Docs: `docs/routines.md`, `docs/automations.md`, `docs/notes-to-tasks.md`, `docs/mcp.md`, `docs/cli.md`; strings in every catalog (`make i18n-check`); `changelog.d/Added/notes-in-routines.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 5.3 Run `make openspec-validate` and `make check`
