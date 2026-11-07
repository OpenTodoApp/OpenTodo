# Tasks

## 1. Task deltas and the equivalence harness

- [x] 1.1 `lib/taskDelta.ts` (D1): `noteChanges`, `changesBetween`, `patchSorted`, `Derived`, `noteKeys`, `keysBetween`; verify `taskDelta.test.ts` (merged links, too far, too many, a sorted patch equals a filter)
- [x] 1.2 The snapshot patches its visible sets and notes the changes (`patchSets`); verify `taskSnapshot.test.ts` (patched sets equal a full read after every kind of write; several workspaces derive in full)
- [x] 1.3 The equivalence harness (D6): a seeded random account and random writes, each step linked as the snapshot links it; verify `incrementalEquivalence.test.ts` runs the full forms against themselves and passes with `npx vitest run`

## 2. Incremental derivations

- [x] 2.1 Shared per-snapshot index, open tasks and open counts per project (`lib/liveTasks.ts`); verify the equivalence test
- [x] 2.2 Progress, blockers, habits and flows patched (D2); verify the equivalence test (every task's progress, blockers, streaks and flow answers)
- [x] 2.3 A view's tasks and a project's completed tasks by section patched; `useListModel` uses the incremental forms; verify the equivalence test (every view, the project and Today groups, the closed list fill) and `npx vitest run src/app`
- [x] 2.4 Rows compare only the changed keys (D3); verify a unit test (a write that changes one row's progress compares that row only) and `rowRenderer.test.tsx`
- [x] 2.5 Sidebar counts and the app badge patched (D2); verify the equivalence test (Inbox, Today, assigned, per project, per label) and the sidebar tests

## 3. One redraw per completion

- [x] 3.1 The departing row removes itself when its departure ends; the list no longer subscribes to the ends (D4); verify `departureRows.test.tsx` (the ghost draws nothing after the moment, the list does not draw again) and the completion tests

## 4. Blocks of rows

- [x] 4.1 `rowBlocks` and the list's blocks with `content-visibility` on the block (D5); verify `rowBlocks.test.ts` (a removed or added row moves no other row to another block, splits, hysteresis), the list tests, `make ui-check`
- [x] 4.2 `scripts/perf/a11y-list.mjs` counts the rule on blocks; verify it passes on the 10,000-task fixture (2,000 row items in their named lists, each with its Complete button)

## 5. Measure and document

- [ ] 5.1 Phone and desktop profiles, five runs each of `scripts/perf/run.mjs`, before and after: every list budget (complete-task, cursor-move, search-keystroke, saved-view, open-project, remote-edit, cold-start); record the numbers in this design and the pull requests
- [x] 5.2 `npm run build` and `make bundle-budget` within `web/bundle-budget.json`; `make docs-check`; `docs/performance.md` names the change; changelog fragment `changelog.d/Changed/incremental-list-updates.md`
