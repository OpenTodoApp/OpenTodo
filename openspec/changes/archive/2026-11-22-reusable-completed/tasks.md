# Tasks

- [x] 1.1 `CompletedGroup` in `web/src/app/task-list/ListGroups.tsx` shows "Completed" for every project; the `gotIt` prop and the model's `reusable` field go. Verify: `web/src/app/quickAdd.reusable.test.tsx` (the group reads "Completed", named "1 completed task"); `npx vitest run src/app/quickAdd.reusable.test.tsx src/app/taskListView.test.tsx src/app/task-list` in web/.
- [x] 1.2 The unused messages leave every catalogue. Verify: `make i18n-check`.
- [x] 1.3 Docs and `changelog.d/Changed/reusable-completed.md`. Verify: `make docs-check`.
- [x] 1.4 Typecheck, `make web-lint`, `make openspec-validate`, `make repo-check`.
