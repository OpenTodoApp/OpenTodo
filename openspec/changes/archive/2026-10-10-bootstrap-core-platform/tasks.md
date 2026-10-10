# Tasks

## 1. Repository and tooling

- [x] 1.1 Initialise OpenSpec (`openspec init --tools claude,agents`), fill `openspec/config.yaml` with project context and rules; verify with `openspec validate --all --strict`
- [x] 1.2 Add `.gitignore`, `.editorconfig`, `.dockerignore`, `.env.example`, AGPL-3.0 `LICENSE`; verify the files exist and `.env.example` documents every `OPENTODO_*` variable
- [x] 1.3 Add `Makefile` with `web`, `server`, `build`, `dev`, `test`, `lint`, `check`; verify `make check` runs vet, typecheck, both test suites and OpenSpec validation

## 2. Server foundation (Go)

- [x] 2.1 `internal/config`: load `OPENTODO_*` with defaults and validation; verify invalid `SESSION_DAYS` and `LOG_LEVEL` fail startup with a named error
- [x] 2.2 `internal/store`: open SQLite (WAL, busy timeout, single connection) and apply embedded migrations via `PRAGMA user_version`; verify `store.Open` on an empty temp dir creates `opentodo.db` with all tables (exercised by every service test)
- [x] 2.3 `internal/ids`: dependency-free UUID v4 and URL-safe secrets; verify format in use by tests
- [x] 2.4 `cmd/opentodo`: serve with graceful shutdown, `healthcheck` and `version` subcommands; verify `./bin/opentodo healthcheck` exits 0 against a running server

## 3. Accounts

- [x] 3.1 `internal/auth`: argon2id hashing, register (first user = owner, sign-up policy), authenticate with constant-time behaviour for unknown emails, sessions, API tokens; verify via `internal/httpapi` tests `TestFirstRunSetupThenSignupClosed`, `TestApiTokens`
- [x] 3.2 Auth routes, session cookie flags, Origin check for cookie writes, per-IP rate limit; verify `TestCrossSiteCookieWritesAreRejected`, `TestLoginRateLimit`, `TestUnauthenticatedIsRejected`

## 4. Sync engine (server)

- [x] 4.1 `internal/sync`: op model, schema allowlist, type validation, `Wins` rule; verify `TestValidateRejectsBadOps`
- [x] 4.2 Apply (idempotent insert, LWW upsert, future clamp) and Pull (cursor, device exclusion, pagination); verify `TestApplyIsIdempotentAndConverges`, `TestOrderIndependence`, `TestPullExcludesOwnDeviceButAdvancesCursor`, `TestFutureTimestampsAreClamped`
- [x] 4.3 Materialized reads `List`/`Get` with tombstone filtering and ordering; verify `TestListHidesTombstonesAndSorts`

## 5. HTTP API

- [x] 5.1 Router with JSON error envelope, security headers, request logging; verify headers in `curl -I /` and 404 envelope test
- [x] 5.2 `/api/v1/sync`, collection endpoints with write-through, `/api/v1/export`, `/healthz`; verify `TestRestWriteThroughAndSyncRoundTrip`
- [x] 5.3 Document the API in `docs/api.md` with curl examples; verify the examples match the handlers' routes and payloads

## 6. Web app: data layer

- [x] 6.1 Dexie schema (`projects`, `tasks`, `outbox`, `meta`), types mirroring the op schema, HLC; verify `npm test` passes `ops.test.ts`
- [x] 6.2 `applyOps` (per-field LWW) and `mutate` (local apply + outbox + notify); verify order-independence, idempotency and stale-remote tests in `ops.test.ts`
- [x] 6.3 Sync engine: push/pull loop, triggers (mutation debounce, online, visibility, interval), status store, 401 and offline handling; verify in the browser flow that an offline edit uploads on reconnect and reaches a second device

## 7. Web app: UI

- [x] 7.1 Auth screens (setup / sign-in / sign-up when allowed), offline fallback using cached account; verify setup form appears on a fresh server and sign-in works afterwards (browser flow)
- [x] 7.2 Shell, sidebar with live counts and project creation, router, responsive layout, dark mode; verify desktop and 390 px screenshots in `docs/screenshots/`
- [x] 7.3 Inbox / Today / Upcoming / Completed / project views with grouping, quick add with view defaults, task rows; verify Today groups overdue first and quick add in Today sets today's date (browser flow)
- [x] 7.4 Task detail panel (title, notes, project, priority, due date/time, complete, delete), project header (rename, colour, archive, delete); verify edits persist and sync (browser flow)
- [x] 7.5 Keyboard shortcuts and `?` help, error boundary; verify `j`/`c` completes a task and `g t` opens Today (browser flow)
- [x] 7.6 Settings: export link, API tokens, sign out clearing local data; verify token creation shows the secret once (browser flow)
- [x] 7.7 PWA manifest, icons, service worker with API excluded from caching; verify `manifest.webmanifest` is served and a service worker is registered (browser flow)

## 8. Packaging and deployment

- [x] 8.1 Multi-stage `Dockerfile` (web build → static Go build → distroless nonroot, `/data` owned by nonroot, HEALTHCHECK via `healthcheck` subcommand); verify by CI image build (Docker is unavailable in the authoring environment)
- [x] 8.2 `docker-compose.yml` with Coolify magic variables, named volume, health check; verify it parses and documents the plain-compose path
- [x] 8.3 GitHub Actions: web typecheck/test/build, Go vet/test/build + smoke test, OpenSpec strict validation, multi-arch image push to GHCR on main and tags; verify workflow syntax and that `make check` mirrors it
- [x] 8.4 Docs: `README.md`, `docs/self-hosting/coolify.md`, `docs/self-hosting/docker.md`, `docs/architecture.md`, `docs/sync.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`, `CHANGELOG.md`, `AGENTS.md`/`CLAUDE.md`; verify links resolve to existing files

## 9. Integration

- [x] 9.1 End-to-end browser run against the production binary: setup → capture → project → detail edits → keyboard → views → sync verified via REST → second device sign-in → offline edit → reconnect → first device receives it → settings/token → mobile layout; verify the run finishes with "E2E OK" and no console errors

## Workflow follow-up

- Archive the change so the delta specs become the live specs in `openspec/specs/`.
- Confirm `openspec validate --all --strict` passes after archiving.
