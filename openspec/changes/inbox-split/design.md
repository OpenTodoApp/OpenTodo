# Design

## Context

`task-full-page` made a task open as its page everywhere. It kept one way to dock a task beside a page: `setTaskSplit(true)` in `panel.ts` makes `openTaskPanel` put the task in the shell's panel slot from 1024 px, instead of opening its page. Only Process the Inbox used it. The slot (`PanelHost`) sits beside the content column, and the docked task (`TaskDetail`) keeps the earlier panel layout.

The Inbox list is the shared `TaskListView`. It has a cursor (`selectedId`), and the open task lives in the slot (`openId`). The task's origin is a field. The device that wrote each field is in the row's `_clock`.

## Goals / Non-Goals

**Goals:**
- The Inbox shows the task under the cursor beside the list from 1024 px, and an empty pane when there is none, reusing the slot and the docked task as they are.
- A source line under each Inbox row, worked out on the device from data the row already holds.
- Process as the page's primary action, on `P`.

**Non-Goals:**
- A second detail implementation. The pane is the docked task `task-full-page` already keeps for triage.
- New fields, server work, or a record of how a task was typed (voice, quick add).
- Changes to Process the Inbox.

## Decisions

**D1. The Inbox is a split page, and the detail follows the cursor.**
- While the Inbox is mounted it calls `setTaskSplit(true, empty)`. A small hook (`useInboxSplit`) docks the cursor's task whenever the cursor moves, and empties the slot when the cursor is cleared.
- Closing the docked task clears the cursor, so the list and the pane always agree.
- While rows are ticked the pane stays empty (`bulk-edit`: ticking opens nothing). Escape first clears the ticks, which brings the cursor's task back; a second Escape clears the cursor.
- Enter on the list opens the task's page with `openTaskPage`, which keeps the trail ("4 / 12", Esc back). Enter on a focused row button reaches the row's open action as a click with `detail === 0`; on the split, that click opens the page when the task is already docked.
- On the split a click on a title docks the task instead of starting the inline editor. Two different click results on one list would be confusing, and the title is editable in the pane.
- *Alternative:* render the detail inside the Inbox page as a second column. Rejected: it duplicates the slot's layout, its motion and its focus handling, and the Process mode already uses the slot.
- *Alternative:* dock only on Enter, as triage does. Rejected: the mock-up and reference 01 show the detail following the selection, and a click to see each task is the cost this change removes.

**D2. The empty pane belongs to the split, not to the occupant.**
- `setTaskSplit` takes an optional `empty` renderer. `PanelHost` draws it in the slot's frame when nothing is docked and the screen is at least 1024 px wide.
- An empty Inbox passes no renderer, so the slot closes and the list's own empty state stands alone.
- *Alternative:* a custom occupant ("inbox-empty") opened by the Inbox. Rejected: every "close the panel" path (Esc, click away, a route change) would close it, and the Inbox would have to reopen it each time.
- While a split page is mounted, the slot is wider: about half of the content, between 26 and 44 rem. This is a `data-task-split` attribute on the root that sets `--panel-w`.

**D3. Process is the primary action, on `P`.**
- The header button becomes the primary variant, reading "Process" with its key.
- A new registry entry `inbox.process` (`p`, view scope, Inbox only) sits beside `project.view-mode`. `p` is free in the Inbox's scopes: calendar placement and Close the day use it on their own views. `g p` stays as the global way in.
- The count moves to the header's meta ("4 to sort"), so the button keeps one short label.

**D4. The source line is read from the origin, then the creating device.**
- `lib/taskSource.ts` reads the task's origin first: email, a web page, an issue, an import.
- Without an origin it reads the device on the `created_at` clock, which is the device that created the task, else the device on `title`. The prefixes are the ones the server and the clients already write: `caldav:`, `agent:`, `assistant:`, `import`, `vault:`, `server`.
- A device id without a prefix is this or another of the user's own devices, and the line says "Added".
- The time is `relativeLabel` from the task's `created_at`.
- The line takes the place of the origin chip on Inbox rows: both would say the same thing. The task page and the docked task keep the origin with its link.
- *Alternative:* a new `source` field written at capture. Rejected: it adds to the op schema for a label, and the sources that matter (mail, extension, calendar, assistant, import) are already known from the origin and the device.

## Risks / Trade-offs

- **[Risk] A task created on another of the user's own devices reads "Added", like one made here.** → That is true and enough. The line is about the channel, not the device.
- **[Risk] The cursor docks on every move, so holding `j` re-renders the pane for each task.** → The docked task remounts per task, as it did when switching tasks in triage. Rows are memoized, so the list does not re-render.
- **[Trade-off] On the split, a click on a title no longer edits in place on the Inbox.** → The title is editable in the pane next to it. Every other list keeps inline editing.
- **[Risk] A rebase onto other Precision changes touching `TaskListView` or `TaskRow`.** → The change keeps its own logic in `useInboxSplit` and `lib/taskSource.ts`. Only a few lines touch the shared files.
