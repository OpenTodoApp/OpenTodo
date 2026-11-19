# Tasks

## 1. The handle

- [x] 1.1 `useSubtaskOrder` in `web/src/app/task-detail/subtaskOrder.ts`: the draft order while dragging, the release through `moveTask`, the keys and menu through `moveTaskBy`, the announcement; `Subtasks.tsx` shows a `MoveHandle` on each open subtask where the list has its add line, the task can be edited and two subtasks or more are open. Verify: `web/src/app/task-detail/subtasks.test.tsx` "moving a subtask" (keys, top, edge, menu, completed, viewer); `npm test`, `npm run typecheck`, `npm run lint` in web/.

## 2. Docs and checks

- [x] 2.1 `changelog.d/Added/subtask-panel-order.md`; the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make repo-check`, `make openspec-validate`, `make bundle-budget`.
