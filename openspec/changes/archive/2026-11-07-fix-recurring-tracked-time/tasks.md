## 1. The rule and its vectors

- [x] 1.1 `occurrenceStarts`, `totalsByTask(entries, now, since)` and `currentTotals` in `web/src/lib/time.ts`; `OccurrenceStarts`, `OccurrenceFromRow`, `TotalsByTask(…, since)` and `CurrentTotals` in `internal/timetrack`; verified by the shared fixture `internal/timetrack/testdata/occurrence_fixture.json` (a completion and a habit's skip, an entry across a completion, records that start nothing, a record without `occurrence_date`) in `internal/timetrack/occurrence_test.go` and `web/src/lib/time.test.ts`, listed in `docs/contracts.md`

## 2. Every total against the estimate

- [x] 2.1 The shared totals of rows, the filter, saved views and sidebar counts follow the tasks too (`web/src/lib/timeEntries.ts`, `web/src/lib/liveTasks.ts`); verified by `web/src/app/task-detail/timeTab.test.tsx` "Repeating task" (the row figure reads 10)
- [x] 2.2 The Time tab's total and tab label count the current occurrence, "All occurrences" under it (`useOccurrenceStart`, `web/src/app/task-detail/TimeTab.tsx`); verified by the same test
- [x] 2.3 The agent tools' `tracked_minutes` and the automation condition on the server (`internal/agenttools/data.go`, `internal/rules/engine.go`) and the routine runner on the device (`web/src/lib/rules/run/state.ts`); verified by `internal/mcp/timeentries_test.go` `TestTrackedMinutesOfRepeatingTask`

## 3. Checks and docs

- [x] 3.1 `go test ./internal/timetrack ./internal/agenttools ./internal/filter ./internal/rules ./internal/mcp`; `npm test` and `npm run build` in web/, `make bundle-budget`, `make i18n-check` (one new string in every catalog), `make docs-check`
- [x] 3.2 `docs/time-tracking.md`, `docs/recurrence.md`, `docs/filters.md`, `docs/mcp.md`, `docs/contracts.md`; changelog fragment `changelog.d/Fixed/fix-recurring-tracked-time.md`; `make openspec-validate`
