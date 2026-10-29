# Tasks

## 1. Shared calculator (design D2)

- [ ] 1.1 Move the walk from `projectedOccurrences` in `web/src/lib/plan.ts` into `web/src/lib/occurrences.ts` as `occurrencesInRange(series, records, today, from, to, zone)` returning the projections and a `capped` flag; make `plan.ts` call it. Verify with the existing `web/src/lib/plan.test.ts` and `web/src/app/planView.test.tsx` passing unchanged (`npm test` in web/).
- [ ] 1.2 Write `web/src/lib/occurrences.vectors.json` (weekly, weekday list, `every month` from the 31st, `for N times` with done records, `until`, catch-up, completion-relative, a range before the current due, the 31 cap) and `web/src/lib/occurrences.test.ts` running every vector. Verify with `npm test` in web/.
- [ ] 1.3 Add `Occurrences(rule, due, today string, done int, from, to string) []string` to `internal/recurrence` and a test that runs the same vector file. Verify with `go test ./internal/recurrence/...`.
- [ ] 1.4 Add a vitest perf guard: 200 series over a 42-day range in under 20 ms. Verify with `npm test` in web/.

## 2. Calendar views (design D3, D4, D5, D6)

- [ ] 2.1 Add the projected style to the filled-block tokens in `web/src/index.css` (faint fill, dashed leading edge) and a `ProjectedBlock` story in both themes and high contrast. Verify with `make ui-check` and `make ui-lint`.
- [ ] 2.2 Draw projections in Day and Week (`CalendarView.tsx`, `calendar/DayColumn.tsx`): timed blocks in the overlap layout, date-only chips in the unscheduled lane, accessible names "…, repeating, projected, <date> <time>". Verify with `web/src/app/calendarView.test.tsx` cases for the "Weekday study sessions" and "End condition" scenarios (`npm test` in web/).
- [ ] 2.3 Draw projections in Month (`MonthView.tsx`): rows ordered with the day's tasks, counted in "+N more", phone grid count of tasks only and projected rows in the day list. Verify with `web/src/app/monthView.test.tsx` cases for "A habit on the month" and the 360 px layout.
- [ ] 2.4 Week phone agenda (`calendar/WeekAgenda.tsx`): projected rows after the day's tasks. Verify with a test at 390 px asserting no horizontal overflow.
- [ ] 2.5 Add "Show repeating occurrences" to the calendar header overflow menu (not on Plan), stored in device storage as `calendar.projections`, default on. Verify with a test that toggles it, reloads and finds Day/Week/Month without projections and Plan with them.
- [ ] 2.6 Count drawn projections in `calendar/CapacityLine.tsx` totals and tooltips for Day, Week and Month ("45m repeating"). Verify with tests for both capacity scenarios.
- [ ] 2.7 Make projections focusable (Tab), skipped by `j`/`k` in `calendar/useCalendarKeys.ts`, not draggable, and opening the series in the detail panel with the "Projected for … · next due …" line. Verify with tests for "Open from the keyboard" and "Drag does nothing", including a viewer of a shared project.

## 3. Upcoming (design D4)

- [ ] 3.1 Add "Show repeating occurrences" to Upcoming's header overflow menu (`upcoming.projections`, default off) and list the next 14 days' projections as dimmed rows after each day's tasks, excluded from counts, with the "Repeating tasks shown up to <date>" note. Verify with a view test for "Turned on" and "Default off" (`npm test` in web/).

## 4. Integrations (design D7)

- [ ] 4.1 Register `GET /api/v1/tasks/{id}/occurrences` with the `signedIn` policy in `internal/httpapi` (new handler file `occurrences.go`), answering per D7 with the errors `invalid_input`, `not_recurring`, `not_found` and 401. Verify with handler tests for each scenario of "Occurrences for integrations", the policy test (`policy_test.go`) and a read-token test (`go test ./internal/httpapi/...`).
- [ ] 4.2 Add `ot task occurrences <id> [--from] [--to] [--json]` in `internal/cli`. Verify with a CLI test against the in-process server (`go test ./internal/cli/...`).
- [ ] 4.3 Add `next_occurrences` to a recurring task's output in `internal/agenttools`. Verify with `go test ./internal/agenttools/... ./internal/mcp/...`.

## 5. Docs and strings

- [ ] 5.1 Add the new strings ("Show repeating occurrences", "Projected for {date} · next due {due}", "{n}m repeating", "Repeating tasks shown up to {date}", "Showing the next {n} occurrences", the accessible names) to all six locale files. Verify with the locale completeness test (`npm test` in web/).
- [ ] 5.2 Update `docs/recurrence.md` ("Projected occurrences" now covers Day, Week, Month and Upcoming), `docs/calendar-views.md` (the switch, capacity), `docs/api.md` (the route and the route matrix), `docs/cli.md` and `docs/mcp.md` (`next_occurrences`). Verify with `npm run docs:check` in web/.

## 6. Finish

- [ ] 6.1 Manual smoke on `make dev`: an `every weekday 18:00` series in Week and Month in light and dark, the switch, Upcoming opt-in, a phone width, and `curl` on the route with a read token.
- [ ] 6.2 Run `make check`. Verify it passes.
- [ ] 6.3 At archive: CHANGELOG.md entry under Unreleased ("Future occurrences of repeating tasks and habits in Day, Week and Month, and optionally in Upcoming").
