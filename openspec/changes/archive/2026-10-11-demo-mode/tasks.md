# Tasks

## 1. Configuration and wiring

- [x] 1.1 `internal/config`: optional `OPENTODO_DEMO` boolean, invalid value stops startup; verify `TestDemoSwitchIsOptional` (`go test ./...`)
- [x] 1.2 `cmd/opentodo`: in demo mode force sign-up and push off, skip backup presets/scheduler, email poller and webhook worker, provision and seed before listening, run the nightly loop, reset on `SIGUSR1` (no-op stub on Windows); verify `go build ./...`, `GOOS=windows go build ./cmd/opentodo` and the browser smoke run (5.2)

## 2. Accounts, seed and reset

- [x] 2.1 `auth.CreateAccount` (provisioning only, refuses a second owner) and `internal/demo` accounts: hidden owner on an empty server, demo member and second member, idempotent; verify `TestStartProvisionsAccountsAndSeedsThroughOps` (`go test ./...`)
- [x] 2.2 Seed tables ported from `scripts/screenshots.mjs`, written with `ApplyStrict` from device `server`, dates relative to today; verify the same test checks every field is backed by an op and the expected entities exist (`go test ./...`)
- [x] 2.3 `sync.WipeAccounts`: delete owned shared projects and memberships, empty personal scopes, purge markers for every removed entity, delete notifications; `demo.Service.Reset`, `Start` (stale check) and `Run` (03:00 UTC); verify `TestResetWipesAndReseeds` (old ids reported purged from an old cursor, new seed pulled, stale op discarded) and `TestResetSchedule` (`go test ./...`)

## 3. HTTP API

- [x] 3.1 `internal/httpapi/demo.go`: deny-list guard answering 403 `demo_restricted` before authentication, `WithDemo`, `demo` in `auth/status`; verify `TestDemoRestrictedRoutes`, `TestDemoStatusShowsCredentials`, `TestDemoGuardOffByDefault` (`go test ./...`)

## 4. Web app

- [x] 4.1 `web/src/lib/demo.ts`, sign-in demo panel with "Try the demo", banner, Settings gating (restricted sections replaced by a note, Import disabled), share dialog without membership controls; verify `src/app/demo.test.tsx` (`npm test`, `npm run build` in web/)

## 5. Docs and verification

- [x] 5.1 `docs/self-hosting/demo.md` (Docker and Coolify), README configuration row and docs links, `.env.example`, `docker-compose.yml` passthrough, `docs/api.md` (`demo` field, `demo_restricted`), ROADMAP row, CHANGELOG (Added); verify links resolve
- [x] 5.2 Browser smoke run against the production binary with a fresh data directory: Try the demo, banner and seeded data visible, Import disabled in Settings, `kill -USR1` reset, the open page drops a visitor's task and shows the new seed without signing out
- [x] 5.3 Report binary and bundle size in design.md; run `make check`
