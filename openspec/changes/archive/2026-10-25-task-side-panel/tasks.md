# Tasks

## 1. The preference

- [x] 1.1 Additive `user_prefs.task_open` in `internal/sync/ops.go` `Schema` and the schema fixture, `UserPrefs` in `web/src/lib/types.ts`, `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`; `readTaskOpen`, `setTaskOpen` and `useTaskOpen` (empty or unknown reads as `page`) (D1); verify `go test ./internal/sync/...` and `taskOpen.test.ts`
- [x] 1.2 Settings → Appearance → Task details (`appearance/task-details`) with the "Open tasks" row, its copy, the settings search entry and the `panel-right` icon (D1); verify `settingsSections.test.tsx`, `settingsSearch.test.tsx` and the settings anatomy and copy tests

## 2. The side panel

- [x] 2.1 `panel.ts`: the split's kind, `sidePanelDocks`, the open state and the stored width (`opentodo.taskPanel.closed`, `opentodo.taskPanel.width`); an explicit open reopens the panel, Close remembers (D2 to D4); verify `sidePanel.test.tsx`
- [x] 2.2 `useSidePanel` in `app/sidePanel.tsx`: the split on list pages with the preference, the cursor followed while open and nothing ticked, the empty pane with Close (D4, D8); wired into `TaskListView` (with the Inbox choosing between `useInboxSplit` and the side panel, D7) and `useListKeys` (Filter view, saved views, Next, Waiting); verify `sidePanel.test.tsx` and `inboxSplit.test.tsx`
- [x] 2.3 Escape on the list, a click on its empty part and Enter follow D4 on a side-panel page; Escape inside the panel closes it; a click on a title shows the task (D5); verify `sidePanel.test.tsx` and the full web suite
- [x] 2.4 The resize handle on the docked task and the empty pane: drag, ←/→ (Shift), Home and double click, bounds in CSS (D3); verify `sidePanel.test.tsx` "resize"

## 3. Strings, stories, docs and release

- [x] 3.1 Strings in the six catalogs; verify `make i18n-check`
- [x] 3.2 Stories: a list with the side panel and the empty side pane, the Task details settings page; verify `make ui-lint` and `npm run build-storybook`
- [x] 3.3 Docs: `docs/task-panel.md`, `docs/settings-you.md`, `docs/interface-guide.md`; the CHANGELOG under Unreleased; verify `make docs-check`
- [x] 3.4 Run `npm test` and `npm run build` in `web/`, `go test ./...`, `make check`, regenerate the visual baselines, open the pull request and get CI green
