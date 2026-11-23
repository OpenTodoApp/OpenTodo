# Undo This Evening

## Why

#1748 (justinsteven) asks that more changes be undoable. Marking one task for This Evening, or taking it out (the `E` key in a list, the task panel's This Evening, the command palette's "Mark … for This Evening"), recorded nothing in the undo history (#1488). The palette's day-part commands and the bulk action already undo as one step.

## What Changes

- Marking one task for This Evening, or taking it out, records one step in the undo history with the day-part words ("Moved to This Evening", "Moved to Any time"). Ctrl/Cmd-Z or the palette's Undo puts it back; redo marks it again. No toast is added.
- A task already in that state records nothing.
- A repeating task is written as before (carried to its series, following the task panel's scope), without a step for now.

## Out of scope

- Undo for a repeating task's day part (as for priority, a later change).
- Other action families of #1748 (this is the third, after undo-task-create and undo-priority).

No new field, no op-log or API change, no new environment variable.
