# Tasks

## 1. The split and the empty pane

- [x] 1.1 `setTaskSplit(on, empty?)` with `taskSplitDocks`, `splitEmptyPane` and `useSplitEmptyPane` in `panel.ts`; `PanelHost` draws the empty pane in the slot's frame from 1024 px; `:root[data-task-split]` widens `--panel-w` (D2); verify `inboxSplit.test.tsx` "shows No task selected" and the existing `panelMotion.test.tsx`
- [x] 1.2 `useInboxSplit`: the Inbox sets the split with `InboxEmptyPane`, the docked task follows the cursor, closing the docked task clears the cursor; no pane on an empty Inbox (D1, D2); verify `inboxSplit.test.tsx` (the pane follows `j`, Esc empties it, below 1024 px no pane)
- [x] 1.3 Enter on the split opens the task page (`list.open`, and the row's open action for a keyboard activation of the docked row); Escape on the split clears the cursor; a click on a title docks the task instead of editing it in place (D1); verify `inboxSplit.test.tsx` "Enter opens its page" and the full web suite

## 2. Process and the source line

- [x] 2.1 Process as the primary action with its key, `inbox.process` (`p`, view scope, Inbox) in the shortcut registry, "{n} to sort" in the header's meta (D3); verify `inboxSplit.test.tsx` "Process is the primary action with P" and the shortcut registry tests
- [x] 2.2 `lib/taskSource.ts` and the row's source line on top-level Inbox rows, standing for the origin item there (D4); verify `taskSource.test.ts` and `inboxSplit.test.tsx` "each row says where its task came from"
- [x] 2.3 Strings in the five catalogs; verify `make i18n-check`

## 3. Stories, docs and release

- [x] 3.1 Stories: the Inbox split with a docked task and with "No task selected", and source lines on rows; verify `npm run build-storybook` through `make ui-check`
- [x] 3.2 Update `docs/process-the-inbox.md` (the Inbox beside its tasks, `P`, source lines) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 3.3 Regenerate the visual baselines with the "UI baselines" workflow; verify `make ui-check` in CI
- [x] 3.4 Run `npm test` and `npm run build` in `web/`, `make openspec-validate`, open the pull request and get CI green
