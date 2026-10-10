# Tasks

## 1. Parser (web/src/lib/filter)

- [x] 1.1 Tokenizer: operators, parentheses, `@`/`#`/`##` prefixes, `pN`, comparison operators, quoted and bare words, positions; verify `filter.test.ts` tokenises `@"follow up" & !(#Work | p1)` into the expected token list (`npm test`)
- [x] 1.2 Recursive-descent parser producing the AST with precedence `!` > `&` > `|`; verify `filter.test.ts` precedence and grouping cases from the spec (`npm test`)
- [x] 1.3 Error reporting with position and expected set; verify `filter.test.ts` messages `Expected a term after "&" at position 9` and `Missing ")" at end of query` (`npm test`)
- [x] 1.4 Date expression parsing (`today`, `tomorrow`, `yesterday`, weekday, ISO date, `N days`, `N days ago`) resolved against an injected "today"; verify `filter.test.ts` weekday case for Saturday 2026-10-10 → 2026-10-16 (`npm test`)

## 2. Evaluator

- [x] 2.1 Compile AST to predicate with context (today, label and project maps, descendant sets); verify `filter.test.ts` for label, `#`/`##`, `no project`, `no labels`, priority, `completed`/`open` defaults, `subtask`, `search:` (`npm test`)
- [x] 2.2 Date comparisons on floating dates with "no due never matches"; verify `filter.test.ts` `due <= tomorrow` includes overdue and excludes undated (`npm test`)
- [x] 2.3 Unknown names produce warnings and empty matches; graceful behavior when labels or hierarchy are absent; verify `filter.test.ts` "unknown label warns and rest still matches" (`npm test`)
- [x] 2.4 Performance check: evaluate a 20-term query over 5,000 generated tasks under 50 ms in `filter.test.ts` (`npm test`)

## 3. Filter view (web/src/app)

- [x] 3.1 `FilterView.tsx`: input with usage hint, debounced evaluation, error/warning line, results grouped by project using the standard rows, Enter to first result, Escape back to input; verify browser flow matching "Open and run a query" and "Syntax error" (previous results remain)
- [x] 3.2 Per-device history of the last 20 distinct queries in `meta`, Up/Down recall; verify browser flow: recalled after reload, absent on a second device
- [x] 3.3 Sidebar entry and `g f` shortcut, `?` help updated; verify browser flow: `g f` opens the view, shortcuts suppressed while typing in the query input
- [x] 3.4 Live results: completing a listed task on another device removes it after sync; verify two-device browser flow
- [x] 3.5 `npm run build` passes with bundle growth under 8 KB gzipped; verify by comparing `dist` sizes

## 4. Docs

- [ ] 4.1 Write `docs/filters.md` with the grammar, precedence, quoting, date expressions, keywords and ten worked examples; verify every example parses in `filter.test.ts` ("docs examples" case loads the file)
- [ ] 4.2 README feature list and CHANGELOG under Unreleased; verify `make check` passes
