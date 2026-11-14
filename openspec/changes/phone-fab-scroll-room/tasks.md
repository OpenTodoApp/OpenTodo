# Tasks

## 1. Web app

- [x] 1.1 `Shell.tsx`: the content column carries `data-add-room` and its padding only while the add button is offered (`phoneChrome && offersQuickAdd(route)`). Verify: `npx vitest run src/app/tabBar.test.tsx src/app/budget.test.tsx` (Settings has the tab bar, no button and no room; the Inbox has all three), `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 1.2 `index.css`: `.page-fill` and `.add-room-end` next to `--add-room`. `CalendarView.tsx`: the page is a `.page-fill`, the grid's scroller an `.add-room-end`. `NotesPage.tsx`: the graph mode is a `.page-fill`. Verify: `npx vitest run src/app/calendarView.test.tsx src/app/budget.test.tsx`.

## 2. Layout check

- [x] 2.1 `addButtonRoom` in `scripts/ux-audit/measure.mjs`, run by `scripts/e2e-layout.mjs` on every screen. Verify: `node --test scripts/ux-audit/measure.test.mjs` (a last row and a late block under the button fail, with the room they pass; a short page passes; a page without the button and with the room fails; scroll positions are put back).
- [x] 2.2 The layout check passes on every screen. Verify: `ENGINES=chromium WIDTHS=360,390,768 THEMES=light node scripts/e2e-layout.mjs` against a fresh server.

## 3. Checks in a browser

- [x] 3.1 The sweep of design.md: built app, seeded account, Chromium with touch at 360 × 740 and 390 × 844, 40 screens (33 with the add button), each scrolled to the end of the page and of its inner scrollers, before and after. Verify: the table in design.md; no control under the button on any screen; the Day grid 478 → 554 px and 582 → 658 px tall; a task at 23:00 ends 8 px above the button; the screens without the button lose their 76 px.
- [x] 3.2 At 768 × 1024 and 1280 × 900 the column and the Day grid have no room and the grid ends at the frame's edge. Verify: the same measure at those sizes.
- [ ] 3.3 On a phone, in the Android and the iOS app: Day and Week run down to the tab bar and their last hour scrolls clear of the add button, also with the home indicator's inset; Statistics ends at the tab bar.

## 4. Docs and release

- [x] 4.1 `docs/interface-guide.md` (the phone's bottom chrome). Verify: `make docs`, `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Fixed/phone-fab-scroll-room.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 4.3 Re-baseline the phone-width UI screenshots: the calendar's Day and Week, the notes graph, and the screens without the add button whose end shows (the Weekly review at 360 px).
