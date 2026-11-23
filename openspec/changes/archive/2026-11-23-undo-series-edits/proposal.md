# Undo a repeating task's edits

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history. Every family so far left repeating tasks out: their edits carry to the series and its open records and follow the task panel's scope, so they went through `updateTask` without a step. Plan agreed with the Lead on 23 Nov: phase 1 is all-occurrences edits and rule changes; the This and following split stays without Undo.

## What Changes

- `ops.ts`: `planTaskEdit` returns the changes `updateTask` writes for a patch with no project change and no scope: the task, plus the open records still holding the previous value (`planCarry`, series-exceptions D6). `editTakesScope` tells whether the next edit takes the panel's scope (a This and following redirect, or Also past ones). `planRecurrence` is the patch `setRecurrence` writes. `updateTask` and `setRecurrence` behave as before.
- `undoActions.ts`: the single-edit families (rename, estimate, priority, deadline, assignee, This Evening, location, origin, calendar and timeline moves, the phone's Schedule sheet, start date and time zone) no longer drop repeating tasks to the no-step path. They apply `planTaskEdit`'s changes as one step with the same name. `recurrenceUndoable` changes or stops a rule as one step named "Task updated". It is used by the repeat field, its presets and the When editor's Stop repeating.
- Undo restores the series and the carried records from their stored values. Clocks leave a field another device changed since. Done, skipped and other records are never touched, so a rule change's Undo leaves past records as they were.
- Unchanged:
  - This and following: the split, which has no Undo, because undoing it would tombstone a piece whose id is derived from its date and is purged with the Trash.
  - Also past ones: already its own step.
  - Parking a repeating task: ends its repetition, without a step.
  - Moves to another project: `moveUndoable`.

No new field, no new string, no op-log or API change, no new environment variable.
