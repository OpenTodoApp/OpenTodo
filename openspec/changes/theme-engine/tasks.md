# Tasks: theme-engine

## 1. Format and validators

- [ ] 1.1 Write `docs/themes/opentodo-theme.schema.json` (design D1) and the examples in `internal/themes/testdata/valid/` and `invalid/` (CSS in a value, `var()`, alpha outside the scrim, out-of-gamut OKLCH, unknown kind, 17 KB, bad font name, unknown token kept); verify with a schema test that every valid example passes and every invalid one fails
- [ ] 1.2 Write `web/src/lib/theme/format.ts` (`validateTheme`, `migrate`, the closed token list grouped as in D1); verify `format.test.ts` reads the shared examples and agrees with each file's expected result
- [ ] 1.3 Write `internal/themes` (`Validate`, `Migrate`, size limit); verify `go test ./internal/themes/...` over the same shared examples, and add the pair to `docs/contracts.md`

## 2. Derivation and check

- [ ] 2.1 Generalise the search of `web/src/lib/accentDerive.ts` so its base tokens are parameters (the custom accent keeps passing `accent.vectors.json` unchanged); verify `accentDerive.test.ts`
- [ ] 2.2 Write `web/src/lib/theme/derive.ts` (design D3 steps 1–8: surfaces, tones, lines, accent with the red guard and the white-or-dark on-accent rule, status, priorities, label palette, scrim, highlight, charts), reading the mix ratios from the same constants as the stylesheet; verify `derive.test.ts` and `derive.vectors.json`, including that OpenTodo's seeds reproduce every default token of `index.css` in both modes
- [ ] 2.3 Write `web/src/lib/theme/check.ts` (`checkTheme` over `PAIRS` and `GLYPH_PAIRS` for the kind); verify `check.test.ts` with a theme that fails `faint` on `canvas` reporting the pair and ratios
- [ ] 2.4 Add a perf test: deriving a theme stays under 5 ms on the CI runner's budget scale; verify `npm test`

## 3. OpenTodo themes and the gate

- [ ] 3.1 Write `scripts/themes-sync.mjs` generating `web/src/lib/theme/builtin/opentodo-light.json` and `opentodo-dark.json` from `index.css` (design D9); verify `themes.test.ts` fails on a stale file and passes after regenerating
- [ ] 3.2 Extend `web/src/ui/tokens/contrast.test.ts` with the loop over every document in `web/src/lib/theme/builtin/` and the 200-seed-set sweep (design D10), and assert `checkTheme` agrees with it on each shipped document; verify it fails naming theme, pair and ratios when a shipped value is lowered on purpose, then passes with `npm test`

## 4. Selection and data model

- [ ] 4.1 Add `theme_light` and `theme_dark` (`kString`, default `""`) to `user_prefs` in `internal/sync/ops.go` with comments, run `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...` and the Go/TS schema parity in `npm test`
- [ ] 4.2 Read the choices in `web/src/lib/appearance.ts` (design D6: empty, `builtin:`, reserved `user:` and `instance:`, wrong kind, unknown, invalid or newer format all read as the side's default without a write); verify new cases in `appearance.test.ts`
- [ ] 4.3 Check that the JSON export and import carry both fields; verify the export round-trip tests (`go test ./internal/...`) and the web import test

## 5. Applying and the first frame

- [ ] 5.1 Write `web/src/lib/theme/apply.ts` (design D4: one adopted sheet or `<style id="ot-theme">`, `:root[data-ot-theme]:not([data-contrast="high"])`, `data-theme` set to the kind, values formatted by the app, radius and type applied, no sheet for the OpenTodo themes); verify `apply.test.ts` (happy-dom) that the root resolves a palette's canvas, that `data-contrast="high"` yields the high-contrast values, and that a hostile document cannot add a declaration
- [ ] 5.2 Wire it into the AppearanceProvider: switch live on choice, mode and system scheme changes; the accent preference applies only on the OpenTodo themes (design D7); verify `appearance.test.tsx`
- [ ] 5.3 Write the `ot.theme` cache and extend `web/public/appearance.js` (design D5: pattern checks, the side for the cached mode or the scheme, no derivation, a malformed cache ignored); verify `appearanceBoot.test.ts` that a cached palette is on the root before the app module runs and a malformed cache shows the default
- [ ] 5.4 Bar colour (design D8): `meta theme-color` from the theme's bar, accent or canvas per kind, per side under `system`; verify the theme-color cases in `appearance.test.tsx`

## 6. Native shells

- [ ] 6.1 Add the `system-bars` capability and `setSystemBars` to `web/src/lib/shell.ts`, called only when listed, and its payload to the shared bridge fixtures; verify `shell.test.ts` and the fixture test
- [ ] 6.2 Android: implement `system-bars` in `mobile/android` (status and navigation bar colour, icon appearance, the colour remembered and applied at launch, a malformed payload ignored); verify the unit tests over the shared fixture with `make android`
- [ ] 6.3 iOS: implement `system-bars` in `mobile/ios` (status bar style, web view background and under-page colour, remembered at launch); verify the iOS unit tests over the shared fixture

## 7. Settings

- [ ] 7.1 Build the theme card and theme list primitives in `web/src/ui` (radio group, swatch strip, credit line, horizontal row below 40 rem) with stories in light and dark at 375 and 1280 px; verify `make ui-check`
- [ ] 7.2 Add the Theme row to `web/src/app/AppearanceSection.tsx` (one list for a fixed mode, Light and Dark lists under `system`, one op per choice, the accent tiles' "From the theme" state, announcements); verify `appearance.test.tsx` cases for the two lists, the single op, keyboard operation and the offline write
- [ ] 7.3 Add the strings (Theme, Light, Dark, From the theme, Made with a newer version of OpenTodo, Theme is invalid, by {author}, OpenTodo Light, OpenTodo Dark) to the six catalogs; verify `node scripts/i18n-check.mjs`

## 8. Docs and integration

- [ ] 8.1 Write `docs/themes.md` (the format, every key and token, seeds and derivation, the contrast gate, that themes are not encrypted, why there is no custom CSS) and link it from the appearance docs and `docs/design-system.md`; verify `make docs` and the docs check
- [ ] 8.2 Report the bundle impact with `node scripts/bundle-budget.mjs` (first-load engine, lazy derivation chunk, boot script growth) and keep it within the budget or raise it on purpose with the reason
- [ ] 8.3 Run `make check` before marking the change done; add a CHANGELOG.md entry under Unreleased at archive time
