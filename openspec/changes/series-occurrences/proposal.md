# Proposal

## Why

A repeating task shows up on one date only: its current occurrence. Completing it moves it to the next date, so until then the Day, Week and Month views show nothing for next Tuesday's "Study 18:00" or Friday's habit. Planning around repeating commitments means imagining them. Plan already draws the future occurrences as dimmed projections (`planner-view`, "Projected occurrences of recurring tasks"); the other calendar views do not (#550, from #537: "See future occurrences in Upcoming and the calendar's Day, Week, Month, and Plan views without completing earlier ones"). The research names the same gap in TickTick: habits "cannot be scheduled onto the calendar grid" (research.txt, §1 TickTick), and the gap analysis marks "Habits on the calendar grid" as Partial for this reason.

This is the first of three series changes in milestone 0.19 "Series and time" (`series-occurrences`, `series-exceptions`, `series-split`). It only shows occurrences; acting on one is `series-exceptions`.

## What Changes

- **Projected occurrences in Day, Week and Month.** The occurrences that follow a series' current one inside the shown range are drawn as dimmed, read-only blocks and rows with a repeat mark, computed on the device from the series row with the calculator Plan uses. Nothing is written. The series itself stays one ordinary block or row on its current date. Habits are recurring tasks, so they appear too.
- **One switch on the device.** The Calendar's page menu gets **Show repeating occurrences** (on by default, per device, never synced) for Day, Week and Month. Plan keeps drawing them, as its capacity depends on them.
- **Capacity counts them.** A day's planned total in Day, Week and Month adds the estimates of the projections it shows, as Plan's does, and the tooltip names them ("45m repeating").
- **Upcoming opt-in.** Upcoming's page menu gets **Show repeating occurrences** (off by default, per device), which lists the projections of the next 14 days under their days as dimmed rows, so a daily task does not flood Upcoming unless asked.
- **Opening a projection opens the series.** Clicking or pressing Enter on a projection opens the series in the detail panel with the projected date named at the top ("Next on Wednesday 14 October"). It cannot be dragged, completed or selected with `j`/`k` in this change.
- **The shared calculator moves to one module.** `projectedOccurrences` (`web/src/lib/plan.ts`) becomes `web/src/lib/occurrences.ts`, used by Plan, Day, Week, Month and Upcoming, with a Go port in `internal/recurrence` and shared vectors.
- **Read access for integrations.** `GET /api/v1/tasks/{id}/occurrences?from=&to=` lists a series' occurrence dates in a range, `ot task occurrences <id>` prints them, and the agent tools' task output carries the next three occurrence dates of a recurring task.

## Out of scope

- Acting on one occurrence (complete early, skip, move, edit it alone) and the `occurrence_date` field: `series-exceptions`.
- "This and following": `series-split`.
- Occurrences in Today, project lists, labels and saved views: they keep showing the current occurrence only. Today is about what is due now.
- Projections in CalDAV, the calendar feed or calendar sync: calendar apps already expand the served RRULE themselves.
- A Year view: `year-view` counts projections in its density marks; that change owns it.
- Multi-day spans of a repeating task: `multi-day-tasks` draws a recurring span's projections as spans.

This advances the roadmap 0.19 "Series and time" item `series-occurrences` (#550, #537). Nothing here is **BREAKING**: no op field, no migration, no environment variable.

Fixes #550
Relates to #537

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recurring-tasks`: "Recurring tasks in views" now lets Day, Week and Month draw projected occurrences; new requirements for the calendar projections and their switch, the Upcoming opt-in, and the read route, CLI command and agent output.

## Impact

- **Data model and sync:** none. Projections are derived from the synced series row and its occurrence records; no op, no row, no cache. Every device draws the same ones because the inputs and the calculator are shared.
- **Op schema / E2EE:** unchanged. Projections show the series' title, already decrypted on the device. The route returns dates only, no content.
- **Web:** new `web/src/lib/occurrences.ts` (the walk from `plan.ts`, a range API and a per-series cap), `web/src/app/calendar/*` (Day and Week projection blocks, Month projection rows, the menu switch, capacity), Upcoming's view and page menu, the detail panel's "Next on" line, `deviceStorage` keys for the two switches.
- **Server:** `internal/recurrence` gains `Occurrences(rule, due, today, done, from, to)`; `internal/httpapi` one `GET` route with the `signedIn` policy (read tokens allowed, not demo-denied: it reads); `internal/agenttools` adds `next_occurrences` to a recurring task's output.
- **CLI:** `ot task occurrences <id> [--from] [--to] [--json]`.
- **CalDAV, vault, calendar sync:** unchanged.
- **Docs:** `docs/recurrence.md` ("Projected occurrences"), `docs/calendar-views.md`, `docs/api.md` (route, route matrix), `docs/cli.md`, `docs/mcp.md`.
- **Size:** no dependency. The module mostly moves from `plan.ts`; estimated under 1.5 KB gzipped added to the web bundle and a few KB to the Go binary. Runtime memory: projections of the shown range only, capped per series.
