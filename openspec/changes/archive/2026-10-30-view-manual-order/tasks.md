## 1. Field

- [x] 1.1 `internal/sync/ops.go`: kind `kOrderList` (at most `MaxManualOrder` = 500 distinct ids of 1 to 64 characters), additive `label.manual_order` and `view.manual_order` (default `[]`, not content); `kinds_test.go` cases (valid, 501 ids, duplicate, empty id, not an array, null); `go test ./internal/sync/...`
- [x] 1.2 Regenerate `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go` and the schema fixture with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; `go test ./internal/sync/... ./internal/e2ee/...`

## 2. Order and planning

- [x] 2.1 `web/src/lib/viewOrder.ts`: the manual comparator (placed by rank, then position, due, priority, id), `planViewOrder` (prefix up to the last placed task, hidden ids kept after their predecessor or dropped, cap 500), `stepAnchor` (neighbour in the group); `viewOrder.test.ts`
- [x] 2.2 `web/src/lib/viewOrderMove.ts`: read the label or view, plan, write `manual_order` as one undoable batch (inverse `[]` when absent), drop deleted, completed and unknown ids; `viewOrderMove.test.ts` (fake-indexeddb: write, undo, viewer-owned shared-project task, no task position written)
- [x] 2.3 `runView` and `evaluateViews` (`web/src/lib/views.ts`) and label pages (`web/src/lib/listGroups.ts` via `useListModel`) sort by the manual order under Order by Manual order; `views.test.ts` / `listGroups` tests

## 3. Interface

- [x] 3.1 Label page (`TaskListView`, `useListDrag`, `useListShortcuts`): drag within the group, Alt+arrows, switch to Manual order first, Undo toast; no inside drop; Vim Shift+J/K through the list state's `moveBy`; happy-dom test
- [x] 3.2 Saved view (`SavedViewView`, `useListKeys`, `ViewResults` rows and cards): drag within the group (list and board), Alt+arrows, touch hold, switch to Manual order first, Undo toast; happy-dom test
- [x] 3.3 New view page: Order by without Manual order; a draft with `position` reads as Due date; test
- [x] 3.4 Strings ("Order changed") in the six catalogues; `make i18n-check`

## 4. Docs and checks

- [x] 4.1 `docs/sync.md` (label and view fields, "Saved views"), `docs/api.md` (`manual_order` on labels and views), guide pages for labels and saved views; `make docs-check`
- [x] 4.2 `go test ./...`, `cd web && npm test && npm run build`, `make bundle-budget`, `make ui-lint`, `make openspec-validate`
