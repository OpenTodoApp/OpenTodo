# Tasks

## 1. Query language

- [x] 1.1 Matcher in TypeScript (`web/src/lib/filter/names.ts`), the tokenizer's `\*` in quoted names and the printers (`parse.ts`, `builder.ts`), used by `evaluate.ts`. Verify: `cd web && npx vitest run src/lib/filter`.
- [x] 1.2 Matcher in Go (`internal/filter/names.go`) and the tokenizer (`filter.go`), used by `evaluate.go`. Verify: `go test ./internal/filter`.
- [x] 1.3 Shared vectors: wildcard queries in `web/src/lib/filter/evaluate.vectors.json`, the matcher fixture `internal/filter/testdata/wildcards.json` (escapes, no match, overlap, operator characters) and the formatted queries in `internal/filter/testdata/formatted.txt`. Verify: the same two commands.

## 2. Pickers and rules

- [x] 2.1 The condition editor and the calendar's label checkboxes escape a picked name's stars (`ConditionEditor.tsx`, `QueryFilterDialog.tsx`); "Make an automation rule" drops a wildcard term (`rules/convert.ts`). Verify: `cd web && npx vitest run src/lib/filter/names.test.ts src/lib/calendarClarity.test.ts src/lib/rules`.

## 3. Docs and release

- [x] 3.1 `docs/filters.md` (names, quoting and case; example 34). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/filter-wildcards.md`. Verify: `make check`.
