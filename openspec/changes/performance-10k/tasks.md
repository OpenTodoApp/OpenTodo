# Tasks

## 1. Fixture and harness

- [ ] 1.1 `internal/perfseed` and `cmd/perfseed`: seeded generator through `ApplyStrict` (device `perfseed`) with the composition of the spec, encrypted variant via `internal/e2ee/crypt`, summary JSON; a test that keeps it out of the server binary; verify `go test ./internal/perfseed/...` (same seed → same summary and ids; counts match; under 60 s)
- [ ] 1.2 `performance.mark` points in the app (`ot:list-ready`, `ot:search-results`, `ot:sync-idle`, `ot:remote-applied`); verify unit tests that each mark fires once per event (`npm test`) and an e2e network check that no request carries them
- [ ] 1.3 `scripts/perf/run.mjs` (Playwright desktop and phone profile, scripted session, 5 runs, medians, JSON report), `go test -tags perf ./internal/perf/...` (server metrics, RSS from `/proc`), `scripts/perf/budgets.json`, `make perf`; verify `make perf` runs locally and writes the report
- [ ] 1.4 First measurement against the budgets; record the baseline in the PR and adjust any budget only with a reason; verify `budgets.json` committed with the reasons in its `$comment`

## 2. Count checks on every PR

- [ ] 2.1 Raise `web/src/app/listPerformance.perf.test.tsx` to the 10k fixture shape; add Today single-read, search zero-read, completion ≤ 3 row renders, one transaction per pulled page, and convergence in two orders; verify `npm run test:perf`
- [ ] 2.2 Go: pull-page query count independent of size, push statements per op bound, export `AllocsPerRun` bound (`internal/sync/scale_test.go`, `querycost_test.go`, `internal/httpapi` export test); verify `go test ./internal/sync/... ./internal/httpapi/...`

## 3. Fixes

- [ ] 3.1 Profile every budget the first run exceeds and fix in order of D6 (indexes, first-sync batching, search index, decrypt on demand); each fix with a count test; verify `make perf` medians within budget, `npm test`, `npm run build`, `make bundle-budget`, `go test ./...`
- [ ] 3.2 If list budgets need windowing, stop and propose a separate OpenSpec change; verify the decision is noted in this change's PR

## 4. CI, devices and docs

- [ ] 4.1 Nightly `perf` workflow (build, perfseed, `make perf`, upload report, `nightly-alert.sh` on failure) plus a reported-only 50,000-task run; verify a manual `workflow_dispatch` run
- [ ] 4.2 `scripts/perf/device.md` and the debug page in the shells that runs the scripted session; first record `docs/performance/results-1.0.0.md` on the reference phones and a Raspberry Pi 4; verify the record lists device, OS, version and each value
- [ ] 4.3 `scripts/release/prepare.mjs` refuses a minor release without the device record or with an over-budget value lacking an issue; verify `node --test scripts/release/prepare.test.mjs`
- [ ] 4.4 `docs/performance.md` (budgets, fixture, how to run, latest results) with a repo check against `budgets.json`; links from `docs/self-hosting` and README; CHANGELOG entry under Unreleased; verify `make repo-check`, `make docs-check`, `make check`
