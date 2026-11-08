## 1. Fix

- [x] 1.1 `pending` on `ActionMenu` holds the panel back (`web/src/app/menus/ActionMenu.tsx`)
- [x] 1.2 `useBulkData` reports `ready` and `BulkActionsMenu` waits for it once (`web/src/app/bulk/BulkActions.tsx`, `useLabelsLoaded` in `web/src/lib/localData.ts`)

## 2. Checks

- [x] 2.1 Regression test `web/src/app/task-row-contextmenu.test.tsx` "the menu opens complete (issue 840)": fails before the fix (the first panel lacked `today-focus,track,focus`), passes after
- [x] 2.2 `npm run typecheck`, `make web-lint`, the web suite, `npm run build` and the bundle budget; CHANGELOG
