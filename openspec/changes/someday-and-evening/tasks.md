# Tasks

## 1. Fields and sync (design D1)

- [x] 1.1 Add `kStart` to `internal/sync/ops.go` (`checkKind`: null, `"someday"` or a valid `YYYY-MM-DD`), `task.start: kStart` and `task.evening: kBool` in `Schema` with a comment citing this change. Add sync tests: valid values apply, `later`, `2026-02-30`, a timed string and `"yes"` are refused, and concurrent date and Someday writes converge to one value by `(ts, device)`. Verify with `go test ./internal/sync/...`.
- [x] 1.2 Add `task.start` and `task.evening` ops to `internal/activity/testdata/activity_fixture.json` that yield `edited` events. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts` (`npm test` in web/).
- [x] 1.3 Client data layer: `Task.start?: string | null` and `Task.evening?: boolean` in `web/src/lib/types.ts`, defaults in `TASK_DEFAULTS`, both in `COPY_FIELDS` and `createTask`'s input (`lib/ops.ts`), both in `lib/history.ts` with their formatting. Verify with vitests: remote ops read back, old rows read `null`/`false`, an offline `updateTask` queues one op per field (`npm test`).
- [x] 1.4 Confirm the REST collection accepts and returns both fields and refuses `start: "later"` with 400 `invalid_input`; cover the export round trip in `internal/httpapi`. Verify with `go test ./internal/httpapi/...`.
- [x] 1.5 Document both fields in `docs/sync.md` and `docs/api.md`, including that a parked task keeps `start` when a rule or due date is written through the API. Verify with `npm run docs:check` in web/.

## 2. State predicates, lists and counts (design D2, D3, D4)

- [x] 2.1 Add `isSomeday`, `isDeferred`, `isStarted`, `isActive`, `inAnytime`, `openCount` to `web/src/lib/views.ts` and extend `inToday`/`inUpcoming` from `deadlines` with the started, parked and hard-date rules. Verify with table-driven tests for every spec scenario of "Deferred tasks", "Started tasks in Today" and "Someday" (`npm test`).
- [x] 2.2 Add `parkTask`/`unparkTask` to `lib/ops.ts` (one batch: `start`, `due: null`, `evening: false`, rule cleared through the existing due rule) and the un-park rule in `updateTask` when `due` or a date `start` is written on a parked task. Verify with tests for "Park a scheduled task", "Un-park by scheduling" and "Park offline on two devices" (`npm test`).
- [x] 2.3 Switch `TaskListView.tsx` selection and grouping to the predicates: Today gains the This Evening group and started rows with the "Started" chip, project and Inbox views gain the Later group with "Starts"/"Someday" chips (after sections when present), Upcoming and Anytime use `inUpcoming`/`inAnytime`. Switch `Sidebar.tsx` counts to `openCount` and the extended `inToday`. Verify with component tests for "Evening group", "Deferred until next week", "Hard date wins", "Started and due later" and a counts test; `npm run build` in web/.
- [x] 2.4 Vendor the Lucide `archive` and `layers` icons; render the Someday, Starts/Started and evening (`moon`) chips in `TaskRow.tsx`. Verify with a row test, `npm test` (including `usage.test.ts`) and `make ui-lint`.
- [x] 2.5 Update `docs/views.md` (Today, Upcoming, counts) and `docs/tasks-and-projects.md` (Later group, chips). Verify with `npm run docs:check`.

## 3. Someday and Anytime views, panel and keys (design D5)

- [x] 3.1 Add the `someday` and `anytime` routes (`router.ts`), sidebar entries after Upcoming, `g o` / `g n` chords in `Shell.tsx` and `lib/shortcuts.ts`, the two views in `TaskListView.tsx` grouped by project with their placeholders and empty states, and `start: 'someday'` as the Someday route's quick-add default. Verify with component tests for "Open Someday offline", "Capture in Someday", "Undated and active" and "Results follow sync"; `npm run build`.
- [x] 3.2 Add the **When** row (Anytime / date field / Someday) and the **Evening** switch to the detail panel's properties card next to Due; read-only text for viewers; the date field refuses a start after the due date with an inline message. Verify with component tests for "Start after due refused", parking from the row, toggling evening, and an axe check.
- [x] 3.3 Add `n`, `Shift+N` and `Shift+E` to `useListKeys.ts`/`listActions.ts` (refused for viewers), list them in `lib/shortcuts.ts` and the help overlay. Verify with tests for "Defer from the list" and "Park with the keyboard", and that the keys type letters inside a text field.
- [x] 3.4 Document the views, the row and the keys in `docs/views.md`, `docs/tasks-and-projects.md` and `docs/keyboard.md`; add the `someday` and `anytime` screen ids to the help bundle. Verify with `npm run docs:build` and `npm run docs:check`.

## 4. Filters (design D2)

- [x] 4.1 Extend `web/src/lib/filter/parse.ts` (`someday`, `deferred`, `evening` keywords, `no start`, the `start` date field, printing) and `evaluate.ts`. Verify with tests for the four spec scenarios (`npm test`).
- [x] 4.2 Extend `internal/filter` with the same tokens and add them to the shared example file from `deadlines`. Verify with `go test ./internal/filter/...` and `npm test`.
- [x] 4.3 Update `docs/filters.md` (grammar, term table, the `no` error message, an example "waiting, not parked"). Verify with `npm run docs:check`.

## 5. Quick add (design D6)

- [x] 5.1 Add `somedayWords` and `eveningWords` to the six vocabularies, move `tonight` out of `dayWords`, match `someday` only when no date phrase matched, add `start` and `evening` to `ParseResult`, `QuickAddInput` and the chips in `QuickAdd.tsx`, and pass them to `createTask`. Verify with tests for the five spec scenarios and that `tonight` still resolves to today's date (`npm test`).
- [x] 5.2 Document the words per language in `docs/quick-add.md` and the Someday capture context under "Views and defaults". Verify with `npm run docs:check`.

## 6. CalDAV (design D7)

- [x] 6.1 Encode `X-OPENTODO-START` and `X-OPENTODO-EVENING` in `internal/caldav/vtodo.go`; decode valid values into the task input, leave invalid ones in `extra`, and emit `start`/`evening` ops in `internal/httpapi/caldav_write.go`. Verify with tests for the four spec scenarios and a PUT/GET round trip; `go test ./internal/caldav/... ./internal/httpapi/...`.
- [x] 6.2 Update `docs/caldav.md` "What maps to what". Verify with `npm run docs:check`.

## 7. Recurrence (design D8)

- [ ] 7.1 Extend `moveDates` in `web/src/lib/recurring.ts` and the REST completion path in `internal/httpapi/recurring.go` to shift a date `start`; add a shared vector. Verify with tests for "Weekly task hidden until its day" and "Evening routine" on both sides (`npm test`, `go test ./internal/httpapi/...`) and the existing convergence test with a start date.
- [ ] 7.2 Update `docs/recurrence.md`. Verify with `npm run docs:check`.

## 8. Import (design D9)

- [ ] 8.1 Add `Start` and `Evening` to the importer row model and the field ops in `internal/importer/plan.go`, the CSV `start` and `evening` columns in `profile_csv.go` (parked-and-dated keeps the date with a warning), and the own-export round trip. Verify with profile tests for the CSV, parked-and-dated and own-export scenarios and the completeness test; `go test ./internal/importer/...`.
- [ ] 8.2 Coordinate with `named-importers`: Things `start = 2` → parked, `startBucket = 1` → evening in its task 6.1 instead of warnings. Verify with its golden previews once both branches merge; record the archive-order note from design D9 in whichever change archives second.
- [ ] 8.3 Update `docs/import.md` (CSV table, mapping rules, Things section once `named-importers` lands). Verify with `npm run docs:check`.

## 9. Integration

- [ ] 9.1 Manual smoke on `make dev`: park a task with `n` and from quick add, defer one with `Shift+N`, mark one for tonight, check Today (groups, Started chip), Upcoming, Anytime, Someday, the Later group and the counts, then move the system date past a start day and confirm the task appears in Today without a reload; round-trip a parked task through a CalDAV client; import the CSV example. Record the result in the change folder notes.
- [ ] 9.2 Run `make check` (go test, web test and build, ui-lint, docs check, openspec validate). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased.
- Archive with `/opsx:archive` after `deadlines`, then confirm `npx @fission-ai/openspec validate --all --strict` passes; if `named-importers` archived first, reconcile its Things to-do requirement with "Imported start dates, Someday and evening" (design D9).
