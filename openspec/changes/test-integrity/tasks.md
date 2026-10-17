# Tasks: test-integrity

## 1. Checked responses and static analysis (OPS-25)
- [x] 1.1 Assert the status of every response staticcheck flags (SA4006) in `internal/httpapi` tests; verified by `go test ./internal/httpapi/`
- [x] 1.2 Fix the other findings (SA1019 elliptic coordinates in `internal/webauthn` and `internal/push` tests, SA4006 in `internal/host/operator.go` and `internal/agenttools`, SA4010, S1038, ST1005, ST1018, U1000); verified by `make staticcheck` reporting nothing and `go test ./internal/webauthn/` (`TestCOSEKeyOffCurveRefused`)
- [x] 1.3 `make staticcheck` (pinned v0.8.1) in `make check`; one step in the Go job of `.github/workflows/ci.yml`

## 2. Schema contract and client clock (DATA-16)
- [x] 2.1 `internal/sync/testdata/schema_fixture.json`; `TestSchemaMatchesSharedFixture` (`go test ./internal/sync/`) and `web/src/lib/schemaFixture.test.ts` (`npx vitest run src/lib/schemaFixture.test.ts`)
- [x] 2.2 `web/src/lib/hlc.test.ts`: monotonicity, seed, server time, skew bounds, tie-break
- [x] 2.3 `sync.test.ts`: a 5xx answer keeps the outbox and the cursor

## 3. Sync tests (CORE-23) and calendar test
- [x] 3.1 Per-fixture op counter; sharing tests run with `t.Parallel()`; `go test -race ./internal/sync/`
- [x] 3.2 `TestConvergenceProperty` (seeded, logged, `OPENTODO_PROPERTY_SEED` replays); `go test -race -run TestConvergenceProperty ./internal/sync/`
- [x] 3.3 `TestExpandOldSeriesIsFastAndComplete` counts work units; `go test ./internal/calfeed/`
