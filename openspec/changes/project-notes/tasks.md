# Tasks

## 1. Schema, roles and opaque-field maps (design D1, D3, D5)

- [x] 1.1 Add `description` (`kString`) and `notes_doc` (`kDoc`) to `project` in `internal/sync/ops.go` `Schema`, and `"project.notes_doc"` to `DocFields`, each with a comment citing this change. Extend `internal/sync/notesdoc_test.go` so an invalid project `notes_doc` is refused with `ErrInvalidOp` and a 256 KB one is accepted. Verify with `go test ./internal/sync/...`.
- [x] 1.2 Let an editor write `project.description` and `project.notes_doc` in `internal/sync/scope.go` `CanWrite`, keeping every other project field admin-only. Add sharing tests: an editor's note op is stored and served to every member; an editor's `name` op and a viewer's `description` op are refused with `forbidden` and the server value travels back. Verify with `go test ./internal/sync/...`.
- [x] 1.3 Add `"project.notes_doc"` to `internal/activity.Opaque` and to `OPAQUE` in `web/src/lib/activity.ts`, and a project note edit (a `description` and `notes_doc` pair) to `internal/activity/testdata/activity_fixture.json` that must yield one `edited` event naming `description` only. Verify with `go test ./internal/activity/...` and `npm test` in web/ (`activity.test.ts`).
- [x] 1.4 Apply the demo notes cap to the project fields in `internal/demo/sandbox.go` `CheckOp`; test that a 20 KB project `description` is accepted and a 40 KB one refused in a sandbox. Verify with `go test ./internal/demo/...`.
- [x] 1.5 Add a history and a webhook test showing a project note change set lists `description` and never `notes_doc` (`internal/sync/trash_test.go`, `internal/webhook`). Verify with `go test ./...`.
- [x] 1.6 Document the fields in `docs/sync.md` (entity table rows for `project.description` and `project.notes_doc`; "Mergeable documents" reworded for "a task's or a project's note"), the role change in `docs/sharing.md`, and `docs/api.md` "Project fields". Verify with `npm run docs:check` in web/.

## 2. Encryption (design D7)

- [x] 2.1 Add `description` and `notes_doc` under `project` in `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`. Extend the e2ee tests: a project note op from an encrypted account carries ciphertext for both fields and plaintext `position`; an encrypted `notes_doc` over `MAX_DOC_CHARS_ENCRYPTED` is refused before any op exists; the enable-time migration encrypts an existing project description. Verify with `go test ./internal/e2ee/...` and `npm test` in web/ (`e2ee.test.ts`, `crypto.test.ts`).
- [x] 2.2 Add "project descriptions and notes" to the list of hidden fields in `docs/e2ee.md`. Verify with `npm run docs:check`.

## 3. Client data layer (design D1, D2)

- [x] 3.1 Add `description` and `notes_doc` to `Project` in `web/src/lib/types.ts` and to the `project` defaults in `web/src/lib/ops.ts`; add `'project.notes_doc': 'description'` to `DOC_FIELDS` in `web/src/lib/docfields.ts`. Verify with `npm run build` in web/ and a test that a project created by `createProject` writes no note ops and reads back with an empty note.
- [x] 3.2 Make `withNotePairs`, `foldNote` and `reconcileNote` entity-generic (row via `tableFor(entity)`, projection field via `DOC_FIELDS`), with `foldNote(entity, id)`. Run every case of `web/src/lib/notes.test.ts` for both `task` and `project` through a parameterised table (merge before write, projection in the same batch, fold of a newer plain-text `description`, stale plain-text write loses, legacy note upgrade, size refusal). Verify with `npm test` in web/.
- [x] 3.3 Add `canEditProjectNote(role)` to `web/src/lib/sharing.ts` (editor, admin, owner) with a roles test. Verify with `npm test` in web/ (`roles.test.ts`).
- [x] 3.4 Add a sync test showing a remote project `notes_doc` op is merged with the local document and republished only when the union adds something (`sync.test.ts` or `notes.test.ts`). Verify with `npm test` in web/.

## 4. Project note in the view (design D4)

- [x] 4.1 Generalise `web/src/app/NotesEditor.tsx` to `{entity, id, value, clock, readOnly}`, writing through `mutate(entity, id, {notes_doc})` and calling `foldNote(entity, id)`; update `task-detail/TaskDetail.tsx` accordingly. Verify that the existing task-notes component tests pass unchanged (`npm test` in web/).
- [x] 4.2 Build `web/src/app/ProjectNote.tsx`: rendered Markdown in a `<section aria-label="Project note">`, "Add a note" for users who may edit, nothing for viewers on an empty note, in-place editor on activation or <kbd>Shift</kbd>+<kbd>P</kbd> (ignored in text fields), <kbd>Esc</kbd> saves and returns to the rendered view, fold after about eight lines remembered in Dexie `meta` per project. Mount it in `TaskListView.tsx` right after `ProjectHeader`. Verify with component tests: viewer sees no control on an empty note; editor presses Shift+P, types, presses Esc, and the project row holds the projection; the note renders above the board; an axe check passes in light and dark.
- [x] 4.3 Add `Shift+P` to `web/src/lib/shortcuts.ts` ("Edit the current project's note") and regenerate the keyboard guide with `make docs`. Verify with the `shortcutHelp` test and `npm run docs:check`.
- [x] 4.4 Confirm project history and activity label a note change as "notes" (`historyVersions.ts`, `activityRuns.ts`, `HistoryPanel` for `entity="project"`) with a test that restores a project `description` revision and folds it. Verify with `npm test` in web/.
- [x] 4.5 Write the "Project notes" section of `docs/tasks-and-projects.md` (what it is for, who can edit it, Shift+P, folding) and add the help id. Verify with `npm run docs:check` in web/.

## 5. Server readers and import (design D5, D6)

- [x] 5.1 Add `untrusted_text.description` and `encrypted` to `projectOut` in `internal/agenttools/read.go` and to the project resource; leave `update_project` unchanged. Tests: `list_projects` returns the Markdown; an encrypted account gets the placeholder with `encrypted: true`; `update_project` with `description` fails with an argument error. Verify with `go test ./internal/agenttools/... ./internal/mcp/...`.
- [x] 5.2 Read `description`/`notes`/`note` on project objects in `genericProfile` and `itemsProfile` (`internal/importer/profile_json.go`), carry it on `KindProject` rows, and write it in `planForeign` for created projects only. Tests for the three spec scenarios (create with description, reused project untouched, undo removes it). Verify with `go test ./internal/importer/...`.
- [x] 5.3 Add an export/import round-trip test for a project with both note fields (`internal/httpapi` export test and `internal/importer` opentodo profile test). Verify with `go test ./...`.
- [x] 5.4 Document the project description keys in `docs/import.md` (`json-generic`, `json-items` tables) and the `list_projects` fields in `docs/mcp.md`. Verify with `npm run docs:check`.

## 6. Integration

- [x] 6.1 Manual smoke on `make dev`: write a note with a heading and a check list on a project, switch to the board, open the same project in a second browser profile as an editor and edit concurrently, confirm both edits survive and `GET /api/v1/projects/{id}` shows the Markdown; PATCH `description` from curl and confirm the device folds it. Record the result in the change folder notes.
- [x] 6.2 Run `make check` (go test, web test and build, ui lint, docs check). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Project notes": the pinned note, who can edit it, API fields, encryption).
- After archiving, set `specs: [project-notes]` on `docs/project-notes.md` (the docs check accepts live spec names only) and run `npm run docs:check`.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
