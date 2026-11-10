# Proposal

## Why

Two requests from user feedback by email. One (#1129): with the side panel on, "a single click should expand the row downward, as Show details does, so the subtasks are visible at once, and a double-click should open the task as its page, which is clearer in some situations". The other (#1116): "Is there an option to automatically expand tasks when you select them (show details)?", answered in the Inbox today, where from 1024 px the selected task's details stand beside the list and follow j, k and clicks.

Today a click on a row either edits its title in place (the default) or opens the task (**Click a task to: Open details**), and expanding a row takes the revealed **Show details** action or →. A double-click is two clicks. The side panel already follows the cursor in every list (`task-side-panel` D4), but nothing says so where people look, and each move draws the whole list three times: once for the cursor and twice more because the list subscribes to the docked task's id.

## What Changes

- **Click a task to** gets a third choice, **Expand the row**: a pointer click on a row's title or empty area selects it and shows or hides its details under it, as Show details does, wherever rows expand (list layouts of the task lists, the Filter view and saved views). Board cards, Next and Waiting do not expand, so a click opens the task there. It stays a device-local preference.
- A **double-click** on a task row opens the task's page under every choice, beside the side panel and the Inbox's split too. Its second click does nothing of its own. A double-click on a row's controls keeps their meaning, and in a title already being edited in place it selects a word.
- With **Open tasks: In a side panel**, the details follow the selection in every list as in the Inbox (unchanged behaviour of that preference, now stated and tested in every list and documented), focus stays on the list after a click too, and following the cursor draws the list once per move instead of three times. Under Expand the row a click expands the row and the panel shows the selected task while it is open; a closed panel stays closed until Enter.
- The keyboard is unchanged: Enter, Shift+Enter, →, ← and F2.
- No new op field, entity, route, synced setting, dependency or shortcut. Not **BREAKING**.

Out of scope: a fourth "open on select" choice for the page preference (the side panel is that choice); expanding board cards, calendar or review rows; changing what Enter does; a double-click delay on the first click (a click acts at once).

Roadmap: a follow-up of "Expand a row in place" (`row-expand`) and of the side panel (`task-side-panel`) in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: "Inline title editing" names the third choice; a new requirement for "Click a task to" and the double-click.
- `web-app`: "Task details in a side panel" states the click under Expand the row, focus after a click and the cost of following the cursor.

## Impact

- Web: `web/src/app/rowClick.ts` (the choice), `web/src/app/TaskRow.tsx` (a click that expands, the double-click), `web/src/app/task-list/TaskListRow.tsx` and `useListBindings.ts` (`openPage`), `FilterView.tsx`, `SavedViewView.tsx`, `method/MethodListView.tsx` (the double-click), `PreferencesPanels.tsx` and `lib/settingsCopy.ts` (the setting), `panel.ts` (`usePanelHasTask`, `watchPanelTaskId`), `TaskListView.tsx`, `task-list/useInboxSplit.tsx` and `useListShortcuts.ts` (the list no longer subscribes to the docked id); two messages in every catalogue.
- Docs: `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md`.
- Size: about 0.3 KB gzip in the first load (689.7 to 690.0 KB of the 694 KB budget; the entry chunk stays at 141.4 KB); the budget is not raised.
