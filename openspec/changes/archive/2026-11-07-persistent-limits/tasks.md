## 1. Store

- [x] 1.1 Migration `0062_limit_windows.sql`; `internal/ratelimit` (`Store`: open with the salt and the open windows, `Key`, `Register`, `Changed`, `Next`, `Flush`; `Times`); verify `go test ./internal/ratelimit`
- [x] 1.2 `services.Build` opens the store; the `limits` job in `internal/tenant/jobs.go` (`WhileOpen`); `Tenant.Close` writes the last windows; verify `go test ./internal/tenant -run Limits`

## 2. Limiters

- [x] 2.1 Every `internal/httpapi` limiter is made with `Server.limit(name, …)` and kept by the store, keys hashed; verify `go test ./internal/httpapi -run TestStoredLimiterRestores` and `TestLimitsSurviveRestart`
- [x] 2.2 The agent write limits (`agenttools.Limiter.Attach`), the relay's calls per minute (`relay.Hub.Keep`) and the email sending limits (`mail.Limiter.Keep`); verify `go test ./internal/ratelimit -run 'Agent|Times'`, `go test ./internal/agenttools ./internal/relay ./internal/mail`
- [x] 2.3 Latency: `go test ./internal/httpapi -bench BenchmarkRateLimiterHit`, and `go test -tags perf ./internal/perf -run ServerBudgets` before and after

## 3. Docs and checks

- [x] 3.1 `docs/security/threat-model.md` (out of the accepted risks), `limits.md`, `how-we-verify.md`, `docs/mcp.md`; `changelog.d/Security/persistent-limits.md`; verify `make docs-check`, `make repo-check`
- [x] 3.2 `go test ./...`, `go vet ./...`, `make openspec-validate`
