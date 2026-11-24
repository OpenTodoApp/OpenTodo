# Design

## D1. Sub-projects are part of the list model

The Sub-projects group used to be a component above the list. To put a sub-project's tasks among the list's rows, its rows move into the list model: `listGroups` emits a "Sub-projects" bar group (folded per project on this device, as before), then one group per shown sub-project (`subProject: <id>`, its depth, its rolled-up open count, open or folded), and the project's own groups after them. An open sub-project's group holds its rows; a folded one holds none. Because they are ordinary groups, the cursor (`j`/`k`), `x`, Enter, `.`, inline editing, selection, the row cache (`keepGroups`), the sibling positions and the drag all reach the opened tasks without code of their own, and nothing reaches a folded one.

`GroupedList` draws the bar and the sub-project groups as one `<section data-sub-projects>`, each group headed by the sub-project row of before. The fold state of the bar moves into the device's collapse set as `project:<id>:sub-projects:folded`; the old `ot.subprojects.collapsed` list is read into it once and removed.

Rejected: a separate tree of rows beside the list (every list feature would need a second path), and opening a sub-project in the panel (it is a list, not a task).

## D2. The arrow

The row's empty 16 px fold slot (kept for the column grid since subprojects-above-tasks) takes a chevron button, the sidebar's: 24 px under a fine pointer, 44 px on touch, named "Expand Garden" or "Collapse Garden", `aria-expanded`. The name keeps opening the sub-project. Open is stored as `project:<child>:inline:open` in `opentodo.collapsed`, so the sub-project is folded by default and each device keeps its own. The arrow is offered only when the sub-project has open tasks or sub-projects. No new chrome: the slot was there.

## D3. What an open sub-project shows

Its own open tasks with their subtasks, then its own sub-projects as the same rows, each one step further in (1.5 rem per depth, as a subtask). The rows of a sub-project are indented one step under its row, so a sub-project reads like a parent task. The count on a row stays the open count of its subtree, so the opened tasks and the nested rows add up to it. In manual order the tasks follow the sub-project's sections (No section first, then each section by position) without section bars; with a sort chosen in the view, the view's sort orders the top-level tasks of the block. The view's query and duration filters apply to each block, so the parent page answers one question for everything it shows.

## D4. Editing follows the task's own project

Rows are read-only by `isReadOnly`, which reads the role in the task's own project (project-sharing), so a viewer of a sub-project sees its rows read-only in an editable parent. Completing, editing and moving use the existing writes (`mutate()` through `completeWithUndo`, `moveTask`, `dropUndoable`), all with Undo.

## D5. Drag

A task reorders only among the tasks of its own project: over a row of another project the drag shows no drop line and a release changes nothing (`moveTask` checks the parent and section against the task's own project too). A sub-project row carries `data-task-drop="project:<id>"` while the person may edit tasks there: a drop moves the task as a drop on the sidebar's project does (the ring, "Moved to Garden" with Undo). The "Tasks" bar carries the parent's drop target the same way, so a task of a sub-project goes back to the parent. A read-only task takes no such drop, as on the sidebar.

## D6. Scope rules

Quick add adds to the parent (unchanged). With a grouping on (priority, label, due…), the groups are the parent's, so no arrow is offered; with the columns layout on, the columns are the parent's fields, so neither. The board shows no Sub-projects group; the timeline keeps the standalone group above its bars without the arrow, since its bars are not list rows.

## D7. Performance

Rows are worked out only for open sub-projects. A sub-project's open tasks come from an index of open tasks by project (one pass per snapshot, patched from the rows a write changed), and each open sub-project keeps its list with `patchViewTasks`, so a write elsewhere costs a lookup per open sub-project; the block's tree is built from its own tasks only. With every sub-project folded, the list does no more work than before.

## Data model

None. Everything is read from local data, so it works offline and follows tasks and projects created, moved, completed or archived on another device after sync. The open state is a per-device preference, never synced.

## Interface budget

No chrome above the first item: the arrow sits in the existing fold slot, and the opened rows are list content. No task property, sidebar destination, scroll region or shortcut is added.

## Size

About 1 KB gzip in the first load (the list's model and the row), inside `web/bundle-budget.json`. No dependency.
