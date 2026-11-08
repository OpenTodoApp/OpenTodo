# Tasks

## 1. Data

- [x] 1.1 `web/src/lib/createAfter.ts`: `createTaskAfter` creates a task in the anchor's project, parent and section and places it after a given task (verified by `addBelow.test.tsx`)

## 2. The list

- [x] 2.1 `task-list/TaskListRow.tsx`: one inline `AddLine` for "Add subtask" and "Add task below"; leaving it empty closes it unless focus went to the line that replaced it (verified by `addBelow.test.tsx`)
- [x] 2.2 `task-list/belowLine.ts` and the lazy `task-list/SiblingInput.tsx`: where the line is drawn (after the last added task and its subtasks) and its add; `TaskListView.tsx`, `ListGroups.tsx`, `useListShortcuts.ts` (Escape), `useListBindings.ts` (reset on a route change) (verified by `addBelow.test.tsx`)
- [x] 2.3 `bulk/BulkActions.tsx`: `addItems`, offered with the Reorder items in a tree list for a task that can move; the list opens the line on the next frame (verified by `addBelow.test.tsx`)

## 3. Docs and checks

- [x] 3.1 Strings in every shipped catalog; `docs/notes-and-subtasks.md`, `docs/work-from-the-list.md`; changelog fragment `changelog.d/Added/add-below.md`
- [x] 3.2 `npx vitest run src/app/addBelow.test.tsx src/app/task-list src/app/bulk src/app/task-row-contextmenu.test.tsx`, `npm run build`, `make bundle-budget i18n-check ui-lint docs-check openspec-validate repo-check`
