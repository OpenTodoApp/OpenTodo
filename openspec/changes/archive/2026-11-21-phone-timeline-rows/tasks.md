# Tasks

## 1. Web app

- [x] 1.1 `TimelineView.tsx`: below 768 px a task row is the name's button with the name on a sticky line and the bar's lane at its foot; `rowMetrics` gives 56 / 44 / 36 px rows and the bar's middle; the day columns, the today line and the arrows follow the name column's width and the row heights. Verify: `npx vitest run src/app/timelineView.test.tsx` (row heights, the name drawn once and named on the button, the arrow's path between the bars' middles, the bar taking its own presses).
- [x] 1.2 A tap on a name opens the task on a coarse pointer; a click selects with a mouse. Verify: the same test (the task page opens at 360 px with touch; at 1280 px with a mouse the row is selected and nothing opens).
- [x] 1.3 The hint in two strings, the keys' sentence in `data-kbd-hint`; the seven catalogs split at the sentence boundary. Verify: the same test (the marked part and the whole line's text), `node scripts/i18n-check.mjs`.

## 2. In a browser

- [x] 2.1 Built app, seeded account, Chromium with touch at 360 and 390 px, before and after. Verify: overlapping touch targets 3 → 0; rows 36 → 56 px (44 px unscheduled); names of 36 / 32 / 30 characters show 18 / 18 / 19 → all of them; days visible 5.7 → 10.3 (360 px) and 6.3 → 11.2 (390 px); the hint 54 → 36 px without the keys' sentence; no sideways scroll of the page.
- [x] 2.2 At 360 and 390 px: the grid scrolls sideways and the name stays at its left edge; press, hold and move drags a bar two days; a tap on a name opens the task's page. Verify: the same run (scroll offset, the name's position, the bar's new position, the page's address).
- [x] 2.3 At 768 px with touch rows are 44 px with the names beside the grid and no overlapping targets; at 768 and 1280 px with a mouse every box of the timeline is where it was (the only difference is the new span around the keys' sentence). Verify: the same run, comparing the boxes of every element before and after.
- [x] 2.4 The interface tour and the layout check of the screen. Verify: `ONLY=timeline WIDTHS=360 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs` reports 0 findings (4 × M11 before); `ONLY=timeline ENGINES=chromium WIDTHS=360,390,768 node scripts/e2e-layout.mjs` against a fresh server prints `LAYOUT OK`.
- [ ] 2.5 The layout check's WebKit leg and the UI check's screenshots (CI). Verify: `make layout-check`, `make ui-check`; re-baseline `Screens/Timeline` at 375 px, light and dark.

## 3. Docs

- [x] 3.1 `docs/project-timeline.md` and `docs/interface-guide.md` describe the phone row; changelog fragment `changelog.d/Changed/phone-timeline-rows.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 4. Checks

- [x] 4.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npm run build` in `web/`, `node scripts/bundle-budget.mjs`, `openspec validate phone-timeline-rows --strict`.
- [x] 4.2 `npm test` in `web/` as a whole and `make check` (CI). Done: green on main, CI run 44897180907 at 6e62dbd69 (21 Nov), which runs this check.
- [ ] 4.3 On a phone (owner): a project's Timeline in the Android and iOS apps; names stay put while the days scroll (Safari's sticky), a hold drags a bar, a tap on a name opens the task, an unscheduled task is dragged from its row onto a day.

---

Shipped in 1.5.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
