# Design

## D1. The top-level task decides

`splitLater(tasks, today)` resolves each open task's effective parent within the project's open tasks (the same `effectiveParents` the tree uses, so a missing, completed or deleted parent and a cycle are handled exactly as in the tree) and walks up to the top-level task. The task goes to Later when that top-level task is deferred or parked (`inLater`), otherwise to the main list. Both halves keep the input order; the main list's tree and the Later tree are then built from them as before.

This is the rule the project list already follows for grouping (`list-display-options`: "Grouping and order SHALL apply to a project's top-level tasks; each SHALL keep its subtasks under it"), so Later is now one more group of the same kind.

Alternatives considered: copying the parent into the subtasks' group (a task listed twice, against "listed once"), or moving the subtasks' dates with the parent (a write the user did not ask for).

## D2. Later is a tree

The Later group's rows come from `flattenTree(buildTaskTree(laterTasks).roots, isCollapsed)`, with the same row fields as the main tree (depth, parent, children, fold state per device, breadcrumb only for a top-level row whose parent is not in the list). Keyboard moves, Tab and Shift+Tab work on these rows like elsewhere.

Display mode's project page uses the same split and draws Later with depth.

## D3. Data, offline, convergence

No data model change and no write: the split is computed on the device from local rows. It follows every synced change (a parent's start date edited on another device moves its subtree at once) and changes on the start day without a write, like deferral itself.

Interface budget (docs/interface-guide.md): no new chrome, property, destination, scroll region or shortcut.

Bundle: a few hundred bytes in the main chunk.
