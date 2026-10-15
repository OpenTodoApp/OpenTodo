# Tasks

## 1. Field and sync (design D1, D5)

- [x] 1.1 Add `kDate` to `internal/sync/ops.go` (`checkKind`: null or a valid `YYYY-MM-DD` via `isDate`), `task.deadline: kDate` in `Schema` with a comment citing this change, and the value `deadline` for `kReminderKind`. Add sync tests: a valid deadline op applies, `2026-02-30`, a timed string and an object are refused, two offline writes converge by `(ts, device)`, and a `deadline` reminder kind is accepted. Verify with `go test ./internal/sync/...`.
- [x] 1.2 Add a `task.deadline` op to `internal/activity/testdata/activity_fixture.json` that yields an `edited` event. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts` (`npm test` in web/).
- [x] 1.3 Client data layer: `Task.deadline?: string | null` and `ReminderKind` `'deadline'` in `web/src/lib/types.ts`, `deadline: null` in `TASK_DEFAULTS` (`lib/ops.ts`), `deadline` in `COPY_FIELDS` and in `createTask`'s input, `deadline` in `lib/history.ts` with compact date formatting, `deadlineFireAt` and the deadline branch of `reminderFollowUps`. Verify with vitests: a remote `deadline` op reads back as the string and an old row reads `null`; an offline `updateTask(id, {deadline})` queues one op; setting the deadline rewrites `fire_at` of a `deadline` reminder in the same batch and leaves `relative` ones alone; rescheduling `due` leaves `deadline` reminders alone (`npm test` in web/).
- [x] 1.4 Confirm the REST collection accepts and returns `deadline` through the schema path and refuses `next friday` with 400 `invalid_input`; add `handleExport` round-trip coverage in `internal/httpapi`. Verify with `go test ./internal/httpapi/...`.
- [x] 1.5 Document the field in `docs/sync.md` (schema table) and `docs/api.md` (task fields), and the `deadline` reminder kind in both. Verify with `npm run docs:check` in web/.

## 2. Countdown, Today and Upcoming (design D2, D3)

- [x] 2.1 Add `describeDeadline(deadline, today)` to `web/src/lib/dates.ts` and `inToday`/`inUpcoming` predicates to `lib/views.ts`. Verify with table-driven tests for `3d`, `Today`, `2d over` and the three tones, and for the spec scenarios "Scheduled later than a past deadline" and "Deadline still ahead" (`npm test`).
- [x] 2.2 Vendor the Lucide `hourglass` icon into `web/src/ui/icons/lucide.ts` and render the countdown chip in `TaskRow.tsx` with it (and the full date as `title`). Verify with a row test for the three labels, `npm test` (including `usage.test.ts`) and `make ui-lint`.
- [x] 2.3 Switch Today and Upcoming selection and grouping in `TaskListView.tsx` and the Today count in `Sidebar.tsx` to the shared predicates; deadline-only tasks sort after dated ones within an Upcoming day. Verify with component tests for the four Today/Upcoming spec scenarios and a count test; `npm run build` in web/.
- [x] 2.4 Update `docs/views.md` (Today and Upcoming rules) and `docs/tasks-and-projects.md` (the countdown). Verify with `npm run docs:check`.

## 3. Entry in the panel and the list (design D2)

- [x] 3.1 Add the **Deadline** row to the detail panel's properties card next to Due, using the existing `DateField` (`web/src/app/datetime/`), clearable, read-only text for viewers; show the countdown words and the full date. Verify with component tests: typing `fri` writes the next Friday, clearing writes null, a viewer sees text; an axe check in the test.
- [x] 3.2 Add `d` in `useListKeys.ts`/`listActions.ts` opening the inline date field for the selected task (mirroring `e`), and list it in `lib/shortcuts.ts` and the help overlay. Verify with a test that `d`, `2026-11-06`, Enter writes the deadline and that `d` inside a text field types a letter.
- [x] 3.3 Document the row and the key in `docs/tasks-and-projects.md` and `docs/keyboard.md`. Verify with `npm run docs:check`.

## 4. Filters (design D4)

- [ ] 4.1 Extend `web/src/lib/filter/parse.ts` (`deadline` field, `no deadline`, printing) and `evaluate.ts` (null never matches). Verify with tests for the four spec scenarios and the new error message after `no` (`npm test`).
- [ ] 4.2 Extend the server-side query parser in `internal/filter` with the same tokens and add a shared example file both test suites parse. Verify with `go test ./internal/filter/...` and `npm test`.
- [ ] 4.3 Update `docs/filters.md` (grammar, term table, error table, an example "deadline this week, no plan"). Verify with `npm run docs:check`.

## 5. Reminders (design D5)

- [ ] 5.1 Offer deadline presets in `RemindersField.tsx` ("On the deadline", "1 day before the deadline", custom) when the task has a deadline, and render the chip ("1 day before the deadline"). Verify with component tests for creating one with offset −1440 and for the chip text, plus the existing reminder tests.
- [ ] 5.2 Update `docs/reminders.md` and `docs/recurring-and-reminders.md`. Verify with `npm run docs:check`.

## 6. CalDAV (design D6)

- [ ] 6.1 Encode: `DUE;VALUE=DATE` from the deadline and `DTSTART` from `due` when a deadline exists (`internal/caldav/vtodo.go`); keep today's output otherwise. Verify with golden tests for the "Deadline served", "Deadline without a due date" and "Due date with time" scenarios and the unchanged recurring anchor.
- [ ] 6.2 Decode: differing `DTSTART`/`DUE` → due and deadline (date part, time dropped), equal → due only, mapped `DTSTART` no longer stored in `ical_extra`; write the `deadline` op through `ApplyStrict` in `internal/httpapi/caldav_write.go`. Verify with tests for "Start and due from a client", "Timed DUE with a start keeps the day" and a round trip through PUT and GET; `go test ./internal/caldav/... ./internal/httpapi/...`.
- [ ] 6.3 Update `docs/caldav.md` "What maps to what". Verify with `npm run docs:check`.

## 7. Quick add (design D7)

- [ ] 7.1 Add `deadlineWords` to the six vocabularies and the phrase match in `lib/nlp/dates.ts`/`parse.ts` (first phrase wins, time after it stays in the title, dismissable chip), `deadline` in `ParseResult` and `QuickAddInput`, the chip in `QuickAdd.tsx`, and pass it to `createTask`. Verify with tests for the four spec scenarios and that `Pay rent by friday` still sets the due date (`npm test`).
- [ ] 7.2 Document the word per language in `docs/quick-add.md`. Verify with `npm run docs:check`.

## 8. Recurrence (design D8)

- [ ] 8.1 Replace `moveDue` with `moveDates` in `web/src/lib/recurring.ts` (deadline shifted by the due delta on completion, skip and detach; record and copy keep theirs) and apply the same rule in `internal/httpapi/recurring.go`; add a shared vector to `recurrence.vectors.json`. Verify with tests for the "Weekly report" and "Catch-up keeps the distance" scenarios on both sides (`npm test`, `go test ./internal/httpapi/...`) and the existing convergence test extended with a deadline.
- [ ] 8.2 Update `docs/recurrence.md` ("How the next occurrence is computed"). Verify with `npm run docs:check`.

## 9. Import (design D9)

- [ ] 9.1 Add `Deadline` to the importer row model and the field op in `internal/importer/plan.go`, the CSV `deadline` column (`profile_csv.go`, recognised list, row error on a bad value), the generic JSON `deadline` key (no longer a due alias; date-time → date plus warning) and the Todoist JSON mapping in `profile_json.go`, the own-export round trip, and the `deadlines` total. Verify with profile tests for the CSV, generic JSON, invalid and own-export scenarios and the completeness test; `go test ./internal/importer/...`.
- [ ] 9.2 Coordinate with `named-importers`: its Todoist `DEADLINE` and Things `deadline` land in the row field instead of a warning (its tasks 3.3 and 6.1). Verify with its golden previews once both branches merge, and record the archive-order note from design D9 in whichever change archives second.
- [ ] 9.3 Show the deadlines total on the import screen and update `docs/import.md` (CSV table, `json-generic` keys, mapping rules). Verify with `npm run docs:check` and the import screen test.

## 10. Integration

- [ ] 10.1 Manual smoke on `make dev`: set a deadline from quick add, the list (`d`) and the panel; check the countdown, Today and Upcoming placement and the sidebar count across midnight (change the system date); add a deadline reminder; fetch the task from a CalDAV client and edit its start and due there; import the CSV example. Record the result in the change folder notes.
- [ ] 10.2 Run `make check` (go test, web test and build, ui-lint, docs check, openspec validate). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes; if `named-importers` archived first, reconcile its Things to-do requirement with "Imported deadlines" (design D9).
