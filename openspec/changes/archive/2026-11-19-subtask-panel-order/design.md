# Design

## D1. The handle, not the row

The subtask row is already two buttons (the checkbox and the title, which opens the subtask). Dragging the row itself would compete with both, and on a touch screen with the panel's scroll. A handle at the row's end is the pattern the task panel already uses for a rotation's turn order: drag it, use Alt+arrows on it, or click it for a menu with Move up and Move down (WCAG 2.5.7, a single-pointer alternative to dragging). Under a mouse it shows with the row (`hover-reveal`); on a touch screen it is always shown.

## D2. One write path

The drop and the keys call `moveTask` and `moveTaskBy` of `lib/move`, which plan the positions among the parent's open subtasks with `lib/ordering` and write them in one `mutateMany` batch. The permission check (`canReorderTasks`) is theirs too. While the handle is dragged the list shows the new order before anything is written; the release writes once; a release where the drag started writes nothing.

## D3. Where it shows

Only where the list has its add line (`add`), so not in a list row's expanded subtasks, where rows have their own drag. Not for a viewer (`readOnly`), not on a completed task, and only with two open subtasks or more.
