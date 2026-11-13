# Design

## Context

`view-manual-order` gives label pages and saved views their own order (`manual_order` on the label or view, a bounded list of ids) and keeps every drop inside the row's group (its D4). Project lists use `ordering.ts` and `move.ts` for position, section and parent writes, and `useListDrag` resolves a drop into before/after/onto with a depth from the pointer.

## Goals / Non-Goals

**Goals:** in a view grouped by project, the drops of a project list: reorder within a group, move across groups, nest onto a task.

**Non-Goals:** Today and the other built-in lists; boards (a view's board columns are its groups and already keep drops inside); groupings other than Project (a drop across label or priority groups would have to edit labels or priority, which is a different gesture); sections inside a view's group.

## Decisions

### D1. Only when the grouping is Project and the layout List

The resolver allows a cross-group target only when the view's `group_by` is `project`. Every other grouping keeps D4 of `view-manual-order`.

### D2. A drop across groups is a move, then a place

The batch: `project_id` (and `section_id: null`, `parent_id: null` unless D3 applies) on the task, the subtasks' `project_id` as `move.ts` writes them for a project move, then the view's `manual_order` with the task placed before or after the drop row. One undoable batch (`applyBatch`), so Undo restores both the project and the order.

### D3. Nesting follows Nest subtasks

With **Nest subtasks** on, a drop onto a task (the middle of the row, or the pointer indented past the row's depth) makes the dragged task its last subtask, in the target's project. With it off the view is flat, so there is no onto target and a drop is before or after. Depth limits and cycle checks are `ordering.ts`'s, as in a project.

### D4. Permissions

A target in a project the person may not edit (viewer, read-only share) shows no drop line and refuses the drop, and a task the person may not edit cannot be picked up, as today.

## Risks / Trade-offs

- **A move the person did not mean** (a long drag ending in the next group): the drop line names the target group's project while dragging ("Move to Home"), and Undo is in the toast.
- **Encrypted accounts:** all on the device, through the op log, like project moves.
