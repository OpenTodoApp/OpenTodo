## 1. Benchmark

- [x] 1.1 `internal/perf/reference_test.go`: the reference workload, timed in each `TestServerBudgets` run and around `TestNotesBudgets`; verified by `go test -tags perf -run TestReferenceWorkloadMeasures ./internal/perf`
- [x] 1.2 `report()` scales the server's ms and s limits by the reference, capped at the backstop, and the alert names both limits; verified by `go test -tags perf -run 'TestReport|TestBudgetsFile' ./internal/perf`
- [x] 1.3 `budgets.json` `reference` and `docs/performance.md`; verified by `node --test scripts/perf/budgets.test.mjs` and `make docs-check`

## 2. Calibration

- [x] 2.1 This pull request's perf run (`perf.yml`) passes and reports `server-reference` on the CI runner; verified by the run's `perf-report/server.json`
- [x] 2.2 `baseline` is set to that CI value and the pull request states it; verified by `go test -tags perf -run TestBudgetsFile ./internal/perf` and the next perf run

## 3. Check

- [ ] 3.1 `make check`
