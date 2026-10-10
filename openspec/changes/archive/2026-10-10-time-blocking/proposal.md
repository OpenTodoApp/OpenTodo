# Proposal

## Why

A list of due dates says what must happen, not when it will fit. People who plan their day block time for tasks, and they want the task list and the calendar to be the same thing: drag a task onto 14:00, see that the afternoon is full, pick the ten-minute tasks for the gaps. OpenTodo has the ingredients (floating due date and time, keyboard-first views, local data) but no notion of how long a task takes and no time-based view.

## What Changes

- An additive `estimate_minutes` field on tasks: an optional positive integer, entered in the detail panel with shorthand (`45m`, `1h30`) and presets, shown in task rows.
- A time-blocking calendar: Day and Week views with a 15-minute grid. A task with a due time is a block starting at that time whose height is its estimate (a default visual length when unestimated); tasks due that day without a time sit in an "unscheduled" lane above the grid.
- Drag and drop: dragging a task from the lane, from any list, or an existing block onto a slot sets its due date and time; resizing a block sets its estimate. Every drag has a keyboard equivalent.
- Overlap handling: overlapping blocks are laid out side by side with an overlap marker; each day shows total planned minutes against a configurable day length.
- A duration filter in list views ("Quick wins ≤ 15 min", "under 30 min", "unestimated") that doubles as the first duration predicate for the future filter query language.
- Everything renders from and writes to the local store, so planning works offline and converges like any other field change.

Out of scope: a separate "planned start" distinct from the due time (see design D1), external calendar feeds (`caldav`), auto-scheduling or suggestions, timers and time tracking of actual effort, team calendars, recurring blocks (a recurring task simply appears at its next occurrence), the full filter query language (`filter-query-language`).

This change advances ROADMAP.md section 4, "Duration estimates and time-blocking calendar grid" (`time-blocking`), and prepares section 3 `filter-query-language` with a duration predicate.

Not **BREAKING**: one additive task field; no renames; no new environment variable.

## Capabilities

### New Capabilities
- `time-blocking`: the duration estimate field and its entry, the Day and Week calendar grid, placing and resizing blocks by drag and keyboard, overlap and capacity display, the duration filter, and offline and convergence behaviour of all of it.

### Modified Capabilities
- none. Keyboard navigation gains `g d` and `g w`, which extends the existing `g` prefix without changing the `web-app` requirement's listed keys beyond adding two targets; recorded in the design and the shortcut help.

## Impact

- Op schema: `task.estimate_minutes` (number or null) in `internal/sync/ops.go`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`; export and REST include it.
- New views `Day` and `Week` in `web/src/app`, a drag-and-drop layer using the browser's native pointer events (no library), a block layout function (pure, tested).
- Views: duration badge in rows; duration filter chips in Inbox, Today, Upcoming and project views.
- Docs: `docs/sync.md` schema table, `docs/api.md`, README screenshots.
- No new dependencies; estimated bundle growth 8 KB gzipped for the grid and drag layer.
