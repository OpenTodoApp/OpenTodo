# Undo a rename

## Why

#1748 (justinsteven) names renaming a task as a change that can't be undone. A title edit that also sets attributes ("Milk tomorrow p1") is one undoable step with a toast, but a plain rename went straight to `updateTask` in `commitTitleEdit`, so it recorded nothing in the undo history (#1488).

## What Changes

- Changing only one task's title records one step in the undo history, named with the existing words "Renamed “Milk” → “Oat milk”". This covers every title editor: the list's inline editor, the task panel and Triage all commit through `commitTitleEdit`. No toast, as for the panel's other single edits.
- Committing the same title records nothing.
- A repeating task is written as before (carried to its series, following the panel's scope), without a step.

## Out of scope

- Undo for a repeating task's title.
- Note titles (a separate entity with its own editor).

No new field, no new string, no op-log or API change, no new environment variable.
