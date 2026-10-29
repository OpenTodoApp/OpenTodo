# Tasks: multi-day-tasks

Lands after `series-occurrences`, `series-exceptions` and `series-split` (roadmap sequencing).

## 1. Field and data layer
- [ ] 1.1 Add `span` (`kBool`, default `false`) to the task schema in `internal/sync/ops.go`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify with a `go test ./internal/sync/...` case that `"yes"` is rejected and `true` round-trips, and an `npm test` case in `web/src/lib/ops.test.ts` for the default.
- [ ] 1.2 Add a pure helper `spanOf(task)` in `web/src/lib/span.ts` (first day, last day, length, or null per D1) with unit tests for the valid range, `someday`, equal dates, missing due and a due with a time; verify with `npm test`.
- [ ] 1.3 Copy `span` onto occurrence records, materialised occurrences and detached copies in `web/src/lib/recurring.ts` and `internal/sync/recurring.go`; verify with the existing recurring tests extended by a span case (`npm test`, `go test ./internal/sync/...`).
- [ ] 1.4 Accept and return `span` on `POST`/`PATCH /api/v1/tasks` and in the export, `400 invalid_input` for a non-boolean, 401 without auth; verify with `go test ./internal/httpapi/...` and document the field in `docs/api.md`.

## 2. Setting a span
- [ ] 2.1 Add the **Multi-day** switch to the When popover's Start segment with the D2 writes (one batch) and the range in the When line; verify with a happy-dom interaction test (turn on without a start, with an earlier start, turn off) and `npm run build`.
- [ ] 2.2 Show the range chip in place of the date chip in `TaskRow` for a span; verify with a `TaskRow` test that the visible property count is unchanged and the story renders in the workbench (`make ui-check`).

## 3. Calendar drawing
- [ ] 3.1 Lay out task spans in the Week and Day all-day strip above event chips with continuation ends, "Day n of m" and "until HH:MM", never on the grid; verify with `web/src/app/calendarView.test.tsx` cases from the "Spans in the calendar" scenarios.
- [ ] 3.2 Draw spans as bars across Month week rows with continuation, counting toward "+N more"; verify with `web/src/app/monthView.test.tsx` cases (span across two weeks).
- [ ] 3.3 List spans in each covered Plan column with their position, moving as a whole when dragged; verify with `web/src/app/planView.test.tsx`.
- [ ] 3.4 Keep capacity on the due day only in `web/src/lib/plan.ts` and the Day/Week/Month totals; verify with a unit test (8-hour span counts on the due day).
- [ ] 3.5 Draw projected occurrences of a span series as dimmed spans (D6) in the projection helper shared with `series-occurrences`; verify with a unit test of the weekly two-day span scenario.
- [ ] 3.6 Add Week and Month stories with spans (light, dark, 375 and 1280 px) and update the visual baselines; verify with `make ui-check`.

## 4. Moving and resizing
- [ ] 4.1 Drag middle, leading end and trailing end in Week and Month, and trailing-end extension of a date-only task, each one undoable batch; verify with interaction tests for each scenario of "Moving and resizing a span".
- [ ] 4.2 Register `Shift+Left/Right` and `Alt+Shift+Left/Right` in `web/src/lib/shortcuts.ts` for the calendar views and wire them in `useCalendarKeys.ts`; verify with the registry's conflict test and keyboard tests.
- [ ] 4.3 Hide drag ends and ignore the keys for tasks the user may not edit; verify with a viewer test.

## 5. Lists
- [ ] 5.1 Apply the Upcoming and Today rules of D5 in the list selection (`web/src/lib/dayLists.ts` or its successor); verify with unit tests for "Upcoming before the trip", "During the trip" and the modified `start-dates` scenarios.
- [ ] 5.2 Phone layout: the Week agenda lists a span under each covered day, the Month counts each covered day, no drag ends below 640 px; verify with tests at 390 px and the layout check at 360 px.

## 6. Integrations
- [ ] 6.1 CalDAV: serve and read `X-OPENTODO-SPAN` in `internal/caldav/vtodo.go` and `decode.go`, invalid values to `ical_extra`; verify with `go test ./internal/caldav/...` and document in `docs/caldav.md`.
- [ ] 6.2 Calendar feed: spans as all-day events with exclusive `DTEND` in `internal/calfeed`; verify with `go test ./internal/calfeed/...` and document in `docs/calendar-feeds.md`.
- [ ] 6.3 Calendar sync: write spans as all-day events regardless of the option and read changed all-day events back into start and due through `ApplyStrict` with device `calsync:<connection-id>`; verify with `go test ./internal/calsync/...` against `calsynctest` and document in `docs/calendar-sync.md`.
- [ ] 6.4 Vault: `[span:: true]` in `internal/vault/line.go`, reported bad values; add a line to the fixture vault and the shared vectors; verify with `go test ./internal/vault/...` and update `docs/vault.md`.
- [ ] 6.5 CLI: `--span`/`--no-span` on `ot add` and `ot edit`, range in `ot show`; verify with `go test ./internal/cli/...` and update `docs/cli.md`.
- [ ] 6.6 Agent tools: `span` in task results and create/update arguments in `internal/agenttools`; verify with `go test ./internal/agenttools/... ./internal/mcp/...`.

## 7. Docs, copy and release
- [ ] 7.1 Add "Tasks that span days" to `docs/calendar-views.md` and the start-date section of `docs/tasks-and-projects.md`; verify the docs check passes (`make check`).
- [ ] 7.2 Translate the new strings (Multi-day, "Day {n} of {m}", "until {date}", range chips, shortcut descriptions) in `messages.json`, `de`, `es`, `fr`, `it` and `pt`; verify with the locale completeness test (`npm test`).
- [ ] 7.3 Run `make check`, `go test ./...`, and `cd web && npm test && npm run build`; add the CHANGELOG entry under Unreleased when archiving.
