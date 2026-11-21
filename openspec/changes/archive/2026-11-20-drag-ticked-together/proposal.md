## Why

Issue #1498. Ticked tasks already travel together when dragged onto the sidebar (another project, the Inbox, Today, a label), with one Undo. Inside a list, a drag still moves only the row under the pointer, so reordering or nesting several tasks means dragging them one by one. The reporter worked out the edge cases on the issue, and the owner noted them for this design:
1. a drop onto one of the ticked tasks acts as a drop next to it;
2. a ticked task carries its subtree;
3. a ticked subtask of a ticked task pops out as a sibling.

## What Changes

- **Several at once.** In a project list or the Inbox, dragging a ticked row moves every ticked task of that list to the drop line, in display order. This covers both reordering and nesting under a task (a drop on the middle of a row), with the same level rules as one task.
- **The three rules from the issue**:
  - a drop on or right next to a ticked row gathers the selection after it, so nothing silently fails;
  - a ticked task carries its unticked subtasks;
  - a ticked subtask of a ticked task lands as a sibling right after its parent.
- **One change.** The move is one batch with one Undo in the bulk toast ("4 tasks moved"). It is applied locally first and works offline. The ticks stay.
- **The preview** reads the count, for example "3 tasks", instead of the row's title.
- A row that isn't ticked still moves alone. Sidebar drops, section headings and board columns are unchanged.

Out of scope:
- keyboard moves of several tasks (Alt+↑/↓ keeps moving one);
- boards;
- label pages and saved views (their own order);
- Today and Upcoming.

No **BREAKING** change: no op field, no setting, and no new string: the preview reads "3 tasks" and the toast "3 tasks moved", both already translated.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `manual-ordering`: new requirement "Drag several ticked tasks within a list".

## Impact

- `web/src/lib/move.ts`: `moveTasks(ids, target)` plans the block move in one `mutateMany`, with the cycle and permission checks.
- `web/src/lib/ordering.ts`: `planMoveMany`, placing a block of siblings at once.
- `web/src/app/task-list/useListDrag.ts`: the ticked set becomes the dragged set for drops among rows, its subtrees are excluded as targets, and drops on a ticked row are redirected.
- The bulk toast's Undo.
- Tests, a story for the preview, and `docs/bulk-actions.md`.

No server change, no dependency. The code loads with the list's drag code, which is already lazy; the size will be measured with the build.
