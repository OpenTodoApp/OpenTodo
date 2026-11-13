## Why

A saved view or label page grouped by project brings tasks of several projects together, but changing where a task belongs still means opening its project or the row menu. In a project list a drop between rows reorders, a drop onto a task makes it a subtask, and the indent follows the pointer; in a view grouped by project, drops stay inside a group and only reorder (GitHub issue 1211, a precise proposal from a user).

The ordering question is settled already: a view's drops write its own manual order (`view-manual-order`), never the project's positions.

## What Changes

In the List layout of a saved view or a label page grouped by **Project**:

- **Drop into another project's group:** the task moves to that project (no section, at the end of its order there) and takes its place in the view's own order where it was dropped. Its subtasks move with it, as in a project move.
- **Drop onto a task, with Nest subtasks on:** the dragged task becomes that task's last subtask when both are in the same project; across projects it moves first. Dragging a subtask out to the group's top level makes it a top-level task of the project.
- Drops on rows of projects the person may not edit are refused with the drop line hidden, as on a read-only project.
- One undoable batch per drop, "Moved to <project>" with Undo.

Today, Upcoming and the other built-in lists, which have no grouping choice, are unchanged.

## Capabilities

### Modified Capabilities

- `manual-ordering`: drops across project groups and onto tasks in views grouped by project.

## Impact

- `web/src/app/task-list/` drag sources and targets (`useListDrag`, the drop resolver), `web/src/lib/viewOrderMove.ts` for the combined order and move batch, `web/src/lib/move.ts`. No server change, no schema field, no dependency.
- Keyboard and touch alternatives exist already (row menu **Move to…**, **Make subtask of…**), so the accessibility gate's drag alternatives stay true.
