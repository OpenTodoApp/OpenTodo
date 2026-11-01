# Tasks: theme-editor

Depends on `theme-engine`; uses the catalogue of `theme-catalogue` as starting points.

## 1. Data model

- [x] 1.1 Add the kind `kThemeDoc` (null or a document passing `internal/themes.Validate`, at most `MaxThemeBytes`) and the `theme` entity (design D1) to `internal/sync/ops.go` with its comment, its id to `uniqueIDs` in `scope.go`, and regenerate the op schema; verify `go test ./internal/sync/...` (a 20 KB value and a `url()` canvas refused, a valid document accepted, the theme personal with a unique id)
- [x] 1.2 Add the `theme` table to the Dexie schema and the types in `web/src/lib/types.ts`; verify the Go/TS schema parity and `db` tests with `npm test`
- [x] 1.3 Read `user:<id>` choices in `appearance.ts` (a tombstoned or missing theme reads as the default); verify `appearance.test.ts`
- [x] 1.4 Carry the entity and the choices in the JSON export and import with the id map; verify the export round-trip tests in `go test ./internal/...` and the web import test

## 2. Custom themes in Settings

- [ ] 2.1 Add "Your themes" to Settings › Appearance with New theme and Import, and the card menu (Use for light or dark, Customise or Edit, Duplicate, Export, Delete), the 20-theme limit (design D2) and the "Low contrast · n" badge; verify `appearance.test.tsx` (limit message, delete of a chosen theme in one batch with Undo, offline create)
- [ ] 2.2 Customise and New (design D4): the copy's name, author, credit note and licence; verify `customThemes.test.ts`

## 3. Primitives

- [ ] 3.1 Build the colour field in `web/src/ui` (swatches, hex, OKLCH sliders with keyboard steps and `aria-valuetext`, gamut note) with stories in light and dark at 375 and 1280 px; verify `make ui-check`
- [ ] 3.2 Build the token row and the contrast badge with stories; verify `make ui-check`

## 4. The editor

- [ ] 4.1 Add the editor page at `/settings/appearance/themes/<id>` (design D3 layout, header row, two columns from 64 rem, collapsible preview below) and register Undo, Redo and Save in the shortcut registry scoped to the editor; verify the registry's conflict test and `themeEditor.test.tsx` routing and Back
- [ ] 4.2 Seeds and status hues (design D5) with live derivation; verify `themeEditor.test.tsx` that changing the accent seed updates derived tokens and keeps set ones
- [ ] 4.3 Advanced token list (design D6): groups with counts, filter in the user's language and English, set and derived states; verify `themeEditor.test.tsx`
- [ ] 4.4 History, per-token Undo and Reset, drafts in `deviceStorage`, the leave prompt and the changed-elsewhere offer (design D7); verify `themeDraft.test.ts` (reload keeps the draft, no op before Save, one op on Save)
- [ ] 4.5 Live contrast panel, Fix and Fix all (design D8) in `web/src/lib/theme/fix.ts`; verify `fix.test.ts` (hue kept within 1°, every pair of the token passes, the background moved only when needed) and the live-region announcement in `themeEditor.test.tsx`
- [ ] 4.6 Live preview (design D9): list, board, week calendar and task panel from the workbench fixtures in an `inert` scoped subtree, and Create the counterpart; verify `themePreview.test.tsx` that the preview's surface follows the draft while the page root keeps the active theme, and that the counterpart passes `checkTheme`
- [ ] 4.7 Shape and type (design D10); verify `themeEditor.test.tsx` that radius and font apply in the preview and no font request is made (network spy)
- [ ] 4.8 The encrypted-account note (design D13); verify `themeEditor.test.tsx`

## 5. Files

- [ ] 5.1 Export and import of `.opentodo-theme.json` (design D11: 64 KB limit, migrate, validate, new id, name suffix, line-precise errors); verify `themeFiles.test.ts` with the shared valid and invalid examples
- [ ] 5.2 The VS Code importer (design D12): JSONC reader, kind, the mapping table, alpha compositing, ANSI to label hues, `include` reported and not followed, 1 MB limit; verify `vscode.test.ts` over fixtures in `web/src/lib/theme/testdata/vscode/` (a dark theme, a light theme, one with comments and trailing commas, one with `include`, a settings file without `colors`) and a network spy showing no request
- [ ] 5.3 The import report dialog (mapped, derived, failing with Fix contrast now preselected, ignored keys, the licence advice); verify `importReport.test.tsx`

## 6. Languages, docs and integration

- [ ] 6.1 Add the strings (token and group names, editor actions, warnings, fixes, the report, limits, the encryption note) to the six catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 6.2 Document custom themes, the editor, files and VS Code import in `docs/themes.md`, with the mapping table; verify `make docs` and the docs check
- [ ] 6.3 Report the bundle impact with `node scripts/bundle-budget.mjs` (first load under 0.5 KB more; the editor and importer chunks' sizes in the pull request)
- [ ] 6.4 Run `make check` before marking the change done; add a CHANGELOG.md entry under Unreleased at archive time
