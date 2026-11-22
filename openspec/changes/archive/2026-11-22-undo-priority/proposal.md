# Undo a priority change

## Why

#1748 (justinsteven) asks that more changes be undoable. Setting one task's priority (keys 1–4 in a list or the task panel, the row menu, the task panel's priority, the command palette, Vim) recorded nothing in the undo history (#1488), while the same change on ticked tasks already undoes as one step. A wrong key press had no way back but setting the old priority by hand.

## What Changes

- Setting one task's priority records one step in the undo history, with the bulk action's words for one task ("Priority 1 set on 1 task"). Ctrl/Cmd-Z or the palette's Undo restores the previous priority; redo sets it again. No toast is added.
- Setting the priority a task already has records nothing.
- A repeating task is written exactly as before (its change carries to the series' occurrences and follows the task panel's "This and following" and "Also past ones"), without a step for now.

## Out of scope

- Undo for a repeating task's priority, which needs the series' carry inside one batch: a later change.
- Other action families of #1748 (this is the second, after undo-task-create).

No new field, no op-log or API change, no new environment variable.
