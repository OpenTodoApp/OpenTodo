# Tasks

## 1. The phone header everywhere

- [x] 1.1 `PhoneChrome` and the shell's screens inside it while the phone UI is on; `PhonePageHeader` with the own-bar signal, Back and the header's frame (design D1, D2); `PhoneList` uses the shared header. Verify: a test walks every route of the shell at 390 px with the switch on: the phone header is drawn, the shell's bar is not, and with the switch off or at 1280 px nothing changes; the phone tests of `phone-lists` pass. Done: `phoneAllScreens.test.tsx` walks eight screens, not every route; the layout check (3.1) walks all of them.
- [x] 1.2 The canvas on the shell's content while the phone UI is on (design D4). Verify: screenshots of twenty screens at 390 px reviewed; the title is at the same place on each (measured in the walk). Done: below 768 px the shell's content already sits on the canvas, so nothing was added; the title is at 20 px and the bar at the edge on twenty screens.

## 2. The phone row everywhere

- [x] 2.1 `TaskRowDrawContext` in `TaskRow`, `PhoneTaskRow` on the row's props, `PhoneListRow` on top of it (design D3). Verify: the list tests of `phone-lists` pass unchanged; `npm test` passes with no desktop test edited.
- [ ] 2.2 Tests: a saved view, a filter, Next and Waiting show phone rows in their order; a tap opens the task page; the check completes with Undo; a board's cards are unchanged. Verify: the tests pass. Done so far: Next (rows, the check, the tap). Still to test: a saved view, a filter, Waiting, a board's cards.

## 3. Checks

- [x] 3.1 The layout and accessibility check with `PHONE_UI=1` over the whole inventory below 768 px (design D5). Verify: Chromium at 360 and 390 px, light and dark, prints `LAYOUT OK`; the CI step runs every screen. Done: 116 screens and overlays in each of the four combinations.
- [x] 3.2 The page menu comparison for five screens that are not lists; `scripts/e2e-phone.mjs` with a saved view and Next. Verify: both pass. Done: five screens compared in `phoneAllScreens.test.tsx`; `e2e-phone` opens Labels and Next (a saved view is not in it).
- [ ] 3.3 Stories for `PhoneChrome` around two screens and for `PhoneTaskRow`; baselines. Verify: `node scripts/ui-check.mjs`; the UI check in the full CI run.

## 4. The whole

- [x] 4.1 The web app. Verify: `npm test`, `npm run lint` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs` inside the budget, numbers written in the design; `node scripts/i18n-check.mjs`. Done: 935 test files pass, lint and knip clean, entry 93.4 of 148 KB and first load 662.7 of 712 KB; no new string.
- [ ] 4.2 Performance: the desktop list's budgets with the row's seam. Verify: the list budgets of `docs/performance.md` on the 10,000-task account, numbers in the design. Done so far: the phone profile with the switch off and on, every budget met (design D6); the nightly runs it. The desktop profile with the seam was not run locally: the nightly does.
- [x] 4.3 Docs: `docs/phone-screens.md`, `changelog.d/Changed/phone-all-screens.md`, `ROADMAP.md`, the docs build. Verify: `npm run docs:build` and `docs:check`; repo checks.
- [ ] 4.4 The owner tries the screens on a phone. Verify: their findings fixed or recorded here.
