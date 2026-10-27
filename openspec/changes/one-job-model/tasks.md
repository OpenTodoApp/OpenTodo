# Tasks

## 1. Scheduler core (`internal/jobs`)
- [x] 1.1 `Job`, `Signal`, `Upkeep`, `Earliest` and the job names; verified by `go test ./internal/jobs`
- [x] 1.2 `Runner`: due-time sleep, `Wake` at once, `Changed` debounced, retry floor after a still-due run, check interval, independent jobs, no overlap, stop waits for runs; timing tests on a fake clock (`go test -race ./internal/jobs`)

## 2. Move the jobs
- [ ] 2.1 `tenant.Jobs`: the job list of D1, built once when the tenant opens; demo and owner-switch gating inside the list and each `Next`; verified by `go test ./internal/tenant`
- [ ] 2.2 Services report work through the tenant's `Signal` (webhook, channels, rules, backup settings, the commit observer); per-service wake channels removed
- [ ] 2.3 `StartJobs` runs the list with `jobs.Runner`, attaches it to the `Signal` and adds the `writes` probe; the stop function detaches and waits; verified by the existing shutdown tests in `internal/tenant` and `cmd/opentodo`
- [ ] 2.4 The host scheduler computes due times and runs work through the same list; per-job retry pause; verified by `go test ./internal/host`
- [ ] 2.5 Remove the per-service loops (`Run` of push, digest, demo, email, calfeed, issues, calsync, webhook, channels, rules; `RunPruner`, `RunSweeper`, `RunRetention`, `RunOptimizer`, the backup loop, `deliveryq.Loop`, `poll.Every`) and adapt their tests
- [ ] 2.6 `notify.NextSweep` (oldest read notification + 90 days) in the housekeeping deadline; test in `internal/notify`
- [ ] 2.7 Tests: a webhook queued through the commit observer is delivered within a second while the check interval is 30 s; a rule event runs at once; two tenants on one data directory, jobs in one: a delivery queued through the other is sent exactly once by the leader within a few seconds
- [ ] 2.8 Docs: `docs/architecture.md` background jobs section, AGENTS.md layout lists `internal/jobs`
- [ ] 2.9 `go test ./...`, `go test -race` on the touched packages (httpapi with a 45-minute timeout), staticcheck, `make repo-check`, `make openspec-validate`, the route-matrix test
