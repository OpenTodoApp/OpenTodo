# Tasks

## 1. The row

- [x] 1.1 `RowActionCluster` shows Edit (pencil, `F2` in its tooltip) in Show details' place on a writable row of a list with the inline editor; a viewer's row and the Filter view, saved views, Next and Waiting keep Show details; the Edit click does not reach the row (`TaskRow` `onEdit`, `TaskListRow` and `ListGroups` `editInPlace`). Verify: vitest `src/app/task-list/rowEditAction.test.tsx` ("Edit in the revealed actions"), `src/app/task-list/rowExpand.test.tsx` (the actions of a Today row and a saved view row); `npm test` in web/.
- [x] 1.2 Edit opens the `F2` editor with a fine pointer from 768 px and the compact one with Save and Cancel otherwise (`editTitle` in `TaskListView.tsx`); `F2` on the cursor row is unchanged. Verify: `rowEditAction.test.tsx` (F2, the phone menu) and `clickSelects.test.tsx` (the touch editor's Save and Cancel).

## 2. The row menu

- [x] 2.1 One task's menu holds Edit (`F2`), Show details / Hide details (→ / ←, from 768 px) and Open details (Enter), from More, `.`, the right-click and the touch hold; several ticked tasks get none; a viewer gets no Edit (`bulk/BulkActions.tsx` `RowMenuItems`, `bulk/useRowMenu.tsx`). **Edit title** is renamed **Edit** and leaves every catalogue. Verify: `rowEditAction.test.tsx` ("Edit and Open details in the row menu"); `clickSelects.test.tsx` (a viewer's menu has no Edit); `make i18n-check`.
- [x] 2.2 Open details opens the task as Enter does: the page with "As a page", the side panel with "In a side panel". Verify: `rowEditAction.test.tsx`.

## 3. The task beside the list

- [x] 3.1 An edit, or More, on a row other than the task in the side panel or the Inbox's split keeps that task there; `j`/`k`, a click on a row (the selected row's empty area included) or another task opened there ends it; closing the pane leaves it closed (`TaskListView.tsx` `dockHold`, `useListBindings.ts`, `useInboxSplit.tsx` `dockId`). Verify: `rowEditAction.test.tsx` ("the task beside the list stays while another row is edited") for the side panel and the Inbox's split; `sidePanel.test.tsx`, `inboxSplit.test.tsx` and `clickSelects.test.tsx` still pass.

## 4. Docs and checks

- [x] 4.1 `docs/work-from-the-list.md`, `docs/expand-a-row.md`, `docs/task-panel.md` (each under 600 words), `docs/interface-guide.md`; `changelog.d/Changed/row-edit-action.md`; the overlapping `click-selects-title` delta names the menu action **Edit**. Verify: `make docs` and `make docs-check`.
- [x] 4.2 Story baselines that change are listed in the pull request (the revealed actions and the row menu); `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` in web/, `make ui-lint`, `make bundle-budget`, `make openspec-validate`.
