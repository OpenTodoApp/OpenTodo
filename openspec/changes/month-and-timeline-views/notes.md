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
