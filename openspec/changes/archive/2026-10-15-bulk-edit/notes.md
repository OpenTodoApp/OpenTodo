# Implementation notes

## Smoke test (task 7.1), 2026-10-15

Built binary on port 18080 with a throwaway data directory, driven by Playwright:

- Inbox: `j`, `x`, `Shift+↓` twice showed "3 selected"; `c` completed the three ("3 tasks completed · Undo") and Undo restored them ("Undone: 3 restored.").
- `Ctrl`+click on one row and Shift+click on another ticked a range of three without opening a panel; `.` → **Tomorrow** rescheduled them ("3 tasks rescheduled").
- Filter view (`@errand`): Enter, `x` showed "1 selected", `1` set the priority ("Priority 1 set on 1 task").
- No console or page errors.

The move review into a shared project, the touch Select button and Vim `x`/`dd` on a selection are covered by component tests (`review.test.tsx`, `bulk.test.tsx`, `vim/actionsBulk.test.ts`) and the layout check (`bulk-actions-menu`, `bulk-review` and `bulk-toast` overlays at 360, 390 and 768 px in Chromium and WebKit). Two-device convergence of a batched completion is `bulk.test.ts` "two devices complete the same occurrence in a batch".

## Decisions taken while implementing

- Applying a batch is not wrapped in one Dexie transaction: the rows are read, planned and written with one `mutateMany` through `applyBatch` (the same shape the assistant uses), which keeps one timestamp per batch and the undo clocks exact.
- The review shows one item per ticked task, worded as its visible change ("Move to Home", shared badge); applying expands the checked items into their real changes, so a move across sharing scopes (copies plus tombstones) is never applied by halves.
- The Actions menu reuses `ActionMenu`; a picker with `multiple` now stays open after a pick (bulk labels).
- Selection in the Filter view and saved views is provided by `useBulkList` and handled in `useListKeys`; `ListState` gained `ticked`, `tick` and `openActions`, which the Vim layer and the command palette use ("Complete 3 tasks").
