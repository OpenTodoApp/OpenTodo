# Tasks

## 1. Schema and defaults (design D1)

- [ ] 1.1 Add `habit` and `skipped` (`kBool`) to the `task` entry of `internal/sync/ops.go` `Schema` with a comment citing this change. Add a sync test that accepts `true`/`false`, rejects `"yes"` and `null`, and shows an older-build title edit leaving `habit` intact (per-field LWW). Verify with `go test ./internal/sync/...`.
- [ ] 1.2 Add `habit?: boolean` and `skipped?: boolean` to `Task` in `web/src/lib/types.ts` (documented like `notes_doc`), and `habit: false`, `skipped: false` to `TASK_DEFAULTS` in `web/src/lib/ops.ts`. Verify with a vitest that applies a remote `habit` op to a pre-existing row and reads `true`, and reads a row without the field as `false` (`npm test` in web/).
- [ ] 1.3 Add one `task.habit` op and one `task.skipped` op to `internal/activity/testdata/activity_fixture.json` that classify as "edited". Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts` (`npm test` in web/).
- [ ] 1.4 Document both fields in the `docs/sync.md` schema table and in `docs/api.md` "Task fields" (`habit` settable; `skipped` set on occurrence records, returned in lists). Verify with `npm run docs:check` in web/.

## 2. Skip and completion records (design D2, D7)

- [ ] 2.1 In `web/src/lib/recurring.ts`: `planSkip(series, rule, now, today)` writes the occurrence record with `skipped: true` for a habit and only the `due` op otherwise; `planCompletion` writes `skipped: false` for a habit; `completedOccurrences` ignores `skipped` records. Update `skipOccurrence` in `web/src/lib/ops.ts` to pass `now`. Verify with vitests for the spec scenarios: skip a habit (record id equals `occurrenceId`, nothing in Completed), non-habit skip writes one op, two skips converge to one row, complete-then-skip of the same date ends with the later batch, `for 2 times` ends after two completions with a skip in between (`npm test` in web/).
- [ ] 2.2 In `internal/sync/recurring.go` `RecurringCompletion`, exclude records with `skipped` true from the `done` count. Verify with a test in `internal/sync/recurrence_test.go` where a `for 2 times` series with one skipped record and one completion is completed through `ApplyStrict` and still rolls forward (`go test ./internal/sync/...`).
- [ ] 2.3 Add `Habit` to `taskOut` in `internal/agenttools/data.go` and assert `update_tasks` still refuses `habit` (argument allow-list unchanged). Verify with `go test ./internal/agenttools/... ./internal/mcp/...` and a CalDAV test showing a habit round-trips as a recurring VTODO without a new property (`go test ./internal/caldav/...`).
- [ ] 2.4 Update `docs/recurrence.md` "Completing, skipping and editing" and "Sync and convergence" with the habit skip record, the complete-versus-skip convergence rule and the recovery path. Verify with `npm run docs:check` in web/.

## 3. Streak and month grid (design D3)

- [ ] 3.1 Write `web/src/lib/habits.ts` (`scheduled`, `previousScheduled`, `habitStats`, `monthGrid`) and `web/src/lib/habits.vectors.json` covering: daily with a missed day, daily with a skipped day, `every mon, wed, fri`, `every 1st` across a short month, `every 2 weeks` stepping back from the anchor, a rule change leaving old records, catch-up after being overdue, pending versus at-risk current occurrence. Verify with `web/src/lib/habits.test.ts` running every vector (`npm test` in web/).
- [ ] 3.2 Add `flame` and `minus` to `web/src/ui/icons/lucide.ts` and `names.json`. Verify with `web/src/ui/icons/usage.test.ts` and `make ui-lint`.
- [ ] 3.3 Build `web/src/app/HabitHistory.tsx`: `role="grid"`, weekday headers from `weekDays` with the user's week start, month heading and prev/next buttons, roving tabindex with arrow/Home/End/Page keys, per-cell `aria-label`, token-only classes and glyphs per state (D4 table), 24 px cells at 360 px. Add a Storybook story in both themes. Verify with a component test (keyboard month change, "6 October, skipped" label, axe check) and `make ui-check`.
- [ ] 3.4 Document the streak rules (scheduled days, pending, missed, skipped, best) in `docs/recurrence.md` under a new "Habits" section, with the catch-up example from design Risks. Verify with `npm run docs:check` in web/.

## 4. Habit in the panel, rows and filters (design D5, D6)

- [ ] 4.1 In `web/src/app/RecurrenceField.tsx`: a `Switch` "Track as a habit" shown only for an open task with a parsed calendar rule, writing `habit` through `mutate()`; for a habit, the streak line ("Streak 12 · Best 30") and `HabitHistory` fed by the field's existing records query. Verify with a component test: toggling writes one `habit` op, the switch is absent for `every 3 days after completion`, and the grid renders offline from local rows (`npm test` in web/).
- [ ] 4.2 In `web/src/app/TaskListView.tsx`, compute `habitStats` once per habit from `allTasks` and pass it to `TaskRow`; in `TaskRow.tsx`, render the streak chip (`flame` icon, count, `aria-label` "12-day streak", "at risk" when overdue) after the repeat indicator; hide `skipped` records from the Completed branch. Verify with a row test for the chip's accessible name and a view test showing a skipped record absent from Completed and a done record present.
- [ ] 4.3 Add the `habit` keyword to `web/src/lib/filter/parse.ts` and `evaluate.ts`, and make `completed` exclude `skipped` records. Verify with filter tests for `habit & due <= today`, `completed` excluding a skipped record, and `printQuery` round-tripping `habit`.
- [ ] 4.4 Update `docs/filters.md` (grammar line and terms table: `habit`), `docs/recurring-and-reminders.md` (new "Track a habit" section: switch, streak chip, skip keeps the chain, missed days do not, a "Habits" saved view from the query `habit`) and `docs/views.md` tip. Verify with `npm run docs:check` in web/.

## 5. Integration

- [ ] 5.1 Manual smoke on `make dev`: create `every weekday`, turn on the habit, complete two days (adjust the clock with the test hooks or wait), skip one, open the grid in light and dark at 360 px, complete the same day through `curl PATCH /api/v1/tasks/{id}` from a second account device and confirm the streak after sync. Record the result in the change folder notes.
- [ ] 5.2 Run `make check` (go test, web test and build, docs check, ui lint). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Habits: track a repeating task as a habit with a streak and a month history; skip keeps the chain").
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
- Move ROADMAP.md row 19 to "Shipped" as "Habits with streaks and a month history | `habits`".
