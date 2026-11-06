# Tasks

## 1. Limits

- [x] 1.1 `Limiter.Hold` and `Limiter.Settle` in `internal/agenttools/limits.go`. Verified by `TestLimiterHoldAndSettle`: held items are not given to another call, the unused part goes back, nothing left refuses with a retry, and the excess of a run is booked.
- [x] 1.2 The registry holds the rest before a `run_routine` that may write, refuses with `rate_limited` when nothing is left, and settles after the run. A test is not held. Verified by `TestRunRoutineWithinDailyItems` (`go test ./internal/agenttools`).
- [x] 1.3 `RunRequest.MaxWrites` in `internal/rules`: a run that planned more writes nothing and fails with the reason. Verified by `TestRoutineRunMaxWrites` (`go test ./internal/rules`).

## 2. Words

- [x] 2.1 `docs/mcp.md` (the `run_routine` row and Limits). Verified by `make docs-check`.
- [x] 2.2 CHANGELOG entry under Unreleased, Security. Verified by `make check`.
