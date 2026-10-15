# Implementation notes

## Status (2026-10-15)

Done on `feat/month-and-timeline-views`: 1.1 `web/src/lib/month.ts`, 3.1 `web/src/lib/timeline.ts` (with `axis`, `dayOffset`, the window constants and `PX_PER_DAY`), 5.1 (the archived `deadlines`, `someday-and-evening` and `task-dependencies` specs name `deadline` "YYYY-MM-DD", `start` date or `someday`, and `blocked_by` string ids, as `timeline.ts` reads them).

Held until the ux-overhaul group 1 and 2 PRs merge: every task in `web/src/app` (router, sidebar, `MonthView`, `TimelineView`, the header switch, `TaskListView` modes) and the docs and smoke that describe them.

## Decisions taken while implementing

- `spanOf` takes `today` and returns `late` for a past deadline, so the overdue tone needs no second date comparison in the view.
- `edges` works on the rendered rows only: a blocker outside the project never appears among them, which is the spec's rule.
