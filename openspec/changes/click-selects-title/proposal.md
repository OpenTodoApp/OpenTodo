# Proposal

## Why

Issue #1405: **Settings → General → Keyboard → Click a task to → Edit in place** reads like a promise about what a click on a title does, but the view decides. The title is edited in place only with a mouse from 768 px, with **Open tasks: As a page**, outside the Inbox's split layout, while no task is docked beside the list and on a task the user may edit. With the side panel the same click shows the task in the panel; in the Inbox from 1024 px it shows the task in the split even with As a page. The setting cannot tell anyone what will happen.

The second half follows from the first. Whether a click selected the row or started editing decides where the next key lands: click a title in Today to select it, press `a` for Add subtask, and the `a` is typed into the title field. In the Inbox the same two steps add a subtask. #1191 met the same thing ("the shortcut doesn't appear to work").

The maintainer decided on the issue: one rule in every editable list, like Finder or Linear. A first click on a title selects the row (and shows it beside the list where details open there); a second click on the title of the selected row edits it in place; `a` always adds a subtask to the selected row; the "Click a task to" setting goes away; opening a task as a page stays where it is.

## What Changes

- **A first click selects.** With a mouse, trackpad or pen on a fine pointer from 768 px, a click on a task's title or on its row's empty area selects the row in the lists covered by D6. Where details show beside the list (the side panel, the Inbox's split) the click also shows the task there, as moving the cursor does. A click on an unselected row leaves its title and page closed.
- **A second click edits.** A separate click on the title of the row that was already selected when the press began turns the title into the inline editor, with the caret where the user clicked. It works in lists that already provide inline editing, beside the side panel and in the Inbox's split. `F2` still opens the editor with the caret at the end. Boards and the other views listed in D6 get selection only.
- **Opening stays where it is.** Enter on the selected row (the side panel or the Inbox's split shows it first, a second Enter opens the page, as today), a double-click on the row, Open task in an expanded row, and Open details or `Shift+Enter` in the inline editor open the task. A double-click on a title being edited still selects a word.
- **`a` after a click.** Because a single click no longer edits, select-then-`a` adds a subtask under the selected row the same way in Today, Upcoming, projects, labels, places and the Inbox, and `a` never lands in the title field. (`a` while typing in a field stays typing.)
- **The "Click a task to" setting is removed**, with its three choices (Edit in place, Open details, Expand the row). The value a device stored is no longer read. Expanding a row stays one key or one click away: → and the row's Show details action, unchanged.
- **Touch title editing (#1554).** A title tap still opens the task. Releasing a short left swipe starts title editing in the row. A full left swipe opens Schedule. The swipe and **Edit title** in the existing row menu open the same compact editor with Save and Cancel.
- **Editing and adding have separate entry points (#1696).** Enter in the inline editor saves and returns focus to the list. **Add task below** where offered keeps adding siblings at the same level, and **Add subtask** keeps adding children. Automatically opening an insertion field above the edited task belongs in a separate change.
- **Existing controls:** Shift and Ctrl/⌘ clicks and Select mode tick rows, a press that moves is a drag, and the row controls keep their actions. A click below 768 px opens the task. An explicit open click can reopen a closed side panel as it does today.
- No new op field, entity, route, synced setting, dependency or shortcut. The setting was a device-local value in browser storage, never synced and never in the op schema, so nothing stored has to be migrated. Not **BREAKING**.

Out of scope: extending inline editing, `F2` or `a` to the Filter view, saved views, Next, Waiting and board cards; a new Add subtask binding; changing the ordering or keyboard behavior of the existing add lines; tap-to-edit or changes to the edge gesture and right swipes; and click behavior in Calendar, Plan, timelines, dashboards and review screens.

Roadmap: advances the existing `click-selects-title` entry and follows `inline-task-editing` and `row-click-modes`. [ROADMAP.md](../../../ROADMAP.md)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: "Inline title editing" starts from a second click or `F2` in every editable list; the requirement "\"Click a task to\" and double-click" is replaced by "A click selects the row, a second click edits its title".
- `web-app`: "Task detail panel" and "Task details in a side panel" say what a click and a second click do, without the setting.
- `inbox-triage`: "Inbox list and detail": a click shows the task in the pane, a second click edits the title in place.
- `subtasks`: "Create subtasks": `a` adds under the selected row however it was selected.

## Impact

- Web: `web/src/app/rowClick.ts` (the choice goes; the double-click interval stays), `web/src/app/TaskRow.tsx` (`useRowClicks`: select, second click, double-click; whether the press began on the selected row), `web/src/app/TaskListView.tsx` (`startInline` without the preference, the panel or split condition), `web/src/app/task-list/useListBindings.ts` (`open` selects on a pointer click), `FilterView.tsx`, `SavedViewView.tsx`, `method/MethodListView.tsx` and `sidePanel.tsx` (`openFromRow` on a pointer click), `PreferencesPanels.tsx` and `lib/settingsCopy.ts` (the setting row goes), `lib/shortcuts.ts` (the `F2` description names the second click), `lib/sampleTasks.ts` (the first-day note); messages removed from and changed in every catalogue.
- Touch: reuse the single-row action menu and title editor in `web/src/app/bulk` and `web/src/app/task-list`. A compact edit mode shows Save and Cancel and keeps the row in its list.
- Docs: `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md`, `docs/sidebar-schedule.md`, `docs/process-the-inbox.md`, `docs/keyboard.md` (generated); `changelog.d/Changed/click-selects-title.md` with the note for people who chose a setting.
- Tests: pointer and keyboard selection, edit and open in the task list, side panel and Inbox split; native-feeling focus, Save and Cancel on touch including iOS; preservation of add-line entry and contextual rows in Today; existing layout, accessibility and performance checks. Refresh any affected visual baselines during implementation.
- Size: one select and its store go. The measured first-load gzip size stays within the existing budget.
