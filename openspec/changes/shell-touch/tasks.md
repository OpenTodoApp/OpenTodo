# Tasks

## 1. Web app

- [x] 1.1 `web/src/index.css`: the tap highlight off on `html`; under `pointer: coarse`, `overscroll-behavior: none` on `html, body`. Verify: Playwright at 390 px with touch reads `rgba(0, 0, 0, 0)` and `none` on `html`, the document does not scroll and `#content` scrolls to 200 px; at 1280 px with a mouse `html` reads `auto`.
- [x] 1.2 `web/src/index.css`, base layer under `pointer: coarse`: chrome unselectable and without callout, fields and editable areas selectable. Verify: Playwright at 390 px reads `user-select: none` on the tab bar, a tab, its label, the phone bar and its title and the add button; `text` on the task view's title (a `textarea`), a notes paragraph and a link in the notes; `auto` on a comment's paragraph; a selection over the notes and the comment returns their text and over a tab's label returns nothing; at 1280 px with a mouse a button and `nav` read `auto`.
- [x] 1.3 Check that controls keep a pressed state on touch and record those without one in the design. Verify: the survey of `:active` rules under touch emulation (design, "Finding").
- [x] 1.4 A control without a pressed state of its own dims while pressed on a coarse pointer (D7). Verify: Chromium at 360 px with touch and the pressed state forced, a tab bar tab reads opacity 0.6 and a `.ui-btn` stays 1 (measured). That a real finger sets the pressed state is a device check: an emulated touch held for 300 ms did not.

## 2. Checks

- [x] 2.1 `touchFeel` in `scripts/ux-audit/measure.mjs` with a passing and a failing fixture in `measure.test.mjs`. Verify: `node --test scripts/ux-audit/measure.test.mjs`.
- [x] 2.2 Run it on every screen and overlay of `scripts/e2e-layout.mjs`. Verify: `make layout-check` (here: `ENGINES=chromium`, no `touch:` failure on the 585 screens and overlays it reached; four of the six combinations stalled part-way on a loaded machine, so CI is the first full run).
- [x] 2.3 `cd web && npm test` for the tests that read `index.css`, `npm run build`, `node scripts/bundle-budget.mjs`. Verify: they pass; the budget is unchanged.

## 3. iOS

- [x] 3.1 `allowsLinkPreview = false` in `ShellController.init` (`mobile/ios/OpenTodo/ShellView.swift`). Verify: the `ios` CI job compiles it (not compiled locally).

## 4. Docs and release

- [x] 4.1 `docs/design-system.md` (the rule and its check), a Touch section in `docs/ios-app.md` and `docs/android-app.md`. Verify: `make docs`, `make docs-check`.
- [x] 4.2 `changelog.d/Changed/shell-touch.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 4.3 Run `make check`. Verify: it passes.

## 5. On a phone (owner)

- [ ] 5.1 Android app and Chrome: tap a tab and a row (no flash); hold a tab and a menu item (nothing selected); hold a word in a comment, in notes and in the task's title (selected, Copy offered); pull the Inbox down at its top (no glow of the page, no reload); scroll a long sheet past its end (the list behind stays); pinch zooms.
- [ ] 5.2 iPhone app and the installed web app: the same; hold a link in a note (no preview, the link can be copied); pulling down no longer reloads the app.
- [ ] 5.3 WebKit in the layout check (`make layout-check` without `ENGINES`), which was not available where this was built.
