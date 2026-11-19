# Tasks

## 1. The format

- [x] 1.1 `titleWeight` in `web/src/lib/theme/format.ts` (`TITLE_WEIGHTS` in `tokens.ts`) and in `internal/themes/themes.go`: 400, 500, 600 or 700, anything else refused with `type` at `titleWeight`. Shared examples `valid/title-weight.json`, `invalid/title-weight.json`, `invalid/title-weight-word.json` in `internal/themes/testdata/` with `expected.json`. Verify: `go test ./internal/themes`; `npm test -- format schema` in web/.
- [x] 1.2 The JSON Schema (`docs/themes/opentodo-theme.schema.json`) and the template (`template.ts`, the note in `templateText.ts`, the two fixtures regenerated with `UPDATE_THEME_TEMPLATES=1`). Verify: `schema.test.ts`, `template.test.ts`, `go test ./internal/themes` (the templates as written and with every commented line set).

## 2. Applying

- [x] 2.1 `derive.ts` resolves the weight (absent for 400), `load.ts` carries it, `apply.ts` checks it in the cache and writes `--ot-title-weight`, `web/public/appearance.js` does the same before the first paint. Verify: `apply.test.ts` (the declaration, no declaration for 400, the cache refuses 650 and a string), `derive.test.ts`, `appearanceBoot.test.ts` (the boot script writes the same rule as the app).
- [x] 2.2 `--ot-title-weight: 400` and `[data-row-title] { font-weight: var(--ot-title-weight) }` in the components layer of `web/src/index.css`. Verify: `apply.test.ts` reads both from the stylesheet; `make ui-check` for unchanged baselines.

## 3. The editor

- [x] 3.1 **Task title weight** in `web/src/app/themes/EditorSections.tsx` after the list text size; the preview sets the variable (`ThemePreview.tsx`). Verify: `themeEditor.test.tsx` (the four choices, Semibold in the preview, Regular back to 400); `npm test`, `npm run typecheck` and `npm run build` in web/.
- [x] 3.2 Six messages in every language. Verify: `make i18n-check`.

## 4. Docs and checks

- [x] 4.1 `docs/themes.md` (the editor, the example, the keys table), `changelog.d/Added/theme-title-weight.md`, the 0.20 row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make repo-check`, `make openspec-validate`, `make bundle-budget`.
