# Manual order in label pages and saved views

## Why

Issue #623 (reported by osenchenko): a label page and a saved list view both offer **Order by → Manual order**, but dragging a task or pressing Alt+Up/Down there does nothing. Only project lists and the Inbox can be reordered (OpenSpec `manual-ordering`, "Which views are manually ordered"). The option is offered and silently broken: "Manual order" on a label or view today only means "the tasks' positions in their own projects", which the user cannot change from that page, and for tasks of several projects that order is close to arbitrary.

Reusing the tasks' project positions would be wrong: reordering errands on the label page "errand" must not reshuffle the projects those errands live in, and a viewer of someone else's shared project cannot write positions there at all, although the label page or saved view is their own.

## What Changes

- A label and a saved list view each get their own **manual order**: an ordered list of task ids stored on the label or the view (new additive op field `manual_order` on both entities), synced to the user's devices like the page's other display options. Labels and views are personal, so the order never reaches anyone else and a viewer of a shared project can order their own label page or view.
- With Order by **Manual order**, a label page and a saved list view list the tasks they have placed first, in that order, then every task never placed, in the order the page showed before (the tasks' positions), so nothing changes until the user moves something.
- Drag and drop (mouse, pen and touch after a short press), Alt+Up, Alt+Down, Alt+Shift+Up, Alt+Shift+Down and Vim's Shift+J / Shift+K reorder tasks within their group there, in the list layout and on a view's board. A move under another order first switches the page to Manual order, as a project does. Every move shows "Order changed" with **Undo**.
- The stored list is bounded: it holds only the tasks placed so far (the moved task and those above it), at most 500 ids; ids of tasks that are deleted, completed (on a page that hides completed tasks) or gone are dropped at the next move.
- The unsaved **New view** page no longer offers Manual order, since there is nowhere to keep an order before the view is saved; a draft that held it reads as Due date. Today, Upcoming, Anytime, Someday, Assigned to me, Completed and places have no Order by choice and are unchanged. Dashboards panels show a view's tasks in its manual order but cannot be reordered.

Not **BREAKING**: one additive field on two existing entities, no new route, no new environment variable.

Out of scope: reordering subtasks under their parent from a label page or view (they keep their project order), dropping a task into another group to change the grouped property, manual order on built-in smart lists, a CLI command or agent tool to set the order (the REST representation and the export carry the field, and a REST PATCH can replace it whole like any field), and a sequence CRDT for concurrent reorders of the same page (the order is one last-writer-wins value, see design D3).

ROADMAP: no item; a fix for issue #623, shipping in 0.18.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `manual-ordering`: MODIFIED "Which views are manually ordered"; ADDED "Manual order of a label page or saved view".
- `custom-views`: MODIFIED "Grouping and sort options" (no Manual order on the New view page).
- `list-display-options`: MODIFIED "Moving a task switches to manual order" (label pages too).

## Impact

- Data model and sync: `internal/sync/ops.go` `Schema` gains `label.manual_order` and `view.manual_order` (a new kind `kOrderList`: at most `MaxManualOrder` = 500 distinct ids of at most 64 characters); generated `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` (unchanged: not content) and `internal/sync/testdata/schema_fixture.json`. Rows are stored generically, so no migration.
- Web: `web/src/lib/viewOrder.ts` (pure order and planning), `web/src/lib/viewOrderMove.ts` (the undoable write), `web/src/lib/views.ts` (`runView`, `evaluateViews`), `web/src/lib/listGroups.ts` (label pages), `TaskListView`, `useListDrag`, `useListShortcuts`, `SavedViewView`, `useListKeys`, the Vim move, `FilterView`. Strings in the six catalogues.
- Docs: `docs/sync.md`, `docs/api.md`, the guide pages on labels and saved views, `docs/keyboard.md` if it names where moves apply.
- E2EE: none; task ids are not content.
- Size: no dependency; a few kilobytes of lazily loaded page code at most.
