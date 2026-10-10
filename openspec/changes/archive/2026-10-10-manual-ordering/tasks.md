# Tasks

## 1. Ordering helpers (web/src/lib)

- [x] 1.1 `order.ts`: `compareByPosition` (`position`, then id), `positionBetween(prev, next)`, `needsRenumber`, `renumber(list)`; verify `order.test.ts` midpoint 1500 between 1000 and 2000, before-first and after-last offsets, renumber preserves order (`npm test`)
  - Done in `web/src/lib/ordering.ts` (the module board-view shipped; no separate `order.ts`); tests in `web/src/lib/ordering.test.ts`. Renumbering covers the smallest window around the gap rather than always the whole list (see design implementation notes).
- [x] 1.2 `moveItem(entity, id, {container, index})` writing container field(s) and `position` in one `mutate()`, renumbering the target list when the gap is exhausted; verify `order.test.ts` "one op per move", "exhausted gap renumbers only that list", "cross-container move shares one timestamp" (`npm test`)
  - `web/src/lib/move.ts` (`moveTask`, `moveTaskBy`, `moveProjectTo`, `moveProjectBy`, `moveItem`); verified by the named tests in `ordering.test.ts`.
- [x] 1.3 Convergence tests: two devices move different tasks, the same task, renumber concurrent with a move; verify `order.test.ts` applies both op sets in both orders and asserts identical, duplicate-free order (`npm test`)
  - Three scenarios, each replayed in three delivery orders on fresh replicas; the renumber case documents the D4 interleaving.
- [x] 1.4 Apply `compareByPosition` as the sort for project, Inbox and sidebar lists and as the tie-breaker for date and filter views; verify `order.test.ts` "Upcoming tie-break by position" (`npm test`)
  - `compareByPosition` in project/Inbox/section lists and tree siblings (sidebar); `compareDueThenPriority` in Today, Upcoming, Assigned, Filter and calendar lists.

## 2. Interaction (web/src/app)

- [x] 2.1 Pointer-based drag primitive `lib/dnd.ts` (6 px threshold, 300 ms touch hold, ghost, Escape cancel) if not already shipped by `board-view`; verify browser flow with mouse and touch emulation: cancelled drag queues no op
  - Already shipped by board-view (5 px / 350 ms), reused unchanged. Browser smoke (mouse, offline): a drag cancelled with Escape left the order unchanged and queued no op. Touch emulation was not run (Playwright cannot synthesize a long-press drag); the touch path is board-view's, unchanged.
- [x] 2.2 Drop indicators and drop handling in `TaskListView.tsx` within sections and under parents, and in board columns; verify browser flow matching "Drag to a new place" and "Drop into another section at a place"
  - Browser smoke: third task dragged above the first (one `position` op offline, survives reload), drop on a row's middle nests, drop between the first and second task of another section, reorder within a board column: all passed.
- [x] 2.3 Sidebar project reordering among siblings (drag and Alt+Up/Down); verify browser flow matching "Reorder sidebar projects"
  - Browser smoke: Alt+Down on "Home" swapped it with the next top-level project and kept focus; dragging "Garden" below "Home" reordered the sidebar.
- [x] 2.4 Keyboard moves Alt+Up/Down and Alt+Shift+Up/Down with selection retained and no-op at edges, suppressed while typing and in non-manual views; verify browser flow matching "Move up", "Edge of the list" and "Not draggable in Today"
  - Browser smoke: Alt+Up moved the second task first and kept it selected; at the edge no op; Alt+Shift+Down to the bottom; Today rows not draggable and Alt+Up there queued nothing.
- [x] 2.5 Update `?` help, including the "sorted by date" note in non-manual views; `npm run build` passes with bundle growth under 5 KB gzipped; verify by comparing `dist` sizes
  - Help rows for Alt+arrows, drag and the date-sorted views; "sorted by date" caption in Today/Upcoming/Assigned. Bundle +2.9 KB gzipped (223.99 -> 226.87 kB).

## 3. Integration and docs

- [x] 3.1 Two-device browser run: reorder the same project offline on both devices (different tasks, then the same task), reconnect; verify both lists identical and every task present once
  - Browser run with two contexts of one account, both offline: after reconnect the lists were identical and every task appeared exactly once. Caveat: in that run the keyboard moves went to a sidebar project that was still focused after a click, so both devices moved the project instead of the tasks and the intent check (X first, same task last) failed. Fixed afterwards (j/k now takes focus off a focused sidebar project) but not re-run in the browser because only one smoke run was allowed; the intended outcomes are covered by the convergence unit tests in 1.3.
- [x] 3.2 Document the `(position, id)` rule and renumbering in `docs/sync.md`; README feature list; CHANGELOG under Unreleased; verify `make check` passes
  - `docs/sync.md` "Manual order", `docs/api.md` task `position`, README feature row, CHANGELOG; `make check` green.
