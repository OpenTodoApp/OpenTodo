# Tasks

Lands after `series-occurrences` is archived (this change modifies its "Opening a projected occurrence" requirement).

## 1. Schema (design D1)

- [x] 1.1 Add `occurrence_date` (`kDate`, default null) to the `task` entry of `internal/sync/ops.go` `Schema` with a comment citing this change; refuse it on a task without `series_id` and refuse a change once set. Verify with sync tests for the "Invalid occurrence date" scenario and a per-field LWW test (`go test ./internal/sync/...`).
- [x] 1.2 Add `occurrence_date?: string | null` to `Task` in `web/src/lib/types.ts` and to `TASK_DEFAULTS` in `web/src/lib/ops.ts`. Verify with a vitest that reads a row without the field as null (`npm test` in web/).
- [x] 1.3 Add a `task.occurrence_date` op to `internal/activity/testdata/activity_fixture.json`. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts`.
- [x] 1.4 Document the field in `docs/sync.md` and `docs/api.md` "Task fields". Verify with `npm run docs:check` in web/.

## 2. Planning, shared with the server (design D2, D3, D6, D8, D9)

- [x] 2.1 In `web/src/lib/recurring.ts`: `recordsOf`, `exceptionDates`, `nextFree`, `planActOn` (complete, skip, move, edit, detach writing `occurrenceId` records with `occurrence_date`), `planCarry`, `planRepair`; `completedOccurrences` recognises records by `occurrence_date ?? due.date`; open records count against `for N times`. Verify with vitests for every scenario of "Occurrence records", "Exceptions come from the records", "End conditions" and "Series edits and detached occurrences" (`npm test` in web/).
- [x] 2.2 Write `web/src/lib/series.fixture.json` (inputs and expected changes for each action, the carry, the repair, counted rules with open records) and run it from vitest. Extend `web/src/lib/occurrences.vectors.json` with exception cases and make `occurrencesInRange` leave out exception dates. Verify with `npm test` in web/.
- [x] 2.3 Port the planning to Go in `internal/sync/occurrences.go`; make `RecurringCompletion` skip exceptions, write `occurrence_date`, count open records and repair before writing. Run `series.fixture.json` and the vectors from `go test`. Verify with `go test ./internal/sync/... ./internal/recurrence/...`.
- [x] 2.4 Run `planRepair` after each sync pull on series the device may edit. Verify with a vitest for "Repair after a late record" and "Viewer does not repair".

## 3. Calendar and lists (design D4)

- [x] 3.1 Make projections draggable for editors in Day, Week, Month and Plan (`calendarDrag.ts`, `PlanView.tsx`, `MonthView.tsx`): a drop writes the open record via `mutateMany` with an Undo toast; not for viewers or completion-relative series. Verify with tests for "Drag a projection", "Drag one occurrence to another day" and the viewer scenarios.
- [x] 3.2 Add the projection menu (Open, Complete this occurrence, Skip this occurrence / Skip this day for habits, Move to…) with the menu primitive, opened by context click, long press, `Shift+F10` and the menu key. Verify with tests for "Skip next Monday's report", "Complete a future occurrence offline" and "Completion-relative series", and an axe check.
- [x] 3.3 Show open records in lists with the repeat mark and the tooltip "One occurrence of <series>"; "Delete" on a record writes the skip. Verify with a row test and a test that deleting writes `skipped`, not `deleted_at`.

## 4. Occurrence panel (design D5)

- [x] 4.1 Add the scope control (segmented control from `web/src/ui`) to the detail panel of recurring series, projections and records, with the defaults of D5, the occurrence header line and the Complete and Skip actions; `Shift+O` writes the current occurrence's record. Add a story in both themes. Verify with tests for every "Occurrence panel scope" scenario, `make ui-check` and the shortcut registry conflict test.
- [x] 4.2 Carry All-occurrences edits to untouched open records (`planCarry`) for the fields of D6. Verify with a test for "Rename carries to a moved session".

## 5. Habits and reminders (design D7)

- [x] 5.1 Update `web/src/lib/habits.ts` to date records by `occurrence_date`, treat open records as pending then missed, and count early records on their date; extend `habits.vectors.json`. Verify with the two new habits scenarios and the existing vectors (`npm test` in web/).
- [x] 5.2 Copy relative reminders onto a materialised record with derived ids and recomputed `fire_at`. Verify with tests for the three "Reminders of a single occurrence" scenarios (`npm test` in web/), and a server test that a REST-materialised record gets the copies (`go test ./internal/httpapi/...`).

## 6. Integrations (design D10, D11, D12)

- [x] 6.1 CalDAV out: `EXDATE` for exception dates on or after the due date, `UNTIL` instead of `COUNT` for counted rules, open records as their own VTODOs with `RELATED-TO;RELTYPE=SIBLING`. Verify with `internal/caldav` tests for "Exceptions served" and "Counted rule served with an end date".
- [x] 6.2 CalDAV in (`internal/caldav/decode.go`, `internal/httpapi/davroutes`): EXDATE added and removed, completed, cancelled and changed overrides of any occurrence date, overrides never stored, the served RRULE compared with `SameRRULE`. Verify with tests for every scenario of "Due forms and recurrence" (`go test ./internal/caldav/... ./internal/httpapi/...`), and add the rows "single occurrence (EXDATE/override)" to the verification table in `docs/caldav.md`.
- [x] 6.3 Vault: roll the series past exceptions with the shared planning, keep record lines ordinary. Verify with `internal/vault` tests for the three "Single occurrences in files" scenarios (`go test ./internal/vault/...`).
- [x] 6.4 Routes `POST /api/v1/tasks/{id}/occurrences/{date}/complete`, `/skip` and `PATCH /api/v1/tasks/{id}/occurrences/{date}` with the `signedIn` policy, refusing read and agent tokens, through `ApplyStrict`; the occurrence list reports record states. Verify with handler tests for each scenario of "Occurrences through the API and CLI", the policy test and the token-scope tests (`go test ./internal/httpapi/...`).
- [x] 6.5 `ot task occurrence <id> <date> complete|skip|edit`. Verify with `go test ./internal/cli/...`.
- [x] 6.6 Agent tools: `occurrence_date` in task output. Verify with `go test ./internal/agenttools/... ./internal/mcp/...`.
- [x] 6.7 Encrypted accounts: server-made records carry no content fields; clients display the series' title and notes for a record without them, and an unlocked device fills them in. Verify with a server test (encrypted series completed through REST writes no title op) and a vitest for the display and the fill (`npm test` in web/).

## 7. Docs and strings

- [x] 7.1 Add the new strings (scope control, menu items, header line, tooltip, toasts, accessible names) to all six locale files. Verify with the locale completeness test (`npm test` in web/).
- [x] 7.2 Update `docs/recurrence.md` (records, exceptions, acting on one occurrence, counting, repair), `docs/calendar-views.md`, `docs/caldav.md`, `docs/vault.md`, `docs/api.md` (routes, route matrix), `docs/cli.md` and `docs/e2ee.md`. Verify with `npm run docs:check` in web/.

## 8. Finish

- [x] 8.1 Manual smoke on `make dev`: the #537 example (Study, every weekday 18:00, 20 times): move Wednesday to 19:00, complete Thursday early, skip Friday, rename the series; check Week, Month, Plan, Completed, the habit grid for a habit series, a Thunderbird or DAVx⁵ fetch, and the vault.
- [x] 8.2 Run `make check`. Verify it passes.
- [x] 8.3 At archive: CHANGELOG.md entry under Unreleased ("Act on one occurrence of a repeating task: complete it early, skip it, move or edit it alone; CalDAV exceptions").

## Notes from the implementation

- A trashed record is not an exception (recordsOf reads live records only): the app never trashes one (D3), and the Undo of a completion of the current occurrence, which trashes the record it created as before, must free the date again. An Undo of an action on a later occurrence writes the untouched open record back instead.
- The occurrence panel shows the series' values read-only on This occurrence; Complete, Skip, Move to… and **Edit this occurrence** write the record, and the last opens it, where every edit (the title too) goes to the record. A finger moves one occurrence with the menu's Move to…; a long press opens the menu, so touch never drags a projection.
- Encrypted accounts: the server writes records without title and notes, and an unlocked device fills them in after the pull that brings them (seriesRepair.ts); there is no separate display fallback in the rows.
- CalDAV: a date taken out of `EXDATE` reopens its skipped record only when the client sent an `EXDATE` at all, so a client that drops the property never undoes skips. A client's own `RELATED-TO;RELTYPE=SIBLING` stays client data; only the one the server serves is replaced.
- The planning beyond the current occurrence lives in web/src/lib/seriesPlan.ts, loaded on first use.
- Manual smoke (8.1) on a local server, 2026-10-31: the #537 example through the REST routes and a CalDAV fetch (moved Wednesday open at 19:00, Thursday done, Friday skipped, the series served with `EXDATE` for the three and `UNTIL=20300204` for `for 20 times`, the moved one as its own VTODO with `RELATED-TO;RELTYPE=SIBLING`); the calendar, panel, habit grid and vault parts are covered by the component and vault tests, as no browser was available for a click-through.
