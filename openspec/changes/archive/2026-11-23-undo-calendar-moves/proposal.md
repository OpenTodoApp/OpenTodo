# Undo a calendar move from the keyboard or in the timeline

## Why

#1748 (justinsteven) asks for moving a task to be a step of the undo history. Dropping a task on a calendar day already is, with its toast, but moving it with the keyboard was not: the arrow keys in Month and Plan, the Day and Week keys and a span's ends wrote straight through `updateTask`, as did the timeline's arrow keys and its drags. So Ctrl/Cmd+Z after a few arrow presses did nothing.

## What Changes

- A date move from the keyboard in Month, Plan, Day and Week (including a span's ends) records one step in the undo history per key press, named with the existing words "Rescheduled" (a Day or Week length key that changes only the estimate keeps the panel's words "Estimate 45 min"). No toast, as for the other single keyboard edits (priority, This Evening).
- In the timeline, the arrow keys (dates and deadline) record a step the same way, and a drag (a bar, one of its edges, or an unscheduled row) records a step with the Undo toast, as a drop on a calendar day does.
- A move to the dates a task already has records nothing. A date on a parked task takes it out of Someday in the same step, as before.
- A repeating task is written as before (carried to its series), without a step.

## Out of scope

- Undo for a repeating task's move.
- Calendar slots (their own entity and actions).

No new field, no new string, no op-log or API change, no new environment variable.
