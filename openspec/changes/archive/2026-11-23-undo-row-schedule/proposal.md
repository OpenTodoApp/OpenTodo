# Undo the phone's Schedule sheet and Park in Someday everywhere

## Why

#1748 (justinsteven) asks for moving a task to be a step of the undo history. On a phone, the Schedule sheet (a left swipe on a row, or Schedule… in the touch menu) set a date or parked the task through `updateTask` and `parkTask`, so nothing could be undone, while the same choices elsewhere (a drop on a calendar day, the list's park key, Triage, the When editor) already offer Undo. The command palette's "Park … in Someday" and the park key of saved views, the reviews and the method lists also parked without a step.

## What Changes

- The Schedule sheet's Today, Tomorrow, Next week and Pick a day… record one step named "Rescheduled" with the Undo toast, through `calendarEditWithUndo` (undo-calendar-moves). A parked task comes back in the same step, as before.
- Its Someday, the palette's "Park … in Someday" and the park key of `useListKeys` (saved views, Daily check, reviews, method lists) go through `parkWithUndo`, as the task lists' park key already does: one step named "Moved to Someday" with the Undo toast.
- A repeating task is written as before, without a step: a new date is carried to its series, and parking ends its repetition (`parkUndoable` now hands a repeating task to `parkTask`, which `parkWithUndo` callers such as Triage and the When editor also get).

## Out of scope

- Undo for bringing a task back from Someday (it has none anywhere yet).
- The sheet's "Add to {slot}" choices (calendar slots have their own actions).

No new field, no new string, no op-log or API change, no new environment variable.
