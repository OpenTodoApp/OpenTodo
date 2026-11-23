# Tasks

- [x] 1.1 The rule in `numericDateAt` in `web/src/lib/nlp/dates.ts` and `internal/quickadd/dates.go`. Verify: twelve shared vectors in `quickadd.vectors.json` (range in a line, range at the start, dashed with a year, slashed, dashed day first, after on, with a time, by, until, a range and a date in one line, `25-12`, Dutch with English first) and `app/datetime/parse.test.ts` (the when-picker reads `3-4 3pm` and `3pm 3-4`); `npx vitest run src/lib/nlp` in web/ and `go test ./internal/quickadd/`; the two range vectors fail without the rule in both parsers.
- [x] 1.2 `docs/quick-add.md` and `changelog.d/Fixed/dash-ranges.md`. Verify: `make docs-check`.
- [x] 1.3 `make openspec-validate`, `make repo-check`, `make web-lint`, `gofmt` and `go vet ./internal/quickadd/`.
