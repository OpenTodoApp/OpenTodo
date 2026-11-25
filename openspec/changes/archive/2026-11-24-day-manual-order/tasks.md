## 1. Order

- [x] 1.1 `listDisplay.ts`: Manual order in Today's Order by under every grouping and in Upcoming's; an unknown `upcoming_sort_by` reads as Due date. Verify: `cd web && npx vitest run src/lib/listDisplay.test.ts`.
- [x] 1.2 The Due date comparator ranks a day's tasks by part of the day while day parts are on (design D4), in Today's groups and Upcoming's days. Verify: `src/lib/dayOrder.test.ts` "Part of the day in the due order".
- [x] 1.3 Today (every grouping) and Upcoming read `today_manual_order` under Manual order. Verify: `src/lib/dayOrder.test.ts` "Manual order of the day".

## 2. Moves

- [x] 2.1 `viewOrderMove.ts`: the host names its page; a move in a day reorders and seeds under another order, switching that page to Manual order (D2, D3). Verify: `src/lib/viewOrderMove.day.test.ts`.
- [x] 2.2 `dropInDay`: a line in another day or part writes the date or part and the order in one batch with one Undo; done and deleted ids are pruned; two devices converge. Verify: `src/lib/viewOrderMove.day.test.ts`.
- [x] 2.3 Drag, Alt+Up/Down, Vim Shift+J/K and the row menu in Today (every grouping) and Upcoming's days, stopping at the group edge. Verify: `src/app/task-list/dayOrderDrop.test.ts` and `cd web && npm test`.

## 3. Docs and checks

- [x] 3.1 `internal/sync/ops.go` comment on `today_manual_order`, generated op schema. Verify: `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`, then `go test ./internal/sync`.
- [x] 3.2 Today and Upcoming guides in `docs/`, `changelog.d/Added/day-manual-order.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `make bundle-budget`, `cd web && npm test && npm run build`, `make check`.
