# Change a block's start from its upper edge

## Why

Issue #355: on the Day and Week grid only a block's lower edge could be dragged, which changes the estimate (the end). To start a task earlier while keeping when it ends, people had to move the block and then resize it, two changes and some arithmetic. Calendar apps let you drag either edge. This was a missing feature, not a regression.

## What Changes

- A block's upper edge is a resize handle like the lower one (same hit size, mouse and touch long press, Day and Week). Dragging it sets the due time in 15-minute steps and the estimate to the time left until the unchanged end, at least 15 minutes; a block without an estimate starts from its drawn 30 minutes. The ghost and the drag label show the new start and length.
- The due time and the estimate are written as one change with an Undo offer ("Rescheduled"). A due fixed to a zone stays fixed to it.
- Keyboard twin: `Alt`+`Shift`+`↑` / `↓` on a selected block starts it 15 minutes earlier or later, keeping the end (`Shift`+arrows still change the end).
- Dragging the middle moves the block and keeps its length, as before; now covered by a test.

Not **BREAKING**: no op, API or storage change.

## Impact

- `web/src/lib/calendar.ts` (`resizeStart`, `stepStart`), `web/src/app/calendarDrag.ts`, `calendar/DayColumn.tsx`, `CalendarView.tsx`, `calendar/useCalendarKeys.ts`, `lib/shortcuts.ts`, `lib/undoActions.ts`, `app/undoable.ts`; locales (one shortcut description).
- Tests `web/src/app/calendarResizeStart.test.tsx`, `web/src/lib/calendar.test.ts`.
- `docs/place-tasks-on-the-calendar.md`, `docs/time-blocking.md`, CHANGELOG.
