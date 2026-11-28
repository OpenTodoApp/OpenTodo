## 1. Before any change

- [x] 1.1 Drive the built app at 390 × 844 with touch (Chromium, a fresh data directory, the audit's seeded account): hold a card at the right edge, hold a card and read its sheet, tap a card, measure its circle, reload the board. Verify: the findings in `design.md` "Context", from the run's output and screenshots.

## 2. A held card scrolls the board

- [x] 2.1 `lib/dnd.ts`: `data-edge-scroll="y"` joins the scrollers a drag scrolls up and down. Verify: `dnd.test.ts` "a column's cards scroll before the page".
- [x] 2.2 `lib/dnd.ts`: `nextSnap` and `sideScroller` (which scroller, which way, what step, the snap point). Verify: `dnd.test.ts` "the sideways scroller near the pointer" and "the neighbouring snap point".
- [x] 2.3 `lib/dnd.ts`: the frame loop turns a snapping scroller one column after 300 ms and again every 700 ms, scrolls another steadily, and re-reads the target. Verify: `dnd.test.ts` "a card held at the edge of a snapping board turns it one column at a time" and "a board that does not snap scrolls steadily".
- [x] 2.4 `BoardView.tsx` and `views/ViewResults.tsx` carry the marks. Verify: `boardPhone.test.tsx` "the board and its columns ask for edge scrolling"; `boardSurfaces.test.tsx` "a card held at the board's edge scrolls it and the drop lands in the column that slid in".

## 3. A board opens at its first column

- [x] 3.1 `BoardView.tsx`: below 640 px the row returns to its start when the first column changes, until the person moves the board. Verify: `boardPhone.test.tsx` "a first column that arrives late is shown" and "a board the person moved stays where it is".

## 4. Docs and checks

- [x] 4.1 `docs/sections-and-boards.md` and `changelog.d/Changed/phone-board.md`. Verify: `npm run docs:build` and `npm run docs:check` in web/.
- [x] 4.2 `npx tsc --noEmit -p .`, `npm run lint`, `npm test` and `npm run build` in web/; `node scripts/ui-check.mjs`, `node --test scripts/repo-checks.test.mjs`, `node scripts/i18n-check.mjs`, `node scripts/bundle-budget.mjs`, `openspec validate --all --strict`.
- [x] 4.3 In Chromium at 390 × 844 with touch: drag a card from the first column to the third, move a card with the sheet, tap a card, reload the board. Verify: the run's output and screenshots.
- [ ] 4.4 On an iPhone (the installed web app and the iOS app): hold a card at the board's edge; the board turns one column at a time and the drop lands.
