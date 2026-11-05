# Proposal

## Why

Upcoming lists tasks under day headings, but a task cannot be moved to another day from there: the order is fixed, so dragging does nothing. The calendar's Week, Month and Plan already move a task to another day by dragging it, keeping its time. People expect the same in Upcoming, on a phone too ([#892](https://github.com/OpenTodoApp/OpenTodo/issues/892)).

## What Changes

- In Upcoming, drag a task onto another day's group (its heading or its tasks) and the task moves to that day, keeping its time, with Undo. On a touch screen, press and hold the task first, then move it, as for manual order.
- The date that moves is the one that lists the task under its day: the due date; for a task listed by its deadline (no due date), the deadline; for a deferred task without a project or due date, its start; a multi-day task moves whole.
- A drop on the task's own day changes nothing. Tasks the user may only view (a read-only shared project) cannot be picked up.
- With a task selected, <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>Shift</kbd>+<kbd>→</kbd> move it a day earlier or later by the same rule, never before today.
- Month and Plan use the same move-to-day function, so the calendar and Upcoming move a task the same way.

No new environment variable, field or route. The op log format is not **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities

- `web-app`: Upcoming accepts a dragged task on another day, and Shift+←/→ move the selected task a day.

## Impact

- `web/src/lib/dayMove.ts` (the shared rule), `web/src/lib/undoActions.ts` (the `day:` drop), the Upcoming day groups in `web/src/lib/listGroups.ts` and `web/src/app/task-list/ListGroups.tsx`, the key in `web/src/lib/shortcuts.ts` and `web/src/app/task-list/useListShortcuts.ts`; Month and Plan call the shared rule.
- Docs: `docs/today-and-upcoming.md`, the keyboard guide.

Out of scope: dropping onto a day Upcoming does not show (a day with no tasks has no heading; the date picker or the keys reach it), reordering within a day (Upcoming's order stays by date), dragging a projected occurrence of a repeating task (the calendar does that), and drops on Today's Earlier, part-of-day, This Evening and Blocked groups in Start with Today. Advances no open ROADMAP item.
