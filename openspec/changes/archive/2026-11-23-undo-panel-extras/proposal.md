# Undo a task's location and Remove origin

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history. Setting or clearing a task's location (the panel's location editor and its Remove) and the task actions menu's Remove origin wrote straight through `updateTask`, so Ctrl/Cmd+Z did nothing after them.

## What Changes

- `setTaskLocation` records one step: "Location removed" when it clears the location, "Task updated" when it sets one (both existing words). `Remove origin` records one step named "Task updated". No toast, as for the panel's other single edits.
- `plainEditUndoable` compares an object value (a location) by its keys, so setting the same location again records nothing, as `calendarEditUndoable` already does for a due.
- A repeating task is written as before (carried to its series), without a step.
- A field whose value this device cannot decrypt (end-to-end encryption) is written as before, without a step, in `plainEditUndoable` and `calendarEditUndoable`: its undo would otherwise write the "[Cannot decrypt]" placeholder back over the real value on every device. This also covers renames (undo-rename) and calendar and panel date moves.

## Out of scope

- A repeating task's rotation (rotation applies only to repeating tasks, which keep their own path).
- Notes (their editor has its own text undo).

No new field, no new string, no op-log or API change, no new environment variable.
