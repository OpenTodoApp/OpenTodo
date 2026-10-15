# Implementation notes

## Status (2026-10-15)

Done on `feat/month-and-timeline-views`: 1.1 `web/src/lib/month.ts`, 3.1 `web/src/lib/timeline.ts` (with `axis`, `dayOffset`, the window constants and `PX_PER_DAY`), 5.1 (the archived `deadlines`, `someday-and-evening` and `task-dependencies` specs name `deadline` "YYYY-MM-DD", `start` date or `someday`, and `blocked_by` string ids, as `timeline.ts` reads them).

Screens done after ux-overhaul landed (2026-10-15): `MonthView`, `TimelineView`, `CalendarRangeSwitch` (Day | Week | Month), the three-way project layout, the `[` key kept for the calendar and the timeline (Shell), the layout-check entries `month` and `timeline`, and the docs.

## Decisions taken while implementing

- `spanOf` takes `today` and returns `late` for a past deadline, so the overdue tone needs no second date comparison in the view.
- `edges` works on the rendered rows only: a blocker outside the project never appears among them, which is the spec's rule.
- Month is a mode of the one Calendar destination (`calendarMode` stores `month`), not a sidebar entry; see design "Interface budget and the one Calendar destination".
- The timeline's keyboard edits go through a serial queue that reads the freshest row, so three quick presses move a task three days, as in Day and Week.
- Timeline drags use `lib/dnd.ts` against one column of drop targets per day under the rows. While a drag is lifted, the rows stop taking pointer events so the column under the pointer is found. The grab day is computed from the axis position, and the shift is the difference to the drop day.
- Section menus opened from the command palette in timeline mode use the list wording (`layout: 'list'`).
- 4.3 needed no gate: `task-dependencies` is archived, so `edges` and `isBlocked` read `blocked_by` as shipped.

## Smoke test (2026-10-16, task 5.2)

Ran `./bin/opentodo` on 127.0.0.1:18080 against a fresh data directory, with data seeded over the API. The browser was headless Chromium at 1280 and 360 px.

- **Month at 1280 px.** October 2026 showed six weeks, today marked, other months dimmed, and timed tasks with their time ("14:30 Call movers"). The page had no horizontal overflow.
- **Month at 360 px.** Each day showed its count (3 cells with tasks), with no horizontal overflow.
- **Drag and keys.** Dragging "Call movers" (due Oct 20, 14:30) onto the 22nd, then ↓ ↓ with it selected, followed it into November (`/month/2026-11-05`). It was stored as due 2026-11-05 at 14:30.
- **Timeline.** Switched "Move house" to Timeline. "Confirm dates" (start Oct 16, due Oct 19) and "Book van" (due Oct 23 09:00, deadline Oct 27, blocked by Confirm dates) showed bars, an arrow between them, the blocked row dimmed with a lock, and "Pack books" under Unscheduled. The today line was on the 16th.
- **Timeline edits.** Dragging the "Book van" bar two days right gave due Oct 25 09:00 and deadline Oct 29. Shift+→ then moved the deadline to Oct 30.
- **Remote completion.** A second browser context (another device) completed "Confirm dates" over `PATCH /api/v1/tasks/{id}`. On the first device the arrow and the dimming disappeared within the live-update round trip, without a reload.
