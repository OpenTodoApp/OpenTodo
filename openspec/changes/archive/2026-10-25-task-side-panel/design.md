# Design: task details in a side panel

## Context

`task-full-page` made a task open as its page at `/task/<id>`, and `inbox-split` kept one exception. On the Inbox (and in Process the Inbox), from 1024 px, the page calls `setTaskSplit(true, empty)`. `openTaskPanel(id)` then docks the task in the shell's panel slot instead of opening the page. `useInboxSplit` docks the cursor's task as it moves. `PanelHost` draws the docked task (`TaskDetail`), or the empty pane while none is docked. This change reuses that machinery for every list, behind a preference.

## Decisions

- **D1 A synced preference, page by default.** `user_prefs.task_open` is `page` or `panel`. An empty or unknown value reads as `page` and is never rewritten, so the field stays additive and older clients ignore it. It is synced like the other appearance preferences, because how someone likes to read their tasks is a habit of the person, not of the device. The Appearance section already promises that its choices follow the account, without a per-device override. A phone or a narrow window ignores the value (D6), so syncing it never puts a panel on a phone. The default stays `page`: 0.11.0 made the page the default on purpose, so nothing changes for anyone who does not ask.

- **D2 One panel: the Inbox's docked task.** `setTaskSplit(on, empty, kind)` gains a kind, `split` or `panel`:
  - `split` is today's Inbox and triage split. `panel` is a list with the side panel.
  - `sidePanelDocks()` is true when the page keeps a `panel` split and the window is at least 1024 px wide.
  - The docked task stays `TaskDetail` in `PanelHost`. Its sticky header has the checkbox, title, menu (with Expand to the page) and Close. Under it come the notes (clamped, with Show more), the facets, the fields, the subtasks, the attachments, and the Comments, Activity, History and Time tabs.
  - That is the full content of the task page in the earlier panel layout, so the issue's "notes and comments, not only date, priority and project" holds without a second panel.
  - The lists share one hook, `useSidePanel` (`app/sidePanel.tsx`). `TaskListView` calls it directly, and the Filter view, saved views, Next and Waiting call it through `useListKeys`. The hook sets the split, follows the cursor (D4) and supplies the empty pane.

- **D3 The width is per device.** The handle on the panel's left edge sets `--task-panel-w` on the root element, which `:root[data-task-split]` reads. It is stored in `localStorage` (`opentodo.taskPanel.width`, CSS pixels) and applied when a split turns on.
  - **Why not synced:** a width suits a screen, not a person. The 900 px that reads well on a 27-inch monitor would leave a 13-inch laptop's list a sliver.
  - **Bounds:** CSS keeps the stored value within `clamp(22rem, width, max(22rem, min(64rem, 100vw − 38rem)))`, so a smaller window shrinks the panel without losing the stored width. The 38 rem leaves the sidebar and about 23 rem of list. Rows already follow their own width (`task-list-presentation`), so the one-line columns drop cells as the list narrows.
  - **Where it applies:** the same width is used wherever a task docks (the Inbox in both modes, Process the Inbox and lists with the side panel), because it is the same panel.
  - **Keyboard and reset:** the handle is a focusable `separator`. ← and → move it by 16 px (64 px with Shift), and Home or a double click restores the default, which removes the stored value.

- **D4 Open or closed, and what reopens it.** The panel's open state is per device (`opentodo.taskPanel.closed`), open at first. It is device state like the width, and it is what makes "once closed it stays closed" survive a reload.
  - **While open:** the panel follows the cursor. `j`, `k`, the arrow keys and a click move the cursor, and the panel shows the cursor's task. While rows are ticked for a bulk action it does not follow, as on the Inbox.
  - **What never closes it:** losing the cursor (Escape on the list, a click on the empty part of the list), completing the shown task, ticking rows, or going to another list. The docked task belongs to the page it was opened on, so on another list the panel stays open with "No task selected" until a task is chosen there. A deleted task leaves the same empty pane.
  - **What closes it:** only the Close button, or Escape while focus is inside the panel. Both are deliberate, and the Close button is the only control the issue asks for. Escape inside the panel is the keyboard equivalent the shell's other occupants already have.
  - **While closed:** moving the cursor opens nothing. The explicit opens bring it back with that task: a click on a row or a title, Enter on a selected row, Open details (`Shift+Enter` in the inline editor), a task chosen from the command palette, and a task opened from a note's link. So "reopen" means "open a task", and mere keyboard focus does not.
  - **Enter:** Enter on the row whose task is shown opens the task page, as on the Inbox. A second Enter is the way from the panel to the page, besides the panel menu's Expand.

- **D5 A click on a title shows the task.** As on the Inbox, while a side-panel page docks, a click on a title shows the task in the panel instead of editing the title in place. That is what the issue asks ("clicking a task should display its details"). `F2`, and the title field in the panel, still edit the title. The "Click a task to" preference applies to lists that open the page.

- **D6 Where the side panel does not apply.** Below 1024 px a task opens as its page whatever the preference. This covers phones, tablets in portrait and narrow windows, where a panel would take the list's place, which is what the page already does better. The calendar's Day, Week, Month and Plan keep the planning list in the slot, and dashboards, the review screens and Close the day keep opening the page. Those screens are not lists of tasks to read through, and two occupants cannot share the one slot.

- **D7 The Inbox follows the preference.** With `page` the Inbox keeps the inbox-split behaviour exactly: the pane is always there, Escape empties it, and ticking empties it. With `panel` it behaves like every other list (D4) but keeps its own empty-pane sentence, with `P` to process. One set of rules per preference is easier to learn than an Inbox exception inside the side-panel mode.

- **D8 The empty pane.** While the panel is open with no task, the slot shows "No task selected" and one sentence: "Select a task to see its details here." The Inbox keeps its own sentence. The pane has the same width, handle and Close as the docked task, so closing it is always one control away. A list with no rows shows no empty pane, like the empty Inbox.

## Data model

One additive field, `user_prefs.task_open` (string). It is added to the op `Schema` in `internal/sync/ops.go`, the schema fixture, `UserPrefs` in `web/src/lib/types.ts` and `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`. It is not user-written text, so it is not encrypted and not in `ContentFields`. It travels in the export with the rest of `user_prefs`. Nothing is renamed or removed, and there is no migration. The width and the open state never leave the device.

## Interface budget

- **Chrome:** no row above a list's first item.
- **Task properties:** no new property on rows.
- **Sidebar:** no new destination.
- **Scroll regions:** the sidebar, the content and the panel, three in all, as on the Inbox today.
- **Shortcuts:** no new key. Escape and Enter keep their meaning on the list, and Escape inside the panel closes it (D4).
- **Settings:** the new Settings page holds one row.

## Size

No dependency. One interface icon (`panel-right`, about 150 bytes) for the Settings row, and a few hundred lines of client code. No server memory or image size change.

## Risks

- **A wide panel on a small laptop.** D3's bound always leaves about 23 rem of list, and the row columns degrade as specified.
- **An open panel the user did not expect.** Choosing the side panel is explicit, and the panel opens beside a list showing "No task selected" with Close. Closing it is remembered.
