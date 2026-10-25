## 1. Measuring

- [x] 1.1 `scripts/ux-audit/settings-heights.mjs`: every section and sub-page at 1280×800 and 390×844, owner with every feature on; verify it prints the before table (design D6)

## 2. Sub-pages

- [x] 2.1 `pages` in the section table, the new Language and region section, `visiblePages`/`soleVisiblePage`/`resolvePage`/`demoFeatures` (D1); verify `settingsSections.test.tsx`
- [x] 2.2 The route `/settings/<section>/<page>`, legacy ids pointing at sub-pages (D4); verify the route tests in `settingsSections.test.tsx`
- [x] 2.3 The page contents in `settingsPages.tsx`, the overview rows with their states in `SettingsOverview.tsx` and `settingsStatus.ts` (D1, D2); verify `settingsSections.test.tsx`, `settingsAnatomy.test.tsx` and `npm test`
- [x] 2.4 Breadcrumb, pane marking, back actions per width and focus return (D5); verify `settingsView.test.tsx`

## 3. Search, links and old addresses

- [x] 3.1 Index entries with their page, `entryRoute`/`openSetting`, the tint on arrival (D3); verify `settingsSearch.test.tsx`
- [x] 3.2 Old anchors (`anchorTarget`) and in-app links, the single sign-on return address, the Android notification (D4); verify `settingsLegacy.test.tsx`, the panel tests and `go test ./internal/httpapi/`
- [x] 3.3 Strings in the five catalogs; verify `make i18n-check`

## 4. Docs and baselines

- [x] 4.1 `docs/settings*.md` and every page naming a moved setting, word limits kept; the keyboard guide regenerated; verify `make docs-check`
- [x] 4.2 The Settings docs screenshots (`node scripts/docs-screenshots.mjs settings,…`), the layout-check screens and the inventory; verify the ux-audit unit tests
- [x] 4.3 Visual baselines of the Settings stories (`make ui-baselines`); verify `make ui-check` in CI
- [x] 4.4 CHANGELOG Unreleased entry

## 5. Checks

- [x] 5.1 The after table with `settings-heights.mjs` at 16 px, and at 24 px text size
- [x] 5.2 `make check`
