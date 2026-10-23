# Tasks

## 1. Formatter and builder model

- [ ] 1.1 Add `formatQuery` to `web/src/lib/filter/builder.ts`: minimal parentheses (D2), readable leaves, tracked minutes as `45m`/`2h`/`1h30`; verify `npx vitest run src/lib/filter/builder` round-trips every `docs/filters.md` example, the Go acceptance edge forms and 300 seeded random trees (`parse(formatQuery(t))` equals `t` without positions)
- [ ] 1.2 Write the formatted fixtures to `internal/filter/testdata/formatted.txt` from the vitest (failing when stale, regenerated with `UPDATE_FIXTURES=1`) and add `TestFilterParserAcceptsFormatted` in `internal/filter/filter_test.go`; verify `go test ./internal/filter/`
- [ ] 1.3 Add `toBuilder` / `fromBuilder` (D3): root group, Not on items, three-level limit, `!!` unrepresentable, empty groups dropped, single-item groups unwrapped; verify unit tests for each rule and that `fromBuilder(toBuilder(t))` formats to the same text as `t` for every representable fixture

## 2. Builder UI

- [ ] 2.1 `web/src/app/filter/conditionText.ts`: words for every leaf kind through the catalog (D7); verify a unit test over one leaf of every kind
- [ ] 2.2 `web/src/app/filter/ConditionEditor.tsx`: the dialog of D4 (field select, Combobox for labels and projects with sub-projects, date comparison and value, priority toggles, state list, text, origin, tracked and custom-field inputs, Not, Remove), Save enabled only for a valid condition; verify `npx vitest run src/app/filter` (happy-dom) creating each kind and reading the produced formula
- [ ] 2.3 `web/src/app/filter/FilterBuilder.tsx`: groups (All of these / Any of these, Not, + Condition, + Group, remove), chips, roving arrows and Delete/Backspace within a group, the unrepresentable notice, the count line; verify tests for building `@work & due <= tomorrow & (p1 | p2)`, typing `(@errand | @call) & !p4`, Not on a group, Delete on a focused chip, and `!!p1` showing the notice
- [ ] 2.4 Stories `web/src/app/filter/FilterBuilder.stories.tsx` (empty, simple, nested with Not, unrepresentable, phone) in both themes; verify `make ui-check` accessibility gate and baselines regenerated in the pinned Playwright image

## 3. Screens

- [ ] 3.1 Filter view: the builder above the input, two-way (D1), the Builder toggle remembered per device (D5), open by default, replacing the usage hint while the query is empty, the count from the results; verify `npx vitest run src/app/filterView` (existing tests unchanged, new two-way test) and `node scripts/e2e-views.mjs` filter steps
- [ ] 3.2 Saved filter: the builder over the draft, closed by default, the draft count from `runFilter` (D6), Save and Esc unchanged; verify a test that builds `!@waiting` into a saved view's draft, sees the draft count, saves, and finds the stored query text

## 4. Docs, catalogs, release

- [ ] 4.1 Strings in the five shipped catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 4.2 `docs/filters.md` gains "Build a filter without typing" (and the saved-filter guide mentions the builder); CHANGELOG under Unreleased; verify `make docs-check`
- [ ] 4.3 Measure the main bundle before and after (`npm run build`) and record it in design.md "Implementation notes"
- [ ] 4.4 Run `make check` with TZ=UTC; open the pull request and get CI green
