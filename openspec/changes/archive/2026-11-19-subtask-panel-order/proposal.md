# Proposal

## Why

Issue #1577: a task's subtasks can be put in order only in a project's list, by dragging the rows there. Where a task lists its subtasks (the task panel, the task page) they stay in the order they were added, so reordering a checklist means leaving the task.

## What Changes

- **Each open subtask has a move handle** where a task lists its subtasks with the add line (the task panel and the task page), when two or more are open and the user can edit the task. The handle is the one of a rotation's turn order and of frames (`MoveHandle`): drag it with a mouse, a pen or a finger; press Alt+Up or Alt+Down on it for one place, Alt+Shift+Up or Alt+Shift+Down for the top or bottom; or click it for Move up and Move down.
- **The write is the project list's** (`lib/move` `moveTask`, `moveTaskBy`): positions only, one batch, locally first, so the order is the same in every list and on every device.
- **Completed subtasks have no handle** and keep their place; a move is among the open ones, as in a project list.
- **Unchanged:** the stored fields, the server, sync, the row's expanded subtasks in a list (no add line, no handle), what a viewer sees. No new op field, route, setting, dependency, string or shortcut. Not **BREAKING**.

Out of scope: sorting subtasks by another order (#1578); moving a subtask out of its parent from the task panel.

Roadmap: a follow-up of `manual-ordering`; listed as `subtask-panel-order`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `manual-ordering`: new requirement "Reorder subtasks where a task lists them".

## Impact

`web/src/app/task-detail/Subtasks.tsx`, a new `web/src/app/task-detail/subtaskOrder.ts`, their tests. First load +0.8 KB gzip (690.8 → 691.6 KB): `Subtasks.tsx` is reached from a list row's expanded details.
