# Tasks

## 1. The primitive

- [x] 1.1 `Tooltip`: on a coarse pointer a tap on a trigger that is not a control and not inside one opens the tip at once; a second tap, a press elsewhere, a scroll, Escape and blur close it (design D1 to D3). Verify: `npx vitest run src/ui/tooltip.test.tsx` (18 pass: the 13 earlier ones unchanged, 5 new for the two new scenarios, a control, a mouse, and the trigger's own handler).

## 2. Checks

- [x] 2.1 `npm test` in `web/` (952 files, 11,009 tests pass) and the build, first load 668.4 of 712 KB, `ui-check`, docs build and check, repo checks, `openspec validate`; the layout check in Chromium over the whole inventory: `LAYOUT OK` (2026-11-26).
- [ ] 2.2 In a real browser at 390 px with touch: a tap on a word with a tooltip shows the tip and a tap elsewhere closes it. Verify: a screenshot looked at. Tried on 2026-11-26 on a seeded server: the screens opened there (Updates, Week, Settings → Security and Account) showed no text with a tooltip, so this is still open; the unit tests drive the tap.
- [ ] 2.3 Rows that open on a tap skip taps on `[data-tip]` (Updates, after `touch-open-and-controls` has merged). Verify: a test in `feedView.test.tsx`.

## 3. Release note

- [x] 3.1 `changelog.d/Fixed/tooltip-tap.md`. Verify: `make docs-check`.
