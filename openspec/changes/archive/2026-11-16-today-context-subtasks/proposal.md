# Proposal

## Why

With **Nest subtasks** on, Today can show a task while hiding open steps that have no date or are scheduled for later. Seeing those steps beneath the task lets people work from Today while keeping the dates they chose ([#1404](https://github.com/OpenTodoApp/OpenTodo/issues/1404)).

## What Changes

- In Today's main day groups, show eligible undated and future-dated direct subtasks under a parent that already appears there as a Today task. Keep their stored dates and show their future date information in the row.
- Use the existing tree and a quieter title treatment. Context rows support individual completion, opening and editing with the same permissions as the task elsewhere.
- In **Group by Project**, drag a contextual subtask onto a regular Today task to change its parent, preserving its dates. This works across editable projects in the same sharing scope.
- An explicit **Make top-level for today** drop promotes the subtask into the chosen project group and schedules it for today. Undo restores the previous parent, project and scheduling in one step.
- Keep Today membership, counts, time totals, slot filling and bulk actions on their existing task sets. A promoted task enters those sets under the normal Today rules.

Out of scope are date inheritance, showing whole subtrees under a context-only row, and adding contextual rows to Earlier, Blocked, Waiting, Done today, Upcoming (including Start with Today), or saved views. The change needs no setting.

This follows the built-in display options work ([#872](https://github.com/OpenTodoApp/OpenTodo/issues/872), [#1108](https://github.com/OpenTodoApp/OpenTodo/issues/1108)) under the `custom-views` ROADMAP item and preserves the shipped `today-closed-list` item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `builtin-view-options` updates Today's nesting rule and defines contextual row actions, selection and project-group drops.
- `subtasks` defines the Today exception to matching-task membership in cross-project and date views.
- `today-closed-list` defines how contextual rows coexist with visible slotted tasks.
- `upcoming-start-with-today` keeps Upcoming on the existing Today membership rules and displays future tasks once in their own day groups.

## Impact

The web client's Today list derivation, row presentation, bulk action inputs and existing move and scheduling paths. No API, task schema, sync protocol, dependencies or environment variables change.
