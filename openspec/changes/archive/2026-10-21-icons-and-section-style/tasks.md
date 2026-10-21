## 1. Icon catalogue

- [x] 1.1 Curate `web/src/ui/icons/catalogue.json` (`{name, category, keywords}`, at least 300 entries, about 15 categories, keywords from lucide-static's tags, every current `PROJECT_ICONS` name included); verify with a vitest that checks the schema, the name pattern, unique names, at least 300 entries and that all 24 former project icons are present
- [x] 1.2 Extend `scripts/icons-sync.mjs` to write `catalogue.paths.ts` (catalogue-only path data), the compact names list for the main bundle and `internal/iconset/names.json`; verify by running it against lucide-static 1.48.0 and `git diff --stat` showing only generated files changing
- [x] 1.3 Add `internal/iconset` (`Valid`, `Entries`, search order from design D2) with a test that reads `web/src/ui/icons/catalogue.json` and fails on any difference in names; verify with `go test ./internal/iconset/...`
- [x] 1.4 Add `isCatalogueIcon`, `loadCatalogue()` and `<CatalogueIcon name fallback>` in `web/src/ui/icons`; verify with vitest that an interface icon renders synchronously, a catalogue icon renders the fallback then the icon, and an unknown name keeps the fallback
- [x] 1.5 Category display names as interface strings in all locale catalogues; verify with `node scripts/i18n/extract.mjs --write` and `node scripts/i18n-check.mjs`
- [x] 1.6 Check that the main bundle did not grow beyond the names list and the catalogue is its own chunk; verify with `npm run build` in web/ and comparing the main chunk size with main (report the numbers in the PR)

## 2. Icon picker

- [x] 2.1 Build the shared icon picker in `web/src/ui` on the Combobox pattern (done as `IconPicker`: the same combobox field, listbox semantics, keys and Esc, laid out as a grid grouped by category with its own ordering from `searchIcons`, because the Combobox list re-sorts results and windows lists over 200 rows without group headings) (search, category groups, "No icon" first, current choice selected, Esc closes without change) with stories for empty search, a keyword search, an unknown current name and offline-before-load; verify with `make ui-check` (a11y and new baselines) and a happy-dom test that "dog" finds the paw icon and Enter picks it
- [x] 2.2 Search matches the translated category name; verify with a test in Italian that "cibo" lists the Food icons
- [x] 2.3 Replace the 24-icon grid in `ProjectHeader.tsx` with the picker and remove `PROJECT_ICONS`; verify by updating `projectIcon.test.tsx` (pick through search, offline pick shows at once) and `npm test` in web/

## 3. Section colour and icon

- [x] 3.1 Add `color` and `icon` (nullable strings) to `section` in `internal/sync/ops.go` Schema, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify with a sync test where a rename on one device and a colour on another converge (scenario "Colour and rename at the same time") and `go test ./internal/sync/...`
- [x] 3.2 Sections API: accept and return `color` and `icon`, validate with `iconset.Valid` and `#rrggbb`, `invalid_input` otherwise; verify with handler tests for the style, unknown icon, malformed colour and unauthenticated scenarios (`go test ./internal/httpapi/...`)
- [x] 3.3 Section menu items "Colour" (palette and "No colour") and "Icon" (picker), hidden for viewers; verify with a happy-dom test for the keyboard scenario and the viewer scenario
- [x] 3.4 Show the icon or colour dot before the title in list headings and board column headers, never on "No section"; verify with stories (default, colour only, icon only, both, long title on a phone) and `make ui-check`, and `make layout-check` at 360 px (run by CI's layout job on the pull request)
- [x] 3.5 Export and import of the own format carry section `color` and `icon`; verify with an export round-trip test

## 4. Docs and checks

- [x] 4.1 Update `docs/projects.md` (icon picker), `docs/sections-and-boards.md` (section colour and icon) and `docs/api.md` (section fields, errors); verify with `make docs` and `make docs-check`
- [x] 4.2 CHANGELOG entry under Unreleased; verify by reading it in the PR
- [x] 4.3 Run `make check`; verify it passes
