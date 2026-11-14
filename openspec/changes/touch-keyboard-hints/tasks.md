# Tasks

## 1. The rule

- [x] 1.1 Add the unlayered rule to `web/src/index.css`: hide `.ui-kbd` and `[data-kbd-hint]` without a fine or hovering pointer and without `data-keyboard` on the root, except under `[data-kbd-keep]`. Verify: `npx vitest run src/app/touchKeyboardHints.test.tsx` (one such rule, outside every layer).
- [x] 1.2 Add `web/src/lib/keyboardSeen.ts` (the first hardware key press sets `data-keyboard`) and load it lazily from `main.tsx`. Verify: `npx vitest run src/lib/keyboardSeen.test.ts`; `node scripts/bundle-budget.mjs` after `npm run build` stays within budget.

## 2. Markers

- [x] 2.1 `<Kbd>` in a sentence sets `data-kbd-keep`; `KeySequence`, the tooltip's separator, the palette's `ShortcutKeys` and `Keys` carry `data-kbd-hint`. Verify: `touchKeyboardHints.test.tsx` (the kept key, the tooltip's separator inside the hint, the menu item's `aria-keyshortcuts` and description).
- [x] 2.2 Mark the keys-only lines of design D5 with `data-kbd-hint`, and the cheat sheet, the filter syntax card and the mixed sentences of D4 with `data-kbd-keep`. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `npm test` and `npm run build` in `web/`.

## 3. In a browser

- [x] 3.1 Chromium against the built app and the seeded account, emulated phone (360 px, touch, no hover): a task's actions sheet shows no badge (six in the DOM, none drawn) and its labels run to the row's padding; the label picker has no hint line and no gap; the cheat sheet shows all its keys. Verify: the Playwright run described in the pull request.
- [x] 3.2 Same run on a desktop (1280 px, mouse): the menu shows `y`, `c`, `Shift+L`, `a`, `Shift+A`, `Delete / Backspace`; the picker shows its line; Settings search shows `/`.
- [x] 3.3 Emulated phone after a real key press: the badges and the picker's line appear without a reload; a scripted key press does not count.
- [ ] 3.4 On a real phone (Android and iPhone, browser and shell): no badge in a task's sheet, the bulk actions sheet, the Schedule sheet and Settings search. Owner's device check.
- [ ] 3.5 On an iPad: with a Magic Keyboard the badges show; with a keyboard that has no trackpad they show after the first Tab or `j`. Owner's device check.

## 4. Docs and release

- [x] 4.1 `docs/keyboard.md` says where keys are shown; `docs/design-system.md` states the rule and the two markers. Verify: `make docs && make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Fixed/touch-keyboard-hints.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
