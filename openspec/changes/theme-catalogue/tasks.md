# Tasks: theme-catalogue

Depends on `theme-engine`.

## 1. Licences and mapping

- [ ] 1.1 Re-check each project of design D1 (licence file, copyright line, README for naming or trademark terms) on the day of implementation and update the table's "Checked" dates; drop any whose terms changed; verify by review of the design table in the pull request
- [ ] 1.2 Write `web/src/lib/theme/builtin/MAPPING.md` (design D3: seeds, explicit tokens, label hues, adapted values, bar) and `CREDITS.md` with each project's full MIT notice; verify `catalogue.test.ts` finds a credits entry for every id

## 2. Documents

- [ ] 2.1 Write the light and dark pairs as documents: Solarized, Gruvbox, Catppuccin Latte and Mocha, Rosé Pine Dawn and Rosé Pine, Tokyo Night Light and Tokyo Night, One Light and One Dark; verify each validates with `format.test.ts`' shared validator and passes the contrast loop of `contrast.test.ts` with `npm test`
- [ ] 2.2 Write Nord and Dracula (dark only); verify the same tests
- [ ] 2.3 For every pair that fails with the published colour, apply the fix-to-AA search, record the published value under `notes.adapted`; verify `catalogue.test.ts` that every adapted value keeps its hue within 1° and that the 12 label solids of each theme are at least ΔE 8 apart
- [ ] 2.4 Write `web/src/lib/theme/builtin/index.ts` (ids, names, kinds, family, preview swatches, lazy document imports); verify `catalogue.test.ts` that every index entry has a document and every document an entry, and that family pairs name each other

## 3. Settings

- [ ] 3.1 Show the built-ins in the Light and Dark lists of Settings › Appearance (kind filter, OpenTodo first, then alphabetical), loading the index and documents lazily; verify `appearance.test.tsx` that Nord is not in the Light list and choosing Gruvbox Dark offline applies and writes one op
- [ ] 3.2 Add the counterpart offer (one extra op only on accept) under `system` mode; verify `appearance.test.tsx` for accept and dismiss
- [ ] 3.3 Add About this theme (author, licence, copyright line, the project address as text, the adapted note, the not-affiliated line, a Licence link to the served `CREDITS.md`); verify a happy-dom test that the dialog shows them and that opening it makes no request outside the server's origin
- [ ] 3.4 Add the strings (Also use {name} at night, Also use {name} by day, About this theme, Licence, Some colours were adapted for contrast, OpenTodo is not affiliated with this project) to the six catalogs; verify `node scripts/i18n-check.mjs`

## 4. Workbench, docs and integration

- [ ] 4.1 Add a workbench story per theme showing the list, board, calendar and task panel; keep visual baselines for OpenTodo's two themes only; verify `make ui-check`
- [ ] 4.2 Add the Catalogue section with credits and screenshots to `docs/themes.md` (`make docs-screenshots`); verify `make docs` and the docs check
- [ ] 4.3 Report the bundle impact with `node scripts/bundle-budget.mjs`: first load unchanged, the catalogue chunk's size stated in the pull request
- [ ] 4.4 Run `make check` before marking the change done; add a CHANGELOG.md entry under Unreleased at archive time
