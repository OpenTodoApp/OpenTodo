# Tasks

## 1. The project view

- [x] 1.1 `SubProjects` rows take a task row's empty leading slot, so the mark is in the checkbox column; the row hover token; 44 px on touch. Verify: `subProjects.test.tsx` ("puts the tasks under their own Tasks bar…") checks the row's columns; `npm test -- subProjects` in web/.
- [x] 1.2 `listGroups` makes the project's `all` group a "Tasks" group with the open count when `useHasSubProjects` is true, folded per project with no rows while folded; none with sections, a grouping or no sub-projects; the board shows no group. Verify (also the per-project fold, and that `j` and Enter reach no folded task): the three tests in `subProjects.test.tsx` "sub-projects above the tasks"; `npm test` in web/.

## 2. Look and checks

- [x] 2.1 The story `Screens/Task list/Project With Sub Projects` and its baselines at 375 and 1280 px, light and dark, from the UI baselines workflow (`stories`: `screens-task-list--project`); the other project stories unchanged. Verify: the workflow's artifact holds only the new story's captures besides the four `screens-task-row--adding-below` ones main already carries (byte-identical, not committed here).
- [x] 2.2 `changelog.d/Fixed/subprojects-above-tasks.md`. Verify: `make docs-check`.
- [x] 2.3 Typecheck, lint, `make i18n-check`, `make openspec-validate` and `npm test` in web/. Verify: each passes.
