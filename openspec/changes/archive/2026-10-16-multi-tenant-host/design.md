# Design

## Context

- **One data directory per process.** `cmd/opentodo/main.go` (~500 lines) builds the server around `cfg.DataDir`:
  - `store.LockShared` and `store.LockJobs` (rolling updates already let a new process start beside the old one, and only one runs the jobs)
  - `store.Open`
  - the services: sync, auth, push with its VAPID key file, backups, webhooks, email, assistant, notify and the MCP settings
  - background goroutines: push every 30 s, retention, audit pruning, the backup scheduler, the email poller, the webhook worker and the demo cleanup
- **Services take their database by injection.** Package-level state is limited (about 40 variables to review). The data directory is referenced in 9 packages.
- **Measured cost:** an idle server uses about 20 MB RSS. A fresh data directory is under 1 MB. Migrations (25 so far) run on open via `PRAGMA user_version`.
- **Existing machinery to reuse:** demo sandboxes already host many short-lived accounts in one process, with write budgets, a database size guard and per-address limits (`internal/demo`, `internal/httpapi/demo.go`).
- **Outgoing email** shipped separately as the `outgoing-email` change (`internal/mail`, D6).
- **Background jobs** already run in one elected process per data directory (`runJobsWhenLeader` with `store.LockJobs`), so rolling updates never run them twice.
- See proposal.md for the motivation and the decision to keep this in the open binary.

## Goals / Non-Goals

**Goals:**
- Memory and background work proportional to *active* tenants.
- A tenant's data directory stays byte-compatible with a self-hosted one, both ways.
- Updates are a rolling restart of a few host processes. Tenant migrations happen lazily.
- A single-tenant server keeps its exact behaviour, configuration and performance.

**Non-Goals:**
- Accounts spanning tenants, or sharing a project across tenants. A household or team is one tenant.
- A distributed database. Each tenant stays a single SQLite file with a single writer.
- The control plane (separate project).

## Decisions

### D1. Tenant = data directory, built by one constructor
`main.go`'s wiring moves into `tenant.Open(ctx, cfg, opts) (*Tenant, error)` (`internal/tenant`). It takes the shared data-directory lock, applies a pending web restore, opens and migrates the store and builds the services, the notifier and the per-tenant HTTP handler. `StartJobs` starts a self-hosted server's background goroutines; `Close()` ends live streams, closes the database and releases the lock. A normal server calls it once with its own configuration; a host derives a configuration per tenant (data directory, base URL, setup token, limits) and passes `Options.Hosted`. This is phase 1, with no behaviour change, verified by the existing test suite, `cli-smoke` and a two-tenant isolation test. The review of every package-level variable, with its verdict, is in notes.md: none holds per-server state that leaks between tenants.

Alternative considered: a `tenant_id` column in every table (row-level multi-tenancy). Rejected because it changes every query and the data model, breaks byte-compatibility with self-hosted data, and puts every tenant behind one writer.

### D2. Host mode: routing, lazy open, idle close
- **Configuration.** Optional `OPENTODO_HOST_URL` (for example `https://example.cloud`) turns host mode on and needs `OPENTODO_HOST_TOKEN`; `OPENTODO_HOST_OPERATOR_ADDR`, `OPENTODO_HOST_IDLE_MINUTES`, `OPENTODO_HOST_MAX_OPEN` and `OPENTODO_HOST_LIMITS` are optional. Host mode refuses a data directory holding a self-hosted database and cannot be combined with `OPENTODO_DEMO`.
- **Routing.** With host mode on, a request's host name (`<tenant>.<host domain>`) selects the tenant from a host-level registry, a small SQLite database (`<data>/host.db`) beside the tenant directories (`<data>/tenants/<name>`). Unknown and deleted names answer the same 404; suspended ones 503; the bare address answers the health check only.
- **Lazy open.** A tenant is opened on first request, which also runs its migrations. A tenant that fails to open answers 503, its error is stored for the operator, and it is retried after a minute.
- **Idle close.** Tenants idle beyond a timeout (default 10 minutes) close, but never while a request, a live event stream included, uses them.
- **Open-cost guard.** A per-host cap on open tenants (default 500) bounds memory. When the cap is reached, the least recently used idle tenant closes first; when none is idle the request answers 503 `busy`.

### D3. One scheduler for all tenants
Per-tenant goroutines (push every 30 s, retention, audit pruning, backups, webhooks) don't scale with thousands of tenants. Instead:
- **"Next due" index.** Each open tenant writes its next due instant per job kind (`reminders`, `backup`, `webhooks`, `calendars`, and `housekeeping` for Trash retention, audit, sign-up and delivery-log pruning) into the registry's `due` table: when it opens, after a committed write (debounced), every 30 s while open, after its jobs ran and when it closes.
- **One host scheduler.** It sleeps until the earliest entry (at most 30 s, the push tick), opens only those tenants (D2), runs the job through the same code paths as today (`push.Tick`, `backup.RunIfDue`, `webhook.ProcessDue`, `calfeed.RunOnce`, the retention and prune passes), and records the next due time. It runs in the process that holds the host's jobs lock, as a self-hosted server's jobs do.
- **Single-tenant servers** keep their current loops, so self-hosted behaviour doesn't change.

Alternative considered: polling every tenant on an interval. Rejected because the cost grows with registered tenants, not due work.

