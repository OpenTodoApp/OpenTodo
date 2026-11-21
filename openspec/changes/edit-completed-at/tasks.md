# Tasks

- [ ] Add the `completed` part to `facetsOf` (`web/src/lib/facets.ts`):
  show it on the When line for a task with `completed_at` set and no
  `recurrence` and no `series_id`, reading `Completed {instant}` in the
  datetime style.
  - Verification: the panel shows `Completed 14 Oct, 12:00 PM` for a
    task completed then; a recurring task shows no Completed part.
- [ ] Add `CompletedEditor.tsx` (`web/src/app/task-detail/`): day and
  time inputs prefilled from `completed_at`, every pick committing at
  once through `updateTask(id, { completed_at: ms })`, inputs refusing
  a future day or time, a write never later than now.
  - Verification: changing the day moves the stored `completed_at`
    and the Completed logbook group; a future day cannot be picked.
- [ ] Open the editor from `PartEditor` (`Facets.tsx`, `case
  'completed'`), with Clear reopening the task
  (`updateTask(id, { completed_at: null })`); add the Completed row to
  the Schedule facts in `TaskFacts.tsx`.
  - Verification: the row opens the editor; Clear reopens the task
    and the Completed part disappears.
- [ ] Pin the server behaviour in `internal/httpapi/completed_test.go`:
  `PATCH /api/v1/tasks/{id}` with a past `completed_at` returns 200,
  reads back with that exact value, and stamps `completed_by` with the
  caller.
  - Verification: `go test ./internal/httpapi -run TestRestPatchAcceptsPastCompletedAt`.
- [ ] Cover the panel flow in a web test (`web/src/app/task-detail/`):
  a completed plain task shows the Completed row with the formatted
  instant, editing the day writes the new `completed_at`, a recurring
  task shows no row, a viewer sees the value without a control.
  - Verification: `npm test -- <file>` passes, plus `npm run
    typecheck` and `eslint` on the touched files.
- [ ] Add `changelog.d/Added/edit-completed-at.md` and one line in
  `docs/tasks-and-projects.md` under "Complete, reopen and delete".
  - Verification: `make openspec-validate` passes, `make docs-check`
    passes, `node scripts/i18n-check.mjs` reports no new problem.
