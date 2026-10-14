# Proposal

## Why

The calendar stops at a week. Day and Week (`web/src/app/CalendarView.tsx`) answer "when today" and "when this week", but there is no page that shows how a month fills up, and the only way to move a task by a fortnight is the date field. For a project there is no picture of time at all: the list orders by position, the board by section, and the moment `deadlines`, `someday-and-evening` and `task-dependencies` land, a task carries a start, a planned day, a deadline and blockers that nothing draws together. Linear's roadmap and Things' upcoming month are the comparison pages' remaining calendar gaps.

## What Changes

- **Month view** (`g m`, `/month`): a grid of the month's weeks, starting on the user's first day of the week, listing each day's open tasks by their due date in the viewer's zone with the same selection rules as Day and Week (`web/src/lib/calendar.ts` `calendarTasks`: open, not deleted, archived projects left out, zoned dues converted). Cells show timed tasks first, then the rest, a "+N more" that expands, and the day's planned total against the device's day length when something is estimated. Today is marked. The Day | Week | Month switch and `[`, `]`, `t` move between ranges keeping the anchor date.
- **Reschedule from the month:** dragging a task onto another day sets its due date and keeps its time; with a task selected, ← / → move it a day and ↑ / ↓ a week; `q` quick-adds a task due on the focused day. Every write is an ordinary `due` op, applied locally first, converging by last-writer-wins.
- **Project timeline:** a third project layout next to list and board (`v` cycles list → board → timeline; remembered per project per device like the board choice, `web/src/lib/sections.ts:131-137`). One row per open task in list order under its section, a day or week axis with a today line, and a bar from the earliest to the latest of its start, due date and deadline, with the due day and the deadline marked inside. Tasks with no date, or a `someday` start, sit in an "Unscheduled" group with no bar. Dependencies are drawn as arrows from the blocker's end to the dependent's start, blocked rows dimmed as everywhere else.
- **Reschedule from the timeline:** dragging a bar shifts every date the task has by the same number of days (one op per field, so two devices editing different dates both win); dragging an edge sets the start or the deadline, creating it when the task has none; ← / → and Shift+← / → do the same from the keyboard. Moving a blocker never moves its dependents.
- **Phones:** the month grid shows counts per day with the focused day's tasks listed under the grid; the timeline keeps the task names sticky and scrolls the axis.
- **Docs:** `docs/time-blocking.md` gains the Month section, `docs/views.md` the two views, `docs/sections-and-boards.md` the third layout, `docs/keyboard.md` is regenerated from `web/src/lib/shortcuts.ts`.

Depends on: `deadlines` (the `deadline` floating date), `someday-and-evening` (the `start` date-or-`someday` field; `evening` is not used here) and `task-dependencies` (`blocked_by` and the blocked state). Their roadmap rows are the contract; this change specifies only how the timeline reads and writes those fields. The Month view depends on none of them and can land first.

Out of scope:
- Scheduling automation: no critical path, no shifting of dependents, no fitting tasks into free days.
- Month cells as time grids (hours stay in Day and Week), calendar feeds from other apps (`calendar-feeds`), and a cross-project timeline.
- The "Plan from a list" tray in the Month view, and multi-select on the timeline (`bulk-edit`).
- Printing or exporting the timeline as an image.
- Virtualised rendering: a project of a few hundred open tasks renders as plain rows; see design D7.

ROADMAP: advances "Next: Parity and depth" row 11, **Month view and timeline** (`month-and-timeline-views`). Refinements to the row: the timeline is a per-project layout chosen with `v`, not a global view; bars span start → deadline with the due day as a marker; drag shifts every date of a task together, edges set start and deadline.

Nothing here is **BREAKING**: no op field, no route on the server, no environment variable. The only new data is one more value of the per-device project layout preference.

## Capabilities

### New Capabilities
- `month-view`: the month grid of due dates: which tasks appear and where, cell contents and overflow, rescheduling by drag and keyboard, navigation and phone layout.
- `project-timeline`: the per-project timeline: rows and ordering, the bar built from start, due and deadline, dependency arrows, rescheduling by drag and keyboard, zoom, and phone layout.

### Modified Capabilities
- `sections-and-boards`: "Board view" becomes one of three per-project layouts (list, board, timeline) chosen with the toggle or `v` and remembered per project per device.

## Impact

- **Web:**
  - `web/src/app/router.ts` (`month` route with an optional date), `web/src/app/Sidebar.tsx` (Month entry), `web/src/lib/shortcuts.ts` (`g m`, a Month section, timeline keys), `web/src/app/ShortcutHelp.tsx` via the shared table
  - new `web/src/app/MonthView.tsx` on a pure `web/src/lib/month.ts` (month grid math on `weekDates`, cell ordering, overflow) and `web/src/lib/dnd.ts` for day drop targets; `CalendarView.tsx` gains the Month button in its range switch
  - new `web/src/app/TimelineView.tsx` rendered from `TaskListView.tsx` like `BoardView.tsx`, on a pure `web/src/lib/timeline.ts` (spans, axis, arrows, shifting), `web/src/lib/sections.ts` (`ProjectViewMode` gains `timeline`), `ProjectHeader.tsx` (three-way toggle)
  - writes through `updateTask` and `mutateMany` only (`web/src/lib/ops.ts`)
- **Server, API, op log:** unchanged. No new route, nothing for the demo deny list.
- **Docs:** `docs/time-blocking.md`, `docs/views.md`, `docs/sections-and-boards.md`, `docs/keyboard.md` (generated), screenshots via `make docs-screenshots`, the help bundle.
- **Tests:** vitest for `month.ts` and `timeline.ts`, component tests for keyboard moves and drops, `scripts/e2e-layout.mjs` at 360, 390 and 768 px for both views, `scripts/e2e-views.mjs` screenshots.
- **Size:** no dependency; arrows are inline SVG. About 6–8 KB gzipped of client code, loaded with the app like the calendar. Server binary and memory unchanged.
