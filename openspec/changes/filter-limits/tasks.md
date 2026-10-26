## 1. Server parser

- [x] 1.1 `internal/filter`: `MaxQueryLength` (4,096 code points) checked before tokenizing, `MaxNesting` (64) counted for each `(` and `!`; both are `*SyntaxError` (`go test ./internal/filter`)
- [x] 1.2 Shared vectors `internal/filter/testdata/limits.json`; `TestFilterLimits` runs them, including three million `(` (`go test ./internal/filter`)
- [x] 1.3 `FuzzParse`: every input is nil or a `*SyntaxError` (`go test ./internal/filter -fuzz FuzzParse`)
- [x] 1.4 `POST` and `PATCH /api/v1/views` with a 3,000,000-character query answer 400 with the message (`go test ./internal/httpapi -run View`)

## 2. App parser

- [x] 2.1 `parse.ts`: `MAX_QUERY_LENGTH` and `MAX_NESTING` with the same messages; the vectors run in `filter.test.ts` (`npm test`)
- [x] 2.2 `withCompletedTasks` builds `query & (open | completed)` from the parsed query in the Filter view and saved views (`filter.test.ts`)
- [x] 2.3 The two messages in every catalog (`make i18n-check`)

## 3. Docs

- [x] 3.1 `docs/filters.md` Errors, `docs/api.md` views
- [x] 3.2 CHANGELOG Unreleased, Security
