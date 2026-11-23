# Undo indent, outdent and the Parent task field

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history, moving a task among them. Tab and Shift-Tab in a list and the task panel's Parent task field wrote straight through `setTaskParent`, so Ctrl/Cmd+Z did nothing after them.

## What Changes

- `planTaskParent` (in `ops.ts`) plans the change `setTaskParent` writes, with the same checks; `setTaskParent` writes it as before.
- `parentUndoable` records it as one step: "Subtask of “{task}”" with the new parent's title, or "Task updated" at the top level (both existing strings). No toast, as for the panel's other single edits.
- Tab and Shift-Tab in a list and the panel's Parent task use it. The same parent records nothing; a refused parent throws as before.
- A repeating task records its step too: `setTaskParent` never carried a parent to the series.

## Out of scope

- Repeating tasks' other edits, the projects' own edits (rename, colour, icon), recurrence and skipping an occurrence: later families of #1748.

No new field, no new string, no op-log or API change, no new environment variable.
