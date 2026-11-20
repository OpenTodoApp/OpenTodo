## Context

- **Drag handling:** `useListDrag` resolves a drop between rows (the line, its depth and `gapTarget`) or on a row's middle, into one `TaskTarget` `{parent_id, section_id, at}`. It calls `moveTask(id, target)`, which plans the siblings' positions with `planMove` and writes one `mutateMany`.
- **Excluded rows:** the dragged task's own subtree (`own`) is excluded as a target.
- **Existing multi-drag:** `ticked` is already passed in; drops on `drop:` targets (sidebar) move every ticked task with `dropTasks`.
- **Undo:** the bulk toast and `applyBatch` give one Undo for a batch.

## Goals / Non-Goals

**Goals:**
- One drag moves the whole selection within a list, with the three rules from the issue.
- One batch and one Undo.
- No change for an unticked drag.

**Non-Goals:** keyboard block moves; boards; label pages, views, Today and Upcoming; moving across projects within a list (the sidebar does that).

## Decisions

### D1. The moved set

When the dragged row is ticked, the moved set is the ticked tasks of the list that are shown, open and editable, in display order.
- Each is a root of the move unless an ancestor is also ticked: then it pops out (rule 3), landing right after its ticked ancestor's block in display order.
- A root carries its unticked descendants (rule 2).
- A project's tasks share one role, so a list the user may not edit takes no drop at all, as today; `planTasksMove` refuses anything else (another list, a completed or deleted task).

### D2. Targets

The excluded rows (`own`) become the union of the carried subtrees, minus the ticked rows themselves.
- **A drop on a ticked row** (its middle, or the gap right above or below it) is rewritten as `{parent_id: that row's parent, at: {after: row}}` (rule 1, the reporter's refinement). If that row is itself moved, the anchor is the nearest unmoved row before it at that level, or the top of the list.
- **Any other target** is resolved as today.
- A target whose parent would be inside the moved set is impossible after D2, so `moveTasks` keeps its cycle check only as a guard.

**Alternative considered:** making the others children of the row dropped on. That is the reporter's second choice. It is rejected because it nests tasks on a miss.

### D3. One plan, one batch

`moveTasks(ids, target)` reads the project's context once. It removes the moved roots from their sibling lists and inserts them as one block at `target.at` in the target siblings, using `planMoveMany`: fractional positions between the neighbours, and renumbering only when no gap is left, as `planMove` does. It sets `parent_id` and `section_id` on each root that changes, and writes everything in one `mutateMany`. The bulk toast offers Undo through `applyBatch`, with the previous parents, sections and positions.

### D4. Preview

While a ticked row is dragged with others, the drag ghost reads the count ("3 tasks") in place of the title. The drop line is unchanged. No other chrome is added.

## Risks / Trade-offs

- **Rule 3 can surprise.** The reporter judged it the least surprising choice, and one Undo takes it back. The docs say it in one sentence.
- **Concurrency.** Two devices moving overlapping selections converge per field by last-writer-wins, as single moves do. A renumber concurrent with a move is already covered by `manual-ordering`'s convergence rules.
- **Size.** A few hundred lines of web code at most; no server change.

## Interface budget

The drag preview's text. No new control, menu item, string or shortcut.
