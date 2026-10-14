# Tasks

## 1. Field and server guards (design D1, D4, D5)

- [ ] 1.1 Add kind `kIDList` and `task.blocked_by` to `internal/sync/ops.go` `Schema` (distinct non-empty ids of at most `MaxIDLen`, at most 50, never the entity's own id) with a comment citing this change. Verify with table-driven `Validate` tests for a good list, a duplicate, an empty id, a self-reference, a 51-entry list and a non-array (`go test ./internal/sync/...`).
- [ ] 1.2 In `internal/sync/scope.go` `resolve`, load the scope's `blocked_by` graph once per batch, overlay the batch's accepted ops, refuse an id of another scope with `ReasonNotInScope` and a list that closes a cycle with `ReasonCycle`; accept unknown ids. Verify with sync tests: two batches that together form a cycle (second refused, `Restore` carries the first's value), a cycle inside one batch, a cycle through a completed task, an Inbox id on a shared task, an unknown id accepted (`go test ./internal/sync/...`).
- [ ] 1.3 Map both reasons to `400 invalid_input` naming the offending id in `internal/httpapi/server.go` `writeOps`, and verify the task collection accepts `blocked_by` on create and patch and returns it. Verify with httpapi tests for the PATCH, the cycle (400), the cross-scope id (400) and the unauthenticated request (401) (`go test ./internal/httpapi/...`).
- [ ] 1.4 Client data layer: `blocked_by: string[]` in `web/src/lib/types.ts`, `[]` in `TASK_DEFAULTS` (`web/src/lib/ops.ts`), left out of `COPY_FIELDS`, a label in `web/src/lib/history.ts`, a line in `web/src/lib/assistant.ts` change rendering. Verify with a vitest that applies a remote `blocked_by` op, reads it back, confirms a cross-scope move's copy has `[]`, and that an offline `mutate()` queues the op (`npm test` and `npm run build` in web/).
- [ ] 1.5 Document the field in `docs/sync.md` (a "Dependencies" subsection next to "Trees: subtasks": register semantics, derived state, cycle refusal and arrival order, scope rule) and in `docs/api.md`'s task field table. Verify with `npm run docs:check` in web/.

## 2. Derivation, cycle check and writes on the device (design D2, D3)

- [ ] 2.1 Create `web/src/lib/dependencies.ts`: `openBlockers`, `isBlocked`, `blockedMap`, `dependents`, `reaches`, `brokenEdges` (newest `(ts, device, id)` clock wins, as in `tree.ts`), `blockerCandidates` (same scope, open, live, minus self, current blockers and transitive dependents). Verify with unit tests for each spec scenario: completed, deleted and unknown blockers do not block, a recurring blocker keeps blocking, a local cycle blocks nothing and the same member is chosen on both orders of input (`npm test`).
- [ ] 2.2 Add `setBlockedBy(taskId, ids)` reading the task and its scope inside `db.transaction('rw', mutationTables(), …)`, refusing self, other scopes and cycles with a readable message, writing one `blocked_by` op. Verify with tests for the refusal messages and for a sequential add/remove pair that never loses an entry (`npm test`).
- [ ] 2.3 Handle a server refusal of `blocked_by`: confirm the existing restore path replaces the local list and that the row re-renders unblocked. Verify with a sync test that feeds a `rejected` entry with reason `cycle` plus the restore op (`npm test`).

## 3. Lists, Today, board and detail panel (design D7)

- [ ] 3.1 Add the `blockedBy` count to `web/src/app/TaskRow.tsx` (dimmed title, `lock` icon with `aria-label="Blocked by N"`, kept on board cards) and compute `blockedMap` in `TaskListView.tsx`, `SavedViewView.tsx`, `FilterView.tsx`, `DashboardView.tsx` and `CalendarView.tsx`. Verify with a component test for the marker text and a check that `c` still completes a blocked task (`npm test`).
- [ ] 3.2 Add the collapsed "Blocked N" group at the end of Today, remembered per device with the list's collapse meta, and keep Upcoming dimmed in place. Verify with a test: a blocked task due today lands in the group, completing its blocker moves it into today's rows without a reload (`npm test`).
- [ ] 3.3 Add the "Blocked by" row (multi-select picker fed by `blockerCandidates`, chips with completed blockers struck through and a "repeats" hint) and the read-only "Blocks" row in `web/src/app/task-detail/Properties.tsx`, plus the `b` shortcut through a signal in `app/signals.ts` and the entry in `web/src/lib/shortcuts.ts`. Verify with component tests for keyboard add and remove, the exclusion of dependents, and opening a task from "Blocks" (`npm test`); run `make docs` so `docs/keyboard.md` lists `b`.
- [ ] 3.4 Update `docs/tasks-and-projects.md` (a "Wait for another task" section) and `docs/views.md` (Today's Blocked group, the waiting-for saved view). Verify with `npm run docs:check` and regenerate the affected screenshots with `make docs-screenshots`.
- [ ] 3.5 Add the dimmed row, the Today group and the picker to the layout check (`scripts/e2e-layout.mjs`) at 360, 390 and 768 px. Verify with `npm run test:browser` after a build.

## 4. Filter terms (design D6)

- [ ] 4.1 Add `blocked` and `unblocked` to `Keyword` and `SIMPLE_KEYWORDS` in `web/src/lib/filter/parse.ts`, pass `tasks` on `FilterContext`, and compile both through `blockedMap` in `evaluate.ts` (a one-time warning when no tasks are given). Verify with filter tests for the three spec scenarios and `printQuery` round trips (`npm test`).
- [ ] 4.2 Document both terms in `docs/filters.md` (grammar, term table, an example "Waiting for") and `docs/labels-and-filters.md`. Verify with `npm run docs:check`.

## 5. Activity events (design D8)

- [ ] 5.1 Add kind `dependencies` to `internal/activity/activity.go` and `web/src/lib/activity.ts` after `project_id`, the `ActivityKind` union, and the wording in the Activity tab (`web/src/app/task-detail/ActivityTab.tsx`, titles resolved from local rows). Add a fixture case to `internal/activity/testdata/activity_fixture.json` with `blocked_by` and `title` in one window. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts` (`npm test`).

## 6. Unblocked notification (design D9)

- [ ] 6.1 Add `notify.Unblocked`, `UnblockedSink`, the `Multi` fan-out and the in-app storage with kind `unblocked` in `internal/notify`. Verify with a sink test that the row is stored for the assignee (`go test ./internal/notify/...`).
- [ ] 6.2 Add `emitUnblocked` in `internal/sync` after commit: completed task → dependents in the scope whose remaining blockers are all closed → assignee other than the actor. Verify with sync tests for the three spec scenarios (assignee notified once, one of several blockers, own task) (`go test ./internal/sync/...`).
- [ ] 6.3 Render the `unblocked` kind in `web/src/app/NotificationBell.tsx` and document it in `docs/notifications.md`. Verify with a component test on a fixture payload (`npm test`) and `npm run docs:check`.

## 7. CalDAV and import (design D10)

- [ ] 7.1 Serve `RELATED-TO;RELTYPE=DEPENDS-ON` per blocker in `internal/caldav/vtodo.go` `Encode`, decode `DEPENDS-ON` lines into `DependsOn`, keep the untyped line as the parent, and write `blocked_by` in `internal/httpapi/caldav_write.go` for UIDs that resolve in the same calendar scope, returning the rest to `ical_extra`. Verify with caldav tests for the three spec scenarios and a PUT that closes a cycle (refused, nothing written) (`go test ./internal/caldav/... ./internal/httpapi/...`); document the mapping row in `docs/caldav.md`.
- [ ] 7.2 Own-export round trip of `blocked_by` with id remapping in `internal/importer`, and a final relations pass for profiles that carry them (outside-file and cycle references become row warnings; undo leaves no visible blocker). Map Linear's `Blocked by` column in the `linear-csv` profile if `named-importers` has landed, otherwise record the one-line follow-up in that change's tasks. Verify with an importer round-trip test and a relations fixture (`go test ./internal/importer/...`); document in `docs/import.md`.

## 8. Integration

- [ ] 8.1 Manual smoke on `make dev` with two browser profiles in one shared project: add a blocker, see the dimmed card on the board and the Today group, complete the blocker on the other profile and watch the notification and the unblocked row; try to close a cycle from both profiles offline and confirm one edge is refused and both converge. Record the result in the change folder notes.
- [ ] 8.2 Run `make check` (go test, web test and build, docs check, ui lint). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Task dependencies: blocked by, Today's Blocked group, `blocked` / `unblocked` filters, unblocked notifications, CalDAV DEPENDS-ON").
- Mark ROADMAP.md row 6 as shipped by its change name.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
