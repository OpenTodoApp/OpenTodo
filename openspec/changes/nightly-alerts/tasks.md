## 1. Race

- [x] 1.1 `TestMCPBridgeStaleKey` reads stdout through a mutex-guarded buffer; `go test -race -count=3 -run TestMCPBridge ./internal/cli/` and `go test -race ./...` pass

- [x] 1.2 The backup service publishes a copy of the run in progress (race between `backup.(*Service).execute` and `Running` found by the first green-test nightly on this branch); `go test -race -count=5 -run TestBackup ./internal/httpapi ./internal/backup` passes

## 2. Alert

- [x] 2.1 `alert` job in `.github/workflows/nightly.yml` (`if: always()`, default branch only, `issues: write`) running `scripts/nightly-alert.sh`; checked with `DRY_RUN=1` for a failed and a green result
- [x] 2.2 `scripts/repo-checks.test.mjs` requires the alert job and its needs; `node --test scripts/repo-checks.test.mjs` passes