### D4. Operator-level settings move to the host
On a host, SMTP, single sign-on, backup destinations, push subject, the MCP and AI switches and sign-up policy are operator concerns, and so are attachment limits and the webhook network policy (disk and the host's private network). Host mode reads them from host configuration (the same `OPENTODO_*` variables a self-hosted server reads), answers the tenant routes that read or write them with 403 `host_managed`, and hides the corresponding owner panels in tenants (`auth/status` says `hosted`). Email to task needs a mailbox per server and is off on a host. Tenant owners keep their tenant-level settings (members, invitations, their own policies). A single-tenant server is unchanged: the owner remains the operator.

### D5. Limits per tenant
These generalise the demo sandbox budgets into tenant limits:
- database size
- ops per hour and in total
- request rate
- import size
- number of members

Exceeding a limit refuses the write with a clear error and leaves sync otherwise working. Unlike the demo budget, which refuses a whole batch, a tenant limit refuses single operations through a `sync.Quota` hook (reasons `limit_storage`, `limit_ops_hour`, `limit_ops_total`), and the server sends no value back for them, so the device keeps the change and offers it again later. Limits are host configuration (`OPENTODO_HOST_LIMITS` defaults, per-tenant overrides through the operator interface), so later paid plans can be expressed as limit sets.

### D6. Outgoing email (phase 2)
SMTP with the standard library (`net/smtp` with STARTTLS or TLS), configured by optional `OPENTODO_SMTP_*` variables or owner settings with the password in the secrets directory, like the IMAP password. It enables verified self-service sign-up and self-service password reset. Sending is rate limited per address and per account. Failures are logged and audited, never retried in a tight loop. Without SMTP, nothing changes.

Shipped in the `outgoing-email` change (`openspec/specs/outgoing-email/`). The decisions as shipped: owner settings through `GET`/`PUT /api/v1/settings/smtp` with `OPENTODO_SMTP_*` overriding and locking each field; the password only in the secrets directory; five message kinds (`verify_signup`, `password_reset`, `invitation`, `project_invite`, `test`), plain text in the six quick-add languages; limits of 5 messages of one kind per address per hour and 100 per hour in total; synchronous sending with a 15-second timeout, no queue or retry, `email.sent`/`email.failed` audit events; no task content for accounts with end-to-end encryption. A host reads the same settings from host configuration (3.3).

### D7. Tenant lifecycle and portability
The operator interface is authenticated with a host-level token and listens on its own address (`OPENTODO_HOST_OPERATOR_ADDR`, default `127.0.0.1:8081`), so it is never reachable from a tenant's host name. It can:
- create a tenant (empty, returning a setup token for its first account, or from a backup archive)
- suspend and resume it
- delete it (data directory removed, registry entry kept as a tombstone for a grace period)
- export it as the same archive `opentodo restore` reads

Owners can download that archive themselves from the web app, which builds on `backup-restore-web`.

### D8. Updates and replication
- **Updates.** Host processes are updated by the existing rolling-update path (`LockShared`). Each tenant migrates when the new process first opens it. A migration failure marks that tenant unavailable and alerts, without affecting others.
- **Replication.** Continuous replication of tenant databases to object storage (Litestream-style) belongs to the control plane. The binary only needs to be safe under WAL-based replication, which it already is.

## Risks / Trade-offs

- [Shared process: a panic or memory leak affects all tenants on a shard] → Keep shards small, recover from panics per request, and limit memory per tenant through D5.
- [Cold start latency when opening an idle tenant] → Opening SQLite and checking `user_version` takes milliseconds. Measure it, and keep a warm set by recency.
- [Hidden global state surfaces in host mode] → Phase 1 reviews the ~40 package-level variables. Run the test suite with two tenants in one process as a dedicated test.
- [Owner/operator split confuses self-hosters] → Host mode is opt-in, and single-tenant servers show exactly today's settings.
- [A solo maintainer running a free service] → Out of the binary's scope. Tracked as an operating decision before the control plane is built.
- [Size] → No new dependency expected (SMTP is in the standard library). Single-tenant memory is unchanged. Host memory scales with open tenants.

## Migration Plan

Phases ship as separate changes, each keeping single-tenant behaviour:
1. Tenant refactor
2. Outgoing email
3. Host mode with routing and lazy open
4. Shared scheduler
5. Limits
6. Lifecycle and operator interface

A self-hosted server never needs to migrate anything. Rollback of any phase is a revert, because no tenant data format changes.

## Open Questions

Settled while implementing (see notes.md):
- Registry: `<data>/host.db` with `tenants` and `due` tables.
- Defaults: idle close after 10 minutes and at most 500 open tenants, from a measured ~130 KiB of heap per open tenant and ~60 ms for a cold open with a sign-in.

## Data, size and interface impact

- **Data model:** none per tenant: no migration, no op field. Host mode adds `host.db` outside every tenant. The client keeps ops refused by a limit in one `meta` row (`heldOps`); no IndexedDB schema change.
- **Size:** no new dependency; the binary grows by about 0.2 MB (0.9 %). A self-hosted server's memory is unchanged.
- **Interface budget:** the only screen change is in Settings: on a hosted server some cards are hidden and one card ("Download your data") replaces them; no chrome row, task property, sidebar destination, scroll region or shortcut is added.
