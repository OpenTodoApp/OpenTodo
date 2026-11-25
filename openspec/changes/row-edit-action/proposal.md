# Proposal

## Why

Issue #1945: it is hard to tell which part of a row edits in place and which opens the details. The inline editor (title, Date, Priority, Labels, Project) is one keystroke away (`F2`) or a second click on a selected title, but nothing on the row says so. Opening the details has no named action outside the editor's own button. And in the side panel the task shown follows the cursor, so editing task B's date in the list replaces task A in the panel, which is the case the issue describes.

The owner approved the design on the issue: the title click stays as it is (`click-selects-title`, and the account's **Click a task to** of `click-default`); **Edit** takes **Show details**' place in the row's revealed actions and stays in the row menu; the row menu gains **Open details**, which opens the task as Enter does (the **Open tasks** preference, no popup); and the task beside the list stays while another row is edited, until the cursor moves or a row is clicked.

## What Changes

- **Edit in the revealed actions.** On a fine pointer from 768 px, a writable row of a list with the inline editor reveals **Edit** (pencil, `F2` in its tooltip) first, then Schedule, Priority and More: still four actions. Edit opens the same editor as `F2`, on that row, with the caret at the end. A viewer's row and a row of a list without the inline editor (the Filter view, saved views, Next, Waiting) keep **Show details** there.
- **The row menu.** One task's menu in those lists holds **Edit** (`F2`, renamed from **Edit title**), **Show details** or **Hide details** (→ / ←, from 768 px) and **Open details** (Enter). Open details opens the task as Enter does: its page, or the side panel or the Inbox's split by **Open tasks**. With a fine pointer from 768 px Edit opens the `F2` editor; on touch and below 768 px it opens the compact editor with Save and Cancel, as **Edit title** did.
- **The task beside the list stays.** Starting an edit, or opening More, on a row other than the task shown in the side panel or the Inbox's split selects that row and leaves the shown task where it is. The next cursor move (`j`, `k`, the arrow keys) or a click on a row shows the cursor's task again; a click on the empty area of the selected row now shows it there too. Opening another task there (Shift+Enter, Open details) ends the wait; closing the pane leaves it closed until the cursor moves.
- **Unchanged:** a click on a title (select, then edit, or open under **Click a task to: Open details**), `F2`, Enter, the double-click, `a`, → and ←, swipes and taps, and both preferences (`row_click`, `task_open`).

No new op field, entity, route, setting, dependency or shortcut. Not **BREAKING**.

Out of scope: a single click that edits (the issue's first ask; `click-selects-title` and #1958 decided against it), a popup for the details, the inline editor in the Filter view, saved views, Next, Waiting and boards (`click-selects-title` D6), continuous creation from the editor (#1696, `click-selects-title` D10) and notes in rows (#1669).

ROADMAP.md: none (an improvement from an issue); follows `click-selects-title` and `click-default`.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: "Revealed row actions" names Edit in Show details' place; a new requirement "Edit and Open details from a row" adds the row menu's items and the task that stays beside the list.

## Impact

- Web: `task-list/RowActionCluster.tsx` (Edit), `TaskRow.tsx` (`onEdit`; the selected row's empty area), `task-list/TaskListRow.tsx` and `task-list/ListGroups.tsx` (`editInPlace`), `TaskListView.tsx` (the hold, Edit's editor, Open details, Show details; the expanded row's state moves up), `task-list/useListBindings.ts` (More holds, a click releases), `task-list/useInboxSplit.tsx` (`dockId`), `bulk/BulkActions.tsx` and `bulk/useRowMenu.tsx` (the menu items). One message goes from every catalogue (**Edit title**); **Edit**, **Open details**, **Show details** and **Hide details** exist.
- Docs: `docs/work-from-the-list.md`, `docs/expand-a-row.md`, `docs/task-panel.md`, `docs/interface-guide.md`; `changelog.d/Changed/row-edit-action.md`.
- Overlap: `click-selects-title` (not archived) names the touch menu action **Edit title** in its delta; its wording follows the rename, nothing else in it changes.
