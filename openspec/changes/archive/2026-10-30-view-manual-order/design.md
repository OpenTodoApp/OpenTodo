# Design: manual order in label pages and saved views

## Context

Manual order today is the task's `position` inside its own list: a project section, a parent's subtasks, the Inbox (OpenSpec `manual-ordering`). `web/src/lib/ordering.ts` plans the position writes and `web/src/lib/move.ts` applies them; `TaskListView` turns drag and the Alt+arrow keys on only for a project (editors and above) and the Inbox. A label page (`TaskListView` with `route.view === 'label'`) and a saved view (`SavedViewView`, its own renderer) offer **Order by → Manual order** (`sort_by: "position"`, from `list-display-options` and `custom-views`), which sorts by those project positions; they register no drag and no move keys, so the option looks broken (#623).

## Goals / Non-Goals

Goals: reordering in a label page and a saved list view by drag, keyboard and touch, with Undo; an order that syncs across the user's devices, works offline and converges; no change to any project's order; bounded storage.

Non-goals: subtask reordering from these pages, cross-group drops that rewrite the grouped property, manual order on built-in smart lists (they have no Order by), a sequence CRDT.

## Decisions

### D1. The order lives on the label or view, not on the tasks

A new field `manual_order` (array of task ids) on the `label` and the `view` entity. Alternatives considered:

- *Rewrite the tasks' `position`.* Rejected: a label page mixes tasks of many projects; moving one would reorder its project, the change would reach every member of a shared project, and a viewer may not write positions at all.
- *A per-task map `{viewId: rank}` on the task.* Rejected: it puts a personal preference on shared task rows (other members would receive it), and grows every task.
- *A new `view_order` entity.* Rejected as heavier than needed: labels and views are already personal synced entities that hold the page's other display options (`group_by`, `sort_by`, `sort_dir`, `row_layout`), so the order belongs next to them.

Labels and views live in the user's personal sharing scope, so the order is private to the user and a viewer of a shared project can order their own page.

### D2. Stored list = placed tasks only, bounded

The rendered order under Manual order ascending is: the visible tasks whose id is in `manual_order`, in that order, then every other visible task in the fallback order (task `position`, then due, priority, id: exactly what the page showed before, so nothing moves until the user moves something). Descending reverses that sequence, as it reverses positions today.

A move takes the current sequence of the page's visible tasks, moves the task before or after its anchor, and stores the prefix of the new sequence up to the last placed task (the moved one or an earlier placed one). Tasks that were never placed and end up above a placed one become placed; those below stay unplaced and keep following the fallback order, so tasks added later fall to the end of the placed block in their natural order.

Ids in the stored list that are not visible right now are handled lazily at the next move: a task that still exists, is not deleted and is not completed keeps its place (it may come back, e.g. a query edited back or a label re-added) and is re-inserted after the id that preceded it; a task deleted, completed or unknown on this device is dropped. Completed tasks shown by a view's "Completed tasks: Show" are visible and keep their place.

Bound: `MaxManualOrder` = 500 ids, checked by the op schema (a new kind `kOrderList`: an array of at most 500 distinct ids of 1 to 64 characters). With 36-character UUIDs a full list is about 19 KB, under the 64 KB value limit. When a move would exceed it, hidden ids are dropped first, then the tail; dropped tail tasks simply fall back to the fallback order. A typical page stores a few dozen ids.

### D3. One last-writer-wins value

`manual_order` is one whole-list register like `view.panels` or `slot.task_ids`. A move is one op on one field, applied locally first (offline), and converges by per-field LWW like every other display option. Two devices reordering the same page offline end with the newer device's whole order: intent of the older move is lost, never duplicated or corrupted, and one more move fixes it. This matches the accepted trade-off of `manual-ordering` ("Concurrency") and is the price of a bounded value; a sequence CRDT is out of scope. Other fields of the label or view (name, grouping, order) are separate registers and are unaffected.

### D4. Groups

A move stays within the task's group: the drop indicator is shown only over rows of the same group (or column, on a view's board), and Alt+Up/Down step to the neighbour in the same group, Alt+Shift+Up/Down to its first or last task. The global stored order then places the task right before or after that neighbour, which is what every grouping shows. A saved view grouped by label can list a task in several groups; a move uses the group of the row it starts from. Subtasks listed on a label page or view are rows like any other (these pages are flat), so they can be placed too; their order under their parent in the project is unchanged.

### D5. Under another order

As on a project (`list-display-options` D4), a drag drop among rows or a keyboard move on a label page or view shown in another order (or Manual descending) first sets Order by to Manual order ascending, then applies the move against the manual sequence.

### D6. Undo

Each move is written through the undoable batch (`applyBatch`, bulk-edit D5) with the previous list as its inverse (`[]` when the row had none), and shows "Order changed" with Undo for five seconds (`showUndoToast`), so Ctrl/⌘+Z works while it shows. Undo is skipped, as for every batch, when the field changed again since. Project moves keep their current behaviour.

### D7. Where Manual order is offered

- Label pages and saved list views: offered and working (list layout; a view's board too).
- The unsaved New view page: removed from Order by (nowhere to keep an order before saving; a stored draft with `position` reads as Due date). After saving, the view offers it.
- Today, Upcoming, Anytime, Someday, Assigned to me, Completed, places: no display panel today; unchanged.
- Dashboards: panels show a view's first tasks in its manual order; panels are not reorderable.

### D8. Shortcuts and interaction budget

No new shortcut: the existing `list.move-*` keys and Vim `Shift+J`/`Shift+K` now also apply on these pages (the help text already says "within its list"). No new chrome: the display panel is unchanged, rows gain the existing drag affordance and drop line. Interface budget (docs/interface-guide.md): rows of chrome above the first item unchanged (≤ 2), task properties unchanged (≤ 7), sidebar destinations unchanged (≤ 6), scroll regions unchanged (≤ 3). Touch: rows lift after the existing 350 ms hold; targets keep their ≥ 24 px (44 px on coarse pointers) size.

## Data model impact

Additive: `label.manual_order` and `view.manual_order`, kind `kOrderList`, default `[]`. Not content fields (task ids). Older clients keep the field in the row and ignore it; their edits of other fields leave it alone. REST representations (`/api/v1/labels`, `/api/v1/views`) and the export carry the field as stored; a REST `PATCH` replaces it as a whole like any other field, checked by the op schema kind (no extra rule: unknown ids are allowed, as on the sync path).

## Size and memory

No dependency. The first load grows by about 1.1 KB gzip (measured 714.1 KB against the 713 KB budget, entry 320.1 KB against 320 KB): the order read and the drag and keyboard handling are drawn with the label and view lists, which are part of the first load; the write and its Undo (`lib/viewOrderMove.ts`) load with the first move. `web/bundle-budget.json` is raised to 715 KB (entry 321 KB) with that reason. The binary gains one validation function.

## Risks / Trade-offs

- Concurrent reorders of the same page lose the older one's intent (D3). Accepted.
- A page with more than 500 tasks can place only its first 500; the rest follow the fallback order. Accepted and documented.
