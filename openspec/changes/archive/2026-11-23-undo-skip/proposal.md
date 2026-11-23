# Undo skipping an occurrence

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history. Skipping an occurrence of a repeating task wrote straight through `mutateMany`, so Ctrl/Cmd+Z did nothing after it.

## What Changes

- `skipOccurrence` moves from `ops.ts` to `undoActions.ts`, with the same signature and result. It plans the skip as before (`planSkip`) and applies it as one step named "Occurrence skipped", or "Day skipped" for a habit as the calendar's skip is. Both strings already exist in every locale. No toast.
- A habit's skip also writes the occurrence record marked skipped, in the same step. Undo writes that record back as the untouched open occurrence, as `actOnOccurrenceUndoable` does, and never moves it to the Trash (series-exceptions D3: a purged id could never be written again).
- Skips run one after the other, so a skip key held down plans each skip from the last one's result, as the transaction around the old write did.
- The list's skip key, the command palette, the task panel and the repeat field use it, as do the tests that skip.

## Out of scope

- Changing or stopping a task's repeat rule: those go through the panel's edit scope (This and following, Also past ones), a larger change.

No new field, no new string, no op-log or API change, no new environment variable.
