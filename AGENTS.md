# Working on OpenTodo

Self-hosted, local-first task manager: Go server + SQLite, React PWA embedded in the binary, field-level op-log sync. AGPL-3.0. Each rule in full, every package and the conventions: `docs/contributing/packages.md`. The human guide: `CONTRIBUTING.md` and `docs/contributing/`.

## Non-negotiables
1. **Specs before behavior.** A behavior change starts as an OpenSpec change (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`; `docs/contributing/openspec.md`). After ticking tasks, archiving a change or editing `ROADMAP.md`, run `make docs`.
2. **All data writes go through ops.** Server: `internal/sync` (REST writes `ApplyStrict`, then `NotifyApplied`). Client: `web/src/lib/ops.ts` → `mutate()`. Membership is never an op.
3. **Op schema is additive.** Declare a field once in `internal/sync/ops.go` `Schema`, then `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. Never rename or remove a field without a design doc.
4. **Auth required by default.** Every route goes through `routes.handle(pattern, policy, handler)` in `internal/httpapi/policy.go`; `public("reason")` only when a spec says so. A route abusable on a public demo gets `.demoDenied()` and an entry in `internal/httpapi/demo.go`.
5. **No telemetry, no third-party calls by default except maps, no new mandatory env vars.** Outbound requests go to configured targets through `internal/outbound`, maps only through `internal/maps`.
6. **Keep it small.** A dependency needs an AGPL-3.0-compatible licence and no network calls of its own, and stays within the first-load budget (`make bundle-budget`). The pull request names it and its size impact.

## On every change
- `make check` is what CI runs. Build the web app (`make web`) before `go build` or tests that import `internal/web`.
- Changelog: one fragment `changelog.d/<Section>/<name>.md`, never `CHANGELOG.md` (`changelog.d/README.md`).
- `web/src/generated/help.json` is generated and ignored: never commit it. After editing docs, run `make docs` and `make docs-check`.
- Time in Go request logic is `s.now()` (`internal/httpapi`) or `s.clock()` (`internal/auth`), never `time.Now()`.
- Go, TypeScript, design, dates and data conventions: `docs/contributing/packages.md#conventions`.
