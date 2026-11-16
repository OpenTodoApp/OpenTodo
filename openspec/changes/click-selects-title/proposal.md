# Proposal

## Why

Issue #1405: **Settings → General → Keyboard → Click a task to → Edit in place** reads like a promise about what a click on a title does, but the view decides. The title is edited in place only with a mouse from 768 px, with **Open tasks: As a page**, outside the Inbox's split layout, while no task is docked beside the list and on a task the user may edit. With the side panel the same click shows the task in the panel; in the Inbox from 1024 px it shows the task in the split even with As a page. The setting cannot tell anyone what will happen.

The second half follows from the first. Whether a click selected the row or started editing decides where the next key lands: click a title in Today to select it, press `a` for Add subtask, and the `a` is typed into the title field. In the Inbox the same two steps add a subtask. #1191 met the same thing ("the shortcut doesn't appear to work").

The maintainer decided on the issue: one rule in every editable list, like Finder or Linear. A first click on a title selects the row (and shows it beside the list where details open there); a second click on the title of the selected row edits it in place; `a` always adds a subtask to the selected row; the "Click a task to" setting goes away; opening a task as a page stays where it is.

## What Changes

- **A first click selects.** With a mouse or trackpad from 768 px, a click on a task's title or on its row's empty area selects the row in every task list. Where details show beside the list (the side panel, the Inbox's split) the click also shows the task there, as moving the cursor does. A click never starts editing and never opens the task's page.
- **A second click edits.** A click on the title of the row that was already selected when the press began turns the title into the inline editor, with the caret where the user clicked: in every editable list, beside the side panel and in the Inbox's split too, where a click never edited before. `F2` still does the same from the keyboard. The first click of a double-click on an unselected row only selects, so a quick double-click never edits.
- **Opening stays where it is.** Enter on the selected row (the side panel or the Inbox's split shows it first, a second Enter opens the page, as today), a double-click on the row, Open task in an expanded row, and Open details or `Shift+Enter` in the inline editor open the task. A double-click on a title being edited still selects a word.
- **`a` after a click.** Because a single click no longer edits, select-then-`a` adds a subtask under the selected row the same way in Today, Upcoming, projects, labels, places and the Inbox, and `a` never lands in the title field. (`a` while typing in a field stays typing.)
- **The "Click a task to" setting is removed**, with its three choices (Edit in place, Open details, Expand the row). The value a device stored is no longer read. Expanding a row stays one key or one click away: → and the row's Show details action, unchanged.
- **Unchanged:** Shift and Ctrl/⌘ clicks and Select mode tick rows; a press that moves is a drag; the row's controls keep their actions; a tap on a touch screen, and a click below 768 px, open the task as today (its page, or the side panel or the Inbox's split where they show); the keyboard (Enter, `F2`, →, ←, `a`); the closed side panel reopens on a click as it does today.
- No new op field, entity, route, synced setting, dependency or shortcut. The setting was a device-local value in browser storage, never synced and never in the op schema, so nothing stored has to be migrated. Not **BREAKING**.

Out of scope: the inline editor, `F2` and `a` in the Filter view, saved views, Next, Waiting and on board cards (they get the first-click rule, see design D6; editing there is a follow-up); a new Add subtask binding such as the Shift+Enter of the issue (`a` works once clicks select); the "Add a subtask" line under a parent's subtasks (#1191, PR #1376, compatible); touch, the calendar, Plan, the timeline, dashboards and the review screens.

Roadmap: a follow-up of `inline-task-editing` and `row-click-modes` (the "Expand a row in place" row in ROADMAP.md); listed in the 0.20 table as `click-selects-title`.

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
- Docs: `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md`, `docs/sidebar-schedule.md`, `docs/process-the-inbox.md`, `docs/keyboard.md` (generated); `changelog.d/Changed/click-selects-title.md` with the note for people who chose a setting.
- Tests: `task-list/rowClickModes.test.tsx` and `inlineEditor.test.tsx` rewritten for the rule; `sidePanel`, `inboxSplit` and `sidePanelFollow.perf` tests keep passing; `scripts/e2e-smoke.mjs` stops setting `opentodo.rowClick` and opens tasks with Enter or a double-click; the UX audit's `inline-editor` overlay selects then clicks again; the `taskRow` stories' comments.
- Size: less code than today (one select and its store go); the first-load budget is not raised.
