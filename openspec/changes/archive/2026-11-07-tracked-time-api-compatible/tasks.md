## 1. The API keeps the total

- [x] 1.1 `tracked_minutes` counts every entry again and `tracked_minutes_occurrence` is added on repeating tasks (`internal/agenttools/data.go`); verified by `internal/mcp/timeentries_test.go` `TestTrackedMinutesOfRepeatingTask` (30 before a completion and 10 after: 40 and 10; a task that does not repeat has no new field)
- [x] 1.2 The v1 surface stays additive; verified by `go test ./internal/httpapi -run TestV1SurfaceIsAdditive` and the MCP `tools/list` golden

## 2. Routines and filters keep the total

- [x] 2.1 The automation condition `tracked` and the `tracked` filter terms of a Find tasks step read every entry; `tracked occurrence` reads the current occurrence (`internal/rules/engine.go`, `routine_steps.go`); verified by `internal/rules/tracked_test.go` `TestTrackedKeepsTheTotal`
- [x] 2.2 `tracked occurrence` in both parsers and evaluators (`internal/filter`, `web/src/lib/filter`), the vectors' `tracked_occurrence` map and cases; verified by `internal/filter` `TestEvaluateVectors`, `TestFilterTrackedTerms`, `web/src/lib/filter/evaluate.vectors.test.ts`, `filter.test.ts` "evaluate: tracked occurrence", `builder.test.ts` round trips and `internal/filter/testdata/formatted.txt`
- [x] 2.3 The device's routine runner (`web/src/lib/rules/run`) reads the total for the condition and both maps for Find tasks; verified by `npx vitest run src/lib/rules`
- [x] 2.4 The app's shared totals hold both maps: rows read the occurrence, Filter view, saved views and sidebar counts both (`web/src/lib/timeEntries.ts`, `FilterView`, `useViews`, `Sidebar`); verified by `web/src/app/task-detail/timeTab.test.tsx` "Repeating task" (row 10, filter 50/10)
- [x] 2.5 The condition editor's **All occurrences** switch and the condition's words (`web/src/app/filter`), two new strings in every catalog; verified by `make i18n-check`

## 3. Vectors, checks and docs

- [x] 3.1 The shared occurrence fixture gains the 30-before, 10-after case (`totals` and `all_totals`); verified by `internal/timetrack/occurrence_test.go` and `web/src/lib/time.test.ts`
- [x] 3.2 `go test ./internal/timetrack ./internal/agenttools ./internal/mcp ./internal/filter ./internal/rules ./internal/ruleval ./internal/httpapi/...`; `npx vitest run src/lib/filter src/lib/rules src/lib/time src/app/task-detail`, `npm run build` and `make bundle-budget` in web/
- [x] 3.3 `docs/mcp.md`, `docs/api.md`, `docs/filters.md`, `docs/time-tracking.md`, `docs/recurrence.md`; the changelog fragment `changelog.d/Fixed/fix-recurring-tracked-time.md`; `make docs-check`, `make repo-check`, `make openspec-validate`
