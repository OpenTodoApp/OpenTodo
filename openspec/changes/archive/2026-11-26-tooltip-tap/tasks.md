# Tasks

## 1. The primitive

- [x] 1.1 `Tooltip`: on a coarse pointer a tap on a trigger that is not a control and not inside one opens the tip at once; a second tap, a press elsewhere, a scroll, Escape and blur close it (design D1 to D3). Verify: `npx vitest run src/ui/tooltip.test.tsx` (18 pass: the 13 earlier ones unchanged, 5 new for the two new scenarios, a control, a mouse, and the trigger's own handler).

## 2. Checks

- [x] 2.1 `npm test` in `web/` (952 files, 11,009 tests pass) and the build, first load 668.4 of 712 KB, `ui-check`, docs build and check, repo checks, `openspec validate`; the layout check in Chromium over the whole inventory: `LAYOUT OK` (2026-11-26).
- [x] 2.2 In a real browser at 390 px with touch: a tap on a word with a tooltip shows the tip and a tap elsewhere closes it. Done on the released 1.10.1 build (2026-11-26, Chromium with touch, a seeded server): in a task's Activity, a tap on the time "just now" showed its tooltip "Nov 26, 10:41 PM" at once, and a tap elsewhere closed it; screenshot looked at.
- [x] 2.3 Rows that open on a tap skip taps on `[data-tip]`: Updates (`FeedView.tsx`). Verify: `feedView.test.tsx` "a tap on a word that explains itself in a tooltip opens nothing".

## 3. Release note

- [x] 3.1 `changelog.d/Fixed/tooltip-tap.md`. Verify: `make docs-check`.
