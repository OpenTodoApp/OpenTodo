## 1. Account limits

- [x] 1.1 `Limiter.AllowCallFor`, `ReserveFor`, `RefundFor` with `AccountPerMinute` and `AccountPerDay`; the token-only methods wrap them; verify `TestLimiterPerAccount` and the existing `TestLimiterPerMinuteAndPerDay`
- [x] 1.2 `Registry.write`, `writeAll` and the routine run count against the caller's account; verify `TestWriteRatePerAccount`, `TestWriteDailyEntities`, `TestWriteRatePerMinute` (`go test ./internal/agenttools`)

## 2. Docs and checks

- [x] 2.1 `docs/mcp.md`, `docs/security/threat-model.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 2.2 `go test ./...`, `make openspec-validate`
