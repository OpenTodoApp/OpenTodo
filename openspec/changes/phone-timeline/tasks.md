# Tasks

## 1. What is true before

- [x] 1.1 Built app, the layout check's seed plus a five-day and a one-day bar, Chromium with touch at 390 × 844: a tap on a bar, a hold and move 12 px and 2 px inside an end and in the middle, a swipe on a bar and beside it, a bar held at each edge of the grid. Verify: the table in `design.md` (Context), from the run.

## 2. Web app

- [x] 2.1 `touchGrab(x, barWidth, ends)` and `TOUCH_END_PX` in `web/src/lib/timeline.ts`: the part of a bar a finger pressed. Verify: `npx vitest run src/lib/timeline.test.ts` ("touchGrab").
- [x] 2.2 `TimelineBar`: a touch press drags the part `touchGrab` names, the end spans leave a touch press to the bar, a mouse or a pen keeps them; a click opens the task on a coarse pointer and selects otherwise. Verify: `npx vitest run src/app/timelineView.test.tsx` ("by touch (phone-timeline)").
- [x] 2.3 The grid scrolls sideways under a lifted drag near its left or right edge, in `TimelineView.tsx`, and marks the day under the pointer. Verify: the same file ("the grid scrolls under a dragged bar").
- [x] 2.4 A group bar's spacer takes the rest of its row, so the grid is as wide as the axis below 768 px. Verify: the same file ("a group bar is no wider than the axis"), and in the browser the grid's `scrollWidth` against the axis's width at 390 and 1280 px.
- [x] 2.5 Type-check, lint and the suite. Verify: `npx tsc --noEmit -p .`, `npm run lint`, `npm test`, `npm run build` in `web/`; `node scripts/i18n-check.mjs` (no new string); `node scripts/bundle-budget.mjs`.
- [x] 2.6 The axis' labels, seen in the Android app: the "Today" mark covered "26" and 6 px of "27", and "Dec 1" wrapped in its 32 px column with the "1" over the first row. `AxisColumns` in `TimelineView.tsx`: today's column draws its own label on the accent, the first of a month reads as the month, each label is one line cut to its column. Verify: `npx vitest run src/app/timelineView.test.tsx` ("marks today on its own column's label"), and in Chromium at 390 × 844 and 1280 × 800 no label's text box meets the mark of another column or a row.

## 3. Checks in a browser

- [x] 3.1 The run of 1.1 again on the new build: a tap on a bar opens the task; a hold 12 px inside the right end and a move changes the deadline, 12 px inside the left end the start; the middle of the five-day and of the one-day bar moves it; a swipe on a bar and beside it scrolls the grid and changes no date; a bar held at the right and at the left edge scrolls the grid and lands on the day under the finger; a tap on a name opens the task. Verify: the run's report and screenshots.
- [x] 3.2 With a mouse at 1280 px: a click on a bar selects, a double click opens, the 6 px handle sets the deadline, a drag held at the grid's right edge scrolls it.
- [ ] 3.3 On a phone, in the Android and the iOS app and in Safari: a tap on a bar, a bar's ends by finger, the grid under a held bar.

## 4. Docs and release

- [x] 4.1 `docs/project-timeline.md`: the timeline by touch. Verify: `npm run docs:build`, `npm run docs:check`.
- [x] 4.2 Changelog fragment `changelog.d/Changed/phone-timeline.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [x] 4.3 `npx @fission-ai/openspec validate --all --strict`, `node scripts/ui-check.mjs`.
