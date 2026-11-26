# Tasks

## 1. The primitive

- [x] 1.1 `Tooltip`: on a coarse pointer a tap on a trigger that is not a control and not inside one opens the tip at once; a second tap, a press elsewhere, a scroll, Escape and blur close it (design D1 to D3). Verify: `npx vitest run src/ui/tooltip.test.tsx` (18 pass: the 13 earlier ones unchanged, 5 new for the two new scenarios, a control, a mouse, and the trigger's own handler).

## 2. Checks

- [ ] 2.1 `npm test` and `npm run build` in `web/`, `make bundle-budget`, `make ui-check`, `make docs-check`, `openspec validate --all --strict`; the layout check in Chromium. Verify: all pass, `LAYOUT OK`.
- [ ] 2.2 In a real browser at 390 px with touch: a tap on a word with a tooltip shows the tip and a tap elsewhere closes it. Verify: a screenshot looked at.
- [ ] 2.3 Rows that open on a tap skip taps on `[data-tip]` (Updates, after `touch-open-and-controls` has merged). Verify: a test in `feedView.test.tsx`.

## 3. Release note

- [x] 3.1 `changelog.d/Fixed/tooltip-tap.md`. Verify: `make docs-check`.
