# Tasks

## 1. Editor

- [ ] 1.1 Make subtask on a selection in task notes and Make tasks in project and standalone notes (quick-add parsing, Inbox fallback, 50-line cap, non-checklist lines left), one `mutateMany` batch with the line replacement; unit tests for the line selection and the batch; verify with `npm test -- NotesEditor` in web/
- [ ] 1.2 Slash and context menu labels by note kind, the registry description of Ctrl+Shift+Enter, viewers offered neither; interaction tests in happy-dom for "Meeting note to tasks", "Several subtasks at once", "Viewer" and "Too many lines"; verify with `npm test` and `npm run build` in web/
- [ ] 1.3 Convergence: a test of a concurrent paragraph and line replacement merging; verify with `npm test -- notesDoc`

## 2. Routines

- [ ] 2.1 `link_back` on Create tasks in `internal/ruleval/steps.go` and `web/src/lib/rules/steps.ts`, valid only with a note source; vectors; verify with `go test ./internal/ruleval/...` and `npm test -- steps`
- [ ] 2.2 Planning of the link line on the server and the device, the plan fixture case "Checkboxes link back"; verify with `go test ./internal/rules/...` and `npm test -- rules`

## 3. Docs and checks

- [ ] 3.1 `docs/notes-and-subtasks.md`, `docs/notes-to-tasks.md`, `docs/routines.md`; strings in every catalog (`make i18n-check`); `changelog.d/Added/note-checklist-tasks.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 Run `make openspec-validate` and `make check`
