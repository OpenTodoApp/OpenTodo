# Tasks

## 1. Measure

- [x] 1.1 Built app and server, seeded account, Chromium at 360 px with touch and no key pressed: tap and long-press icon buttons and read the tooltip element at once and after 700 ms. Verify: the table in `design.md` (the sync dot's tooltip stays; four others flash).

## 2. Web app

- [x] 2.1 `web/src/lib/focusSource.ts`: the page's last input, `focusFromKeyboard()`, and `keyPress()` for touch-first devices. `Tooltip` opens on focus only when it is true and no longer tracks its own press. Verify: `npx vitest run src/ui/tooltip.test.tsx` (a touch tap in the browser's order shows nothing, nor does returned focus or Enter in a field on a coarse pointer; a mouse hover shows the tip, a click hides it, Tab shows it), `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 2.2 The last input is reset between tests (`resettable`), and the rest of the web suite is unaffected. Verify: `npm test` in `web/` (one full run failed only `moduleState.test.ts` and one case of `taskRow.test.tsx`, both for the missing reset; with it those files and `src/ui` pass).

## 3. Checks in a browser

- [x] 3.1 The same taps and long presses on the rebuilt app: no tooltip element at once or after 700 ms for any of them, the sync dot included; after a reload, Tab still shows the focused button's tooltip. Verify: the measuring script's output.
- [ ] 3.2 On a phone, in the Android and the iOS app: tap the sync dot, Search and Assistant in the drawer; no tooltip.

## 4. Docs and release

- [x] 4.1 `docs/design-system.md`: which focus opens a tooltip. Verify: `make docs`, `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Fixed/touch-no-tooltips.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
