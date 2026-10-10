# Tasks

## 1. Ordering helpers (web/src/lib)

- [ ] 1.1 `order.ts`: `compareByPosition` (`position`, then id), `positionBetween(prev, next)`, `needsRenumber`, `renumber(list)`; verify `order.test.ts` midpoint 1500 between 1000 and 2000, before-first and after-last offsets, renumber preserves order (`npm test`)
- [ ] 1.2 `moveItem(entity, id, {container, index})` writing container field(s) and `position` in one `mutate()`, renumbering the target list when the gap is exhausted; verify `order.test.ts` "one op per move", "exhausted gap renumbers only that list", "cross-container move shares one timestamp" (`npm test`)
- [ ] 1.3 Convergence tests: two devices move different tasks, the same task, renumber concurrent with a move; verify `order.test.ts` applies both op sets in both orders and asserts identical, duplicate-free order (`npm test`)
- [ ] 1.4 Apply `compareByPosition` as the sort for project, Inbox and sidebar lists and as the tie-breaker for date and filter views; verify `order.test.ts` "Upcoming tie-break by position" (`npm test`)

## 2. Interaction (web/src/app)

- [ ] 2.1 Pointer-based drag primitive `lib/dnd.ts` (6 px threshold, 300 ms touch hold, ghost, Escape cancel) if not already shipped by `board-view`; verify browser flow with mouse and touch emulation: cancelled drag queues no op
- [ ] 2.2 Drop indicators and drop handling in `TaskListView.tsx` within sections and under parents, and in board columns; verify browser flow matching "Drag to a new place" and "Drop into another section at a place"
- [ ] 2.3 Sidebar project reordering among siblings (drag and Alt+Up/Down); verify browser flow matching "Reorder sidebar projects"
- [ ] 2.4 Keyboard moves Alt+Up/Down and Alt+Shift+Up/Down with selection retained and no-op at edges, suppressed while typing and in non-manual views; verify browser flow matching "Move up", "Edge of the list" and "Not draggable in Today"
- [ ] 2.5 Update `?` help, including the "sorted by date" note in non-manual views; `npm run build` passes with bundle growth under 5 KB gzipped; verify by comparing `dist` sizes

## 3. Integration and docs

- [ ] 3.1 Two-device browser run: reorder the same project offline on both devices (different tasks, then the same task), reconnect; verify both lists identical and every task present once
- [ ] 3.2 Document the `(position, id)` rule and renumbering in `docs/sync.md`; README feature list; CHANGELOG under Unreleased; verify `make check` passes
