## 1. The chain

- [x] 1.1 Migration `0060_audit_chain.sql` (checkpoint at the current tail) and the Go step adding `audit_events.hash`; verify `go test ./internal/store -run TestMigrationAuditChainStartsAtTheTail`
- [x] 1.2 `internal/audit/chain.go`: canonical form, hash, tip, `Head`, `Verify`, `RechainTx`; `Record` in its own transaction; verify `go test ./internal/audit -run 'TestChain'` (fresh database, edited, deleted, reordered and unhashed events, address scrubbing, the known-answer vector)
- [x] 1.3 Pruning in id order that moves the checkpoint, `NextPrune` from the first event; verify `go test ./internal/audit -run 'TestChainSurvivesPruning|TestPruneKeepsTheChainContiguous|TestPrune|TestNextPrune'`

## 2. Verification and export

- [x] 2.1 Startup and upkeep check that logs a broken chain; verify `go test ./internal/tenant -run TestHousekeepingReportsABrokenAuditChain`
- [x] 2.2 `GET /api/v1/audit/verify` (owner only) and the chain head line in the export; verify `go test ./internal/httpapi -run 'TestAuditVerifyRoute|TestAuditExportRecordsItself|TestAuditRoutesRequireOwner|TestSecurityRoutePolicies|TestEveryRouteIsInTheAPIDoc'`
- [x] 2.3 `ot audit verify` with its schema and error code; verify `go test ./internal/cli -run 'TestAuditVerify|TestSchemaGolden'`
- [x] 2.4 The demo rebuilds the chain after removing a visitor's events; verify `go test ./internal/demo -run TestNightlyResetDeletesAllSandboxes`

## 3. Docs and checks

- [x] 3.1 `docs/api.md`, `docs/cli.md`, `docs/self-hosting/docker.md` (keeping an anchor), the threat model, `how-we-verify.md` and `limits.md`; tick 6.13 in `external-security-review` with the deferred parts; CHANGELOG `### Security`; verify `make docs-check`, `make openspec-validate`, `go test ./...`
