# Tasks

## 1. Lists

- [x] 1.1 `splitLater` in `web/src/lib/listGroups.ts`: a subtree goes where its top-level task goes; verify `listGroups.test.ts` "a deferred parent takes its subtasks into Later" and "a deferred or parked subtask of an active parent stays under it"
- [x] 1.2 The Later group as a tree (depth, fold state) in `listGroups`; verify the folded case of the same test
- [x] 1.3 `useListModel` and display mode's project page use `splitLater`; verify `npm test` and `npm run build` in web/

## 2. Interface and docs

- [x] 2.1 Story `Screens/Task list/Project Later With Subtasks` with its visual baselines; verify `make ui-check`
- [x] 2.2 `docs/deadlines-and-start-dates.md` and `docs/group-and-order.md`; verify `make docs-check`
- [x] 2.3 CHANGELOG entry under Unreleased, Fixed; verify `make openspec-validate`
