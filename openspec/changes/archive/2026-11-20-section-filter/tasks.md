# Tasks

## 1. Query language

- [x] 1.1 Parser and evaluator in TypeScript (`web/src/lib/filter/parse.ts`, `evaluate.ts`, `builder.ts`). Verify: `cd web && npx vitest run src/lib/filter`.
- [x] 1.2 Parser and evaluator in Go (`internal/filter/filter.go`, `evaluate.go`). Verify: `go test ./internal/filter`.
- [x] 1.3 Shared vectors with sections (`web/src/lib/filter/evaluate.vectors.json`) and the parser queries and errors in both languages. Verify: the same two commands.

## 2. Builder

- [x] 2.1 Section condition with the Combobox, chip icon and words (`ConditionEditor.tsx`, `FilterBuilder.tsx`, `conditionText.ts`, `FilterChips.tsx`, `FilterView.tsx`, `SavedViewView.tsx`). Verify: `cd web && npx vitest run src/app/filter src/app/views`.
- [x] 2.2 Check in a browser: add a Section condition and see the list narrow. Verify: built app, seeded account with a "Review" and a "Backlog" section in two projects: `section: Review` lists the Work and the Home task, `section: Review | section: Backlog | no section` lists six tasks and leaves the "Doing" one out, the builder shows "Section is Review", and the picker offers one "Review" for both projects.

## 3. Docs and release

- [x] 3.1 `docs/filters.md` (grammar, terms, error table, example 32) and the translation catalogs. Verify: `make docs`, `make docs-check`, `make i18n-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/section-filter.md`. Verify: `make repo-check`.
