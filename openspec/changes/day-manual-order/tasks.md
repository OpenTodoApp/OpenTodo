## 1. Order

- [ ] 1.1 `listDisplay.ts`: Manual order in Today's Order by under every grouping and in Upcoming's; Reset clears `today_manual_order`. Verify: `cd web && npx vitest run src/lib/listDisplay.test.ts`.
- [ ] 1.2 The Due date comparator ranks a day's tasks by part of the day while day parts are on (D4). Verify: tests for "Part of the day in the due order".
- [ ] 1.3 Upcoming reads `today_manual_order` under Manual order; seeding on the first move (D3). Verify: `src/lib/viewOrder.test.ts`.

## 2. Moves

- [ ] 2.1 Drag, Alt+Up/Down and the row menu move within a group in Today (every grouping) and in a day of Upcoming; a move in another order switches to Manual order. Verify: the scenarios of "Manual order of the day" and "Which views are manually ordered" in `web/src/app` tests.
- [ ] 2.2 A drop between the rows of another group runs that group's heading drop and places the task, one batch, one Undo (D2). Verify: "Into the evening" and an Upcoming cross-day drop test.
- [ ] 2.3 The mobile app's Today and Upcoming. Verify its tests.

## 3. Docs and checks

- [ ] 3.1 Today and Upcoming guides in `docs/`, `changelog.d/Changed/day-manual-order.md`, the row in `ROADMAP.md`, stories and baselines for the drop line in Today and Upcoming. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `make bundle-budget`, `cd web && npm test`, `make ui-check`.
