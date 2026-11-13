# Proposal

## Why

Today and Upcoming have **Display options → Nest subtasks**, which lists a subtask under its parent as a project's list does. Saved views in the List layout did not, so a view of a project's work showed parents and their subtasks as unrelated rows (issue #1108, and point 5 of #1089).

## What Changes

- **Nest subtasks on a saved view's List layout**, the same switch and tree as Today's: per group, a matching subtask under its matching parent, the top-level rows in the view's order, subtasks in their manual order, folds per device. A match whose parent does not match keeps its parent's path.
- Stored on the view as `subtasks` (`"nested"` or `""`), an additive field; REST accepts and returns it.
- The view's manual order (Alt+arrows, Reorder) moves top-level rows when nested.
- Not on the Board layout.

## Capabilities

### Modified Capabilities

- `custom-views`: the Display panel's Nest subtasks.

## Impact

`internal/sync/ops.go` (`view.subtasks`) and its generated files, `internal/httpapi/views.go`, `web/src/lib/viewNest.ts`, `web/src/app/SavedViewView.tsx`, `web/src/app/task-list/collapsedRows.ts` (the per-device fold state, moved out of the list model to share it), docs.
