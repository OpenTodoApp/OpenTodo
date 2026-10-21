# Tasks

## 1. Row wiring

- [x] 1.1 Add an optional `onContextMenu?: (e: React.MouseEvent<HTMLLIElement>) => void` to `TaskRowProps` in `web/src/app/TaskRow.tsx` and pass it to the row `<li>`; verify `npm run typecheck` passes and `npm test -- taskRow` is unchanged
- [x] 1.2 Add `context: (e: React.MouseEvent, task: Task) => void` to `RowActions` in `web/src/app/task-list/ListRow.tsx` and wire the row's `onContextMenu` to it; verify `npm run typecheck` passes (every `RowActions` implementor must now provide it)
- [x] 1.3 Implement `context` in `web/src/app/task-list/useListBindings.ts`: always `preventDefault` (the browser menu never shows over a task row), return while `live.current.draggingId` is set (a lifted drag wins), and call `live.current.openContextMenu(c.selection.ticked.has(task.id) ? c.ticked : [task.id], e.clientX, e.clientY)`; add `openContextMenu` and `draggingId` to `BindingContext`; verify `npm run typecheck` and `npm test -- useListBindings taskListView` pass

## 2. The menu at the pointer

- [x] 2.1 In `useListUi` (`web/src/app/TaskListView.tsx`) add the `ctxMenu` state (`{ ids, x, y } | null`) with stable `openContextMenu` / `closeContextMenu` callbacks, pass them into `useListBindings`, and render `<BulkActionsMenu ids={ctxMenu.ids} open …>` next to the existing cursor-menu block with a fixed-position trigger at `(x, y)`; verify `npm test -- taskListView` passes
- [x] 2.2 Thread `triggerProps` through `BulkActionsMenu` (`web/src/app/bulk/BulkActions.tsx`) into `ActionMenu` (`web/src/app/menus/ActionMenu.tsx`) and on to the shared `Menu`; verify `npm run typecheck` passes and `npm test -- ActionMenu bulk` is unchanged
- [x] 2.3 Add the same state, render and `rowProps.onContextMenu` to `useBulkList` (`web/src/app/bulk/useBulkList.tsx`) so the filter, saved-view and method lists get the gesture; verify `npm test -- filterView savedViewView methodList bulk` passes

## 3. Tests

- [x] 3.1 Add `web/src/app/task-row-contextmenu.test.tsx`: a rendered `TaskRow` fires its `onContextMenu` with the pointer coordinates and the default prevented; `useListBindings`' rule is covered through the row: right-click on a ticked row passes every ticked id, on an unticked row just its own, and while `draggingId` is set nothing opens; verify `npm test -- task-row-contextmenu` passes
- [x] 3.2 Verify the menu itself is the existing one: open it by right-click in the test app and assert the label "Actions for 1 task" (or the selection count) and that Escape closes it without a browser menu; verify `npm test` passes

## 4. Spec and docs

- [x] 4.1 Add the ADDED requirement "Open a task's action menu with a right-click" to `openspec/changes/task-row-context-menu/specs/action-menus/spec.md` with its scenarios (ticked selection, unticked row, drag guard, pointer anchor)
- [x] 4.2 Mention the gesture in `docs/keyboard.md` (menu section) and `docs/work-from-the-list.md`; verify `make docs-check` passes
- [x] 4.3 Add an Unreleased entry to `CHANGELOG.md`; verify `make repo-check` passes
- [x] 4.4 Run `make openspec-validate` and verify the change validates with `--strict` — Verified: 121 changes pass, including this one.
