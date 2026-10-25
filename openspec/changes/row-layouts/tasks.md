## 1. Data

- [x] 1.1 Additive `row_layout` on `user_prefs`, `view`, `project_prefs` and `label` (Schema, fixture, `types.ts`, `ops.ts` defaults) and in the REST views API; verified by `go test ./internal/sync/ ./internal/httpapi/` and `schemaFixture.test.ts`
- [x] 1.2 `lib/rowLayout.ts` (read with fallback, account hook, setter) and `row_layout` in `listDisplay`; verified by `rowLayouts.test.tsx` and `listDisplay.test.ts`

## 2. Rows

- [x] 2.1 Detailed `TaskRow` (parent line, details line, no time column, CSS opt-out of the column); verified by `rowLayouts.test.tsx`
- [x] 2.2 `LabelChips fit`: as many as fit, then "+n"; verified by `Chips.test.tsx` and the Chips story
- [x] 2.3 Priority mark (bars, P1–P3) on one-line and detailed rows, new icons; verified by `rowLayouts.test.tsx`, `make ui-lint`

## 3. Choices

- [x] 3.1 Rows in the display panel of views, the New view page, projects and labels; verified by `rowLayouts.test.tsx`
- [x] 3.2 Settings › Appearance › Task rows and its settings search entry; verified by the settings tests

## 4. Docs and checks

- [x] 4.1 `docs/row-layouts.md` with screenshots, `settings-you.md`, `filters.md`, `api.md`, `sync.md`, CHANGELOG, six-language strings
- [x] 4.2 `make check`
