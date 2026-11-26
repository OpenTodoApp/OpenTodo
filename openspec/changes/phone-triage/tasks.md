# Tasks

## 1. The bar

- [x] 1.1 `TriageBar.tsx`: the wrapping row from 768 px with the markup it had, and below it the two rows (Today, Schedule, Move, Complete, More; Back, Skip) with More's menu (Delegate, Labels, Someday, Open, Trash), 48 px targets, no keys (design D1, D6). Verify: `npx vitest run src/app/triageView.test.tsx`: "The bar at 390 px", "Today from the bar, Trash and Someday from More", "Complete from the bar, and Open from More", "Nobody to delegate to", "Skip and Back", "A wide window keeps its bar"; the sixteen earlier tests of the file pass with no assertion changed.
- [x] 1.2 The bar pinned at the end of the page (`sticky`), the page a column as tall as the scroller, the toast lifted above the bar (D2, D3). Verify: in Chromium at 390 by 844 px and 360 by 640 px with touch on a seeded server, the bar's bottom is the tab bar's top, every target measures 48 px high, a task with notes longer than the screen scrolls above the bar with 16 px between them, the Undo toast and a reminder toast show above the bar, nothing scrolls sideways (English and German), no console error (done 2026-11-26, screenshots looked at).
- [x] 1.3 No floating add button on `/triage` (`VIEW_QUICK_ADD.triage = false`). Verify: `npx vitest run src/app/quickAddRoutes.test.ts` (`/triage` moved from the routes that keep the button to those without: the one existing assertion this change alters); in the browser no `[data-add-button]` on the triage and one on the Inbox.
- [x] 1.4 Inside the Clarify move the two rows follow the card, not pinned. Verify: the test "inside the Clarify move the two rows follow the card and are not pinned". Not looked at in a browser.

## 2. Swipes

- [x] 2.1 `useRowSwipe` on the card below 768 px with a coarse pointer: towards the end completes, towards the start opens the scheduling sheet; never from the title field while it is edited (D4). Verify: the tests "Swipe to complete", "Swipe to schedule", "A short swipe returns the card, and a mouse never swipes", "a press in the title while it is edited belongs to the text"; in Chromium with real touch events the card follows the finger with the named edge, a swipe right completes with Undo and a swipe left opens the sheet (done 2026-11-26).

## 3. Sheets

- [x] 3.1 Move, Delegate and Labels as `Dialog placement="bottom"` below 768 px; Move lists the projects itself (D5). Verify: the tests "Move with one tap" and "Labels stay on the task … Delegate is a sheet too"; in the browser each opens from the bottom with the page above it and focus outside the field (the keyboard stays closed).

## 4. Checks

- [x] 4.1 `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run src/app/triageView.test.tsx` three times, `npm test`, `npm run build` in `web/`. Verify: all pass.
- [x] 4.2 `npm run docs:build` and `npm run docs:check`, `node scripts/ui-check.mjs`, `node --test scripts/repo-checks.test.mjs`, `node scripts/i18n/extract.mjs --write` and `node scripts/i18n-check.mjs` (no new string), `node scripts/bundle-budget.mjs`, `openspec validate --all --strict`. Verify: all pass.
- [x] 4.3 Layout check for this screen: `ONLY=triage ENGINES=chromium node scripts/e2e-layout.mjs` at 360, 390 and 768 px, light and dark. Verify: `LAYOUT OK`.
- [x] 4.4 The layout check in WebKit, the whole layout check, the accessibility tour (`A11Y_ONLY=1 node scripts/ux-audit/tour.mjs`) and `scripts/e2e-smoke.mjs` / `scripts/e2e-phone.mjs`. Not run here: CI runs them. Done: the full CI run with every leg on main after the phone changes (run 45845169175, 2026-11-26: the layout check in Chromium at three widths, in WebKit at 360, 390 and 768 px, in German and French, the safe-area leg, the end-to-end scripts with `e2e-phone`, both accessibility legs; 41 jobs pass), and again on the commit released as 1.10.1 (run 45889260718).
- [ ] 4.5 Right to left: the bar and the swipes in Arabic. `useRowSwipe` and the chevrons mirror by the app's rules; not looked at.
- [x] 4.6 The story `Screens/Process the Inbox` at 375 px now shows the phone bar: its baselines come from `ui-baselines.yml` and have to be looked at. Done: baselines from `ui-baselines.yml` (run 45830257524), looked at before they were committed (#2116).

## 5. Docs and release notes

- [x] 5.1 `docs/process-the-inbox.md` gains "On a phone"; `changelog.d/Changed/phone-triage.md`. Verify: `npm run docs:check`, `node --test scripts/repo-checks.test.mjs`.
- [ ] 5.2 The guide's picture (`docs/images/triage-*.webp`) is the desktop screen and stays; no phone picture was made.

## 6. Trial

- [ ] 6.1 The owner tries Process the Inbox on a phone. Verify: their findings fixed or recorded here (design, Open Questions).
