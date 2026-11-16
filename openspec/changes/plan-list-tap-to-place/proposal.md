## Why

On a phone, "Plan from a list" doesn't work (#1433, mavidser). The planning list covers the whole screen, so there's no calendar left to drop a task onto, and drag and drop between two panels needs both panels in sight.

## What Changes

When the panel slot covers the calendar (below 1024 px), a task in the planning list is planned with two taps instead of a drag:

- **Tap a task in the list.** The list closes and the calendar shows a bar at the bottom with the task's title and **Cancel**. The task's placement ghost appears at its proposed time, as after `s`.
- **Tap a time in the day.** The task is planned at that quarter hour as one undoable change, the usual Undo toast appears, and the list reopens for the next task.
- **Cancel**, or Escape, ends the placement without a change and reopens the list.
- **The keys keep working** during a tap placement (arrows move the ghost, Enter places it), and the bar is announced to screen readers.
- **Wide screens** (1024 px and up, where the list sits beside the calendar) keep drag and drop exactly as it is.

Not in this change: picking a time first and the task second, placing several tasks at once, and the Week below 640 px (its agenda has no times to tap) and the Month. There the list keeps today's behaviour, and the Day is one tap away.

## Capabilities

### Modified Capabilities

- `time-blocking`: the planning list adds tap-to-place where the list covers the calendar.

## Impact

- `web/src/app/calendar/SectorGroups.tsx` (`PlanRow`): a tap calls the view's new `onTap` action when the view registers one.
- `web/src/app/CalendarView.tsx`: a tap placement mode on top of the existing placement (`placing`), the bottom bar, and the reopen after it ends.
- `web/src/app/calendar/DayColumn.tsx`: a tap on an empty time during a tap placement places the task there.
- No change to data, sync, the server or the first-load bundle: all of it is in the Calendar's lazy chunk.

## Estimate

About half a day to build and test, plus the owner's test on a real iPhone and Android phone (task 3.1), since iOS touch is where we've been wrong before (#1346).
