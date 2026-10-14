# Tasks

Phases may be split into separate changes when scheduled (design "Migration Plan"). Each phase leaves single-tenant behaviour unchanged.

## 1. Tenant refactor (phase 1)

- [ ] 1.1 Review the ~40 package-level variables in `internal/` and move any per-server state into the services that own it. Verify `go test ./...` and a list in the design of each variable with its verdict.
- [ ] 1.2 Move the wiring in `cmd/opentodo/main.go` into `tenant.Open(dir, hostCfg)` / `Close()` (store, locks, services, notifier, per-tenant handler, background jobs), with `main` opening exactly one tenant. Verify `go test ./...`, `make cli-smoke` and an unchanged `GET /healthz` and settings behaviour.
- [ ] 1.3 Add a test that opens two tenants in one process with separate data directories and proves sync, sessions, notifications and push keys never cross. Verify `go test ./...`.

## 2. Outgoing email (phase 2)

- [ ] 2.1 Implement SMTP sending with the standard library (TLS and STARTTLS), optional `OPENTODO_SMTP_*` variables and owner settings, the password in `secrets/`, a test message action, and rate limits and audit events. Verify unit tests against an in-process SMTP test server, and that with no configuration nothing is sent. Run `go test ./...`.
- [ ] 2.2 Add verified self-service sign-up and "Forgot password" (routes with rate limits, `400` on malformed bodies, neutral answers, single-use expiring links, session revocation). Verify `httpapi` tests for each scenario in `specs/account-access`, web tests for the screens, `npm test` and `npm run build`.
- [ ] 2.3 Document SMTP in `docs/self-hosting/` and the reset flow in `docs/account-security.md`. Verify `make docs-check`.

## 3. Host mode (phase 3)

- [ ] 3.1 Add the host-level registry (SQLite outside tenant directories) and host-name routing, with `404` for unknown names and no cross-tenant access. Verify routing tests with two tenants and an unknown host. Run `go test ./...`.
- [ ] 3.2 Add lazy open with migration on open, idle close that respects live event streams, and an open-tenant cap with LRU. Verify tests for cold start, a stream keeping a tenant open, the cap closing the least recently used, and one tenant's failing migration answering `503` while another serves. Run `go test ./...`.
- [ ] 3.3 Move operator-level settings (SMTP, single sign-on, backup destinations, push subject, MCP and AI switches, sign-up policy) to host configuration in host mode, and hide their owner panels in tenants. Verify tests that single-tenant settings are unchanged and tenant owners cannot reach host settings.

## 4. Shared scheduler (phase 4)

- [ ] 4.1 Add the host-level "next due" index, written by tenants on change, and one scheduler that opens only due tenants for reminders, backups, retention and webhooks. Verify a test with 10,000 registered tenants where none is opened without due work, and a reminder in a closed tenant delivered on time. Run `go test ./...`.

## 5. Limits (phase 5)

- [ ] 5.1 Generalise the demo budgets into per-tenant limits (database size, ops per hour and total, request rate, import size, members), refused per operation with a named reason. Verify tests for each limit, and that a device's outbox keeps syncing other operations. Run `go test ./...` and `npm test`.

## 6. Lifecycle and portability (phase 6)

- [ ] 6.1 Add the operator interface (create empty or from an archive, suspend and resume, delete with a grace tombstone, export), authenticated by a host token and unreachable through tenant host names. Verify tests for `401` without a token, each action, and a suspended tenant answering `503`.
- [ ] 6.2 Let tenant owners download their tenant archive from the web app (building on `backup-restore-web`). Verify an end-to-end test: hosted export, restore into a fresh self-hosted server, sign in, data present.
- [ ] 6.3 Document host mode for operators in `docs/self-hosting/` and add the ROADMAP.md item. Run `make check`. Verify it passes, including `openspec validate --all --strict`.
