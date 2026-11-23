# Undo the task panel's Start date, Multi-day switch and time zone

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history. In the task panel's When editor, the Do on date, the deadline and Someday already are, but the Start date picker (setting or clearing a start), the Multi-day switch and the time-zone chip (fixing a time to a zone, or releasing it) wrote straight through `updateTask`, so Ctrl/Cmd+Z did nothing after them.

## What Changes

- Each goes through `calendarEditUndoable` (undo-calendar-moves): one step in the undo history named with the existing words "Rescheduled", without a toast, as for the panel's other single edits.
- A change to the values a task already has records nothing. A repeating task is written as before (carried to its series, following the panel's scope), without a step.

## Out of scope

- Undo for a repeating task's start or zone.

No new field, no new string, no op-log or API change, no new environment variable.
