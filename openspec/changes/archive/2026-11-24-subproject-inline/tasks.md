# Tasks

## 1. The list model

- [x] 1.1 `listGroups` emits the Sub-projects bar and one group per shown sub-project (rows only while open, nested one depth per level, the view's sort; section order in manual order; no arrow with a grouping or the columns layout). Verify: `listGroups.test.ts` "sub-projects in the list" (rows and order, none while folded, nesting, the view's sort and filtered tasks, the rows' sections); `npm test -- listGroups` in web/.
- [x] 1.2 `useSubProjectList` works out the opened sub-projects' tasks from a project index and `patchViewTasks`, filtered by the view's query and duration filters. Verify: "applies the view's query filter inside and follows a sync from another device" in `subProjects.test.tsx`.

## 2. The screen

- [x] 2.1 The sub-project row's arrow toggles in place, the name opens the sub-project, the state survives a remount; the bar folds as before (its old device key read once). Verify: `subProjects.test.tsx` "opens with its arrow, nests its own sub-projects…"; `npm test -- subProjects` in web/.
- [x] 2.2 `j`/`k` move to an opened task, `x` ticks it and `c` completes it with Undo; a viewer of the sub-project sees read-only rows. Verify: `subProjects.test.tsx` "moves the cursor to an opened task…".
- [x] 2.3 A drop on a sub-project row and on the Tasks bar moves the task with Undo; no drop line on a row of another project. Verify: `subProjects.test.tsx` "drops a task on a sub-project row and back on the Tasks bar…".
- [x] 2.4 No arrow with a grouping, on the board or on the timeline. Verify: `subProjects.test.tsx` "offers no arrow with a grouping, on the board or on the timeline".

## 3. Look, docs and checks

- [x] 3.1 Stories `Screens/Task list/Project With Sub Projects` and `Project With Sub Projects Open` at 375 and 1280 px, light and dark, baselines from the UI baselines workflow (`stories`: `screens-task-list--project-with-sub-projects`). Verify: the workflow's artifact holds the two stories' captures.
- [x] 3.2 `docs/projects.md` and `changelog.d/Added/subproject-inline.md`. Verify: `make docs` and `make docs-check`.
- [x] 3.3 `make check`. Verify: it passes (bundle budget included).
