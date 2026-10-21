# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named. Group 1 can land before `task-panel-polish` and `smart-title-tokens`. Group 2 needs both.

## 1. Selection

- [x] 1.1 Replace the selected row's ring and background with `.row-selected` (leading accent bar, faint tint, no ring), keep hover, ticked and focus styles distinct; verify with `taskRow.test.tsx` (class on the selected row, no `ring-` class) and the `Task/Row` story baselines in both themes via `make ui-check` (axe non-text contrast clean).
- [x] 1.2 Add the click-away handler on the content column (commit, clear selection, close the panel; ignore rows, overlays, the panel and controls); verify with `taskListView.test.tsx` (happy-dom: a click below the last row clears the selection and closes the panel, a click in the panel or a popover does not, Esc order unchanged).

## 2. Inline editing

- [x] 2.1 Add the device-local preference "Click a task to" (`opentodo.rowClick`) in Settings → General; verify with `prefs.test.ts` (default `edit`, not synced) and a settings panel test.
- [x] 2.2 Add `InlineEditor.tsx` (`TitleField`, caret from the click, Enter, Esc, `Shift+Enter`, click-away commit, one row at a time, task disappearing mid-edit) and the click rules in `TaskRow` and `TaskListView` (tick modifiers, coarse pointer, below 768 px, panel open, preference); verify with `inlineEditor.test.tsx` (the typo fix, cancel, `Shift+Enter` opens the panel, panel-open click switches, coarse pointer opens the panel, viewers open the panel) and `listRow.test.tsx` passing.
- [x] 2.3 Add `EditBar` (Date, Priority, Labels, Project, Open details) with the panel's editors and Tab order; verify with `editBar.test.tsx` (Tomorrow sets the due without the panel, labels tick keeps the editor open, Open details saves and opens, popovers are not "outside").
- [x] 2.4 Register `list.edit-inline` (`F2`, `list` scope) and the editor's local keys, resolving any conflict with `labels.rename` explicitly; verify with `shortcuts.test.ts` (no conflict) and `useListShortcuts` tests (`F2` starts the editor).
- [x] 2.5 Add the `Task/Row` "editing inline" story and the inline editor to the layout check at 768 px; verify with `make ui-check` and `ENGINES=chromium make layout-check`.

## 3. Docs and integration

- [x] 3.1 Update `docs/tasks-and-projects.md` (click to edit, Details, `F2`, clearing the selection, the preference), `docs/keyboard.md`, `docs/interface-guide.md` (rows: the selected indicator, the bar inside the row) and the Help pages; verify with `npm run docs:check`.
- [x] 3.2 Run `make check`; verify it passes, and record the entry chunk size difference here.
- [x] 3.3 Run `make openspec-validate`; verify it passes.

- Verified by CI on each merged pull request (#180, #181, #183–#189: Web, Server, Checks, Layout and UI checks). Entry chunk on main after the whole series: 323.79 KB gzipped (323.12 KB before `task-panel-facets`; facets alone −1.05 KB, the When editor, the title editors and inline editing together +1.72 KB).
