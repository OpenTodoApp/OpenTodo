## 1. Format

- [x] 1.1 `$schema` accepted by `internal/themes` and `web/src/lib/theme/format.ts` (code `key` otherwise), documented in `docs/themes/opentodo-theme.schema.json`; shared examples `valid/with-schema.json`, `invalid/schema-not-text.json`; `go test ./internal/themes`, `format.test.ts`, `schema.test.ts` pass
- [x] 1.2 `readThemeFile` reads comments and trailing commas keeping line numbers; `importedDraft` drops `$schema` and an empty `tokens` (`withoutFileKeys`); `themeFiles.test.ts` passes

## 2. Template

- [x] 2.1 `web/src/lib/theme/template.ts` (`themeTemplate`, `templateFileName`, `downloadTemplate`) and the translated notes `web/src/app/themes/templateText.ts`; `template.test.ts`: Light, Dark and Nord read back as the theme plus `$schema`, every token named, valid with every line uncommented
- [x] 2.2 `internal/themes/testdata/template/opentodo-{light,dark}.jsonc` written by `template.test.ts` (`UPDATE_THEME_TEMPLATES=1`), validated by `TestTemplatesAreValid` as written and uncommented
- [x] 2.3 Download a template in Your themes (from the theme in use), Download as a template in the editor menu, and in Branding; `appearanceThemes.test.tsx` "Download a template saves a starter file …"

## 3. Layout

- [x] 3.1 Your themes is one row with row padding, a Learn more on theme files, an empty state, and New theme · Import ▾ · Download a template; custom theme swatches show their derived label colours
- [x] 3.2 Branding's server themes are one row: title, actions and list share its padding
- [x] 3.3 Editor: size containers, controls beside a sticky preview from 52 rem, compact colour rows two by two when two 12.5 rem rows fit, with hex field and inline contrast warning, labelled Corners, List text size, Font and Kind, Advanced folded with counts, Author and Licence side by side; `themeEditor.test.tsx` passes
- [x] 3.4 `scripts/ux-audit/measure.mjs` `crowdedControls` (overlapping controls, a control within 4 px of a row divider) run by `scripts/e2e-layout.mjs` on Settings › Appearance and Server › Branding; `measure.test.mjs` covers it
- [x] 3.5 Stories: Your themes empty, colour rows with a warning; `make ui-check`

## 4. Docs and catalogues

- [x] 4.1 `docs/themes.md` (Your themes actions, the template, comments and `$schema` in files, the editor layout), `docs/self-hosting/branding.md`, `docs/contracts.md`; `make docs-check`
- [x] 4.2 Every new string in the six catalogues; `make i18n-check`
- [x] 4.3 CHANGELOG entry
