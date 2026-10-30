# Tasks: accent-colour

## 1. Data model

- [ ] 1.1 Add `theme_accent_custom` (`kString`, default `""`) to `user_prefs` in `internal/sync/ops.go` `Schema` and extend the `theme_accent` comment with `custom`; verify `go test ./internal/sync/...`
- [ ] 1.2 Add `theme_accent_custom` to `UserPrefs` in `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify the Go/TS schema parity test passes with `npm test`
- [ ] 1.3 Read `custom` in `readAppearance` (`web/src/lib/appearance.ts`): a valid `#rrggbb` gives the custom accent, anything else reads as Emerald without writing; verify new cases in `appearance.test.ts` (custom, malformed colour, unknown theme)
- [ ] 1.4 Check the JSON export and import carry `theme_accent_custom`; verify with the export round-trip test (`go test ./internal/...` export tests and the web import test)

## 2. Derivation

- [ ] 2.1 Write `web/src/lib/accentDerive.ts` (design D2): OKLCH conversion, gamut clamp, the red guard against danger and priority 1 with the Rose-derived threshold as a constant, the light, dark-text and dark-button searches over the accent pairs of `pairs.ts` resolved with the stylesheet's mix ratios; move the needed colour maths out of `web/src/ui/tokens/resolve.ts` into a shared module if the Settings chunk would otherwise import test-only code; verify `accentDerive.test.ts`
- [ ] 2.2 Create `web/src/lib/accent.vectors.json` with the inputs of design D8 and their expected outputs and `adjusted` flags; verify `accentDerive.test.ts` reads and passes them
- [ ] 2.3 Add the sweep to `web/src/ui/tokens/contrast.test.ts` (36 hues × 4 lightness × 3 chroma, black, white, greys): every accent pair in both modes and the red-guard distance, the eight built-in themes passing unchanged; verify it fails with input, mode, pair and ratio when a mix ratio is lowered on purpose, then passes with `npm test`

## 3. Applying the accent

- [ ] 3.1 In `applyAppearance`, set `data-accent="custom"` and only the input properties (`--ot-al-accent`, `--ot-ad-accent-text`, `--ot-a-on-accent`, `--ot-ad-accent` when needed) through `style.setProperty`, clear them for a built-in theme, and write the derived values and the light bar colour to the `ot.appearance` cache; verify in `appearance.test.tsx` that the root carries them and that `data-contrast="high"` still resolves the accent to black or white
- [ ] 3.2 Extend `web/public/appearance.js` to apply the cached custom values after validating each with the hex regex, without deriving; verify with the boot-script test (or a new one) that a cached custom accent is on the root before the app module runs and that a malformed cache is ignored
- [ ] 3.3 Bar colour: light mode uses the derived light accent, dark mode the dark canvas, `system` follows the scheme; verify the theme-color meta tests in `appearance.test.tsx`

## 4. Settings and the picker

- [ ] 4.1 Build the colour picker primitive in `web/src/ui` (18 curated swatches as a radio group, hex field with inline error, light and dark preview, adjusted note, Done; popover from 640 px, bottom sheet below) with stories in light and dark at 375 and 1280 px; verify `make ui-check`
- [ ] 4.2 Add the Custom tile after Graphite in `web/src/app/AppearanceSection.tsx` and `web/src/ui/tokens/accents.ts`, writing `theme_accent` and `theme_accent_custom` in one `mutateMany` batch, keeping the custom colour when a built-in theme is chosen, and announcing "Custom" with its colour; verify `appearance.test.tsx` cases for the batch, the offline write, keyboard operation and focus return on Escape
- [ ] 4.3 Add the strings (Custom, Choose a colour, Hex colour, the error, Adjusted for contrast, Turned away from the colour for errors, Light, Dark, Done) to the six catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 4.4 Document the custom accent in the appearance section of the user docs and the derivation in docs/design-system.md; verify `make docs` and the docs check pass

## 5. Integration

- [ ] 5.1 Report the bundle impact with `node scripts/bundle-budget.mjs` (derivation and picker in the Settings chunk, boot script growth) and keep it within the budget
- [ ] 5.2 Add a CHANGELOG.md entry under Unreleased at archive time; verify `make check` passes before marking the change done
