## 1. Fix

- [x] 1.1 The Actions menu is held for its target and closes when the ticked set empties (`web/src/app/bulk/useBulkList.tsx`, `web/src/app/TaskListView.tsx`)
- [x] 1.2 The side panel and the Inbox split follow the cursor only while its row is listed (`web/src/app/task-list/useInboxSplit.tsx`)
- [x] 1.3 Regression test `web/src/app/bulk/emptiedList.test.tsx`, failing before the fix

## 2. Checks and docs

- [x] 2.1 CHANGELOG, `npm run typecheck`, `make web-lint`, the web suite, the bundle budget, `make openspec-validate`
