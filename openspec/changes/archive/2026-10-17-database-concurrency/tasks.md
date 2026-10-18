# Tasks

## 1. Reader pool and immediate writes (CORE-6)
- [x] 1.1 `store.OpenReader` (query-only, 4 connections) and `_txlock=immediate` on the writer; the rule documented in `internal/store` and AGENTS.md — `TestReaderReadsDuringWriteAndRefusesWrites`, `TestWriteTransactionsTakeTheLockUpFront`
- [x] 1.2 `sync.Service.SetReader`; `List`, `Get` and the read snapshot of `Pull` on the reader; backfill only takes the writer when pending — `TestReadsDoNotWaitForWrites`
- [x] 1.3 Tenant opens the reader after migrating and closes it on `Close`; reopen after a file swap reads the new file — `TestReaderFollowsTheDatabaseAcrossReopen`
- [x] 1.4 `go test -race ./internal/store ./internal/sync ./internal/httpapi ./internal/backup ./internal/tenant ./internal/host`

## 2. Query plans and statistics (CORE-7)
- [x] 2.1 Benchmark seeding a 300k-op log — `go test ./internal/sync -run '^$' -bench ScaleShared -benchtime 10x`
- [x] 2.2 List without `ORDER BY` in SQL; Pull merges per-scope ranges — `TestQueryPlansStayInVisibleScopes`, `TestPullPagesMergeScopesInOrder`
- [x] 2.3 `PRAGMA optimize` at open and daily (tenant jobs, host housekeeping) — `TestOptimizeRuns`

## 3. Docs
- [x] 3.1 CHANGELOG, docs/architecture.md, AGENTS.md; `go test ./...`
