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
- **No outgoing email.** Password resets are links an admin creates.
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
`main.go`'s wiring moves into `tenant.Open(dir, hostCfg) (*Tenant, error)`. It holds the store, the services, the notifier and the per-tenant HTTP handler. `Close()` stops its work and closes the database. A normal server calls it once. This is phase 1, shippable alone, with no behaviour change, verified by the existing test suite and `cli-smoke`.

Alternative considered: a `tenant_id` column in every table (row-level multi-tenancy). Rejected because it changes every query and the data model, breaks byte-compatibility with self-hosted data, and puts every tenant behind one writer.

### D2. Host mode: routing, lazy open, idle close
- **Routing.** With host mode on, a request's host name (`<tenant>.<host domain>`) selects the tenant from a host-level registry, a small SQLite database outside tenant directories.
- **Lazy open.** A tenant is opened on first request, which also runs its migrations.
- **Idle close.** An LRU closes tenants idle beyond a timeout, but never while a live event stream is attached.
- **Open-cost guard.** A per-host cap on open tenants bounds memory. When the cap is reached, the least recently used idle tenant closes first.

### D3. One scheduler for all tenants
Per-tenant goroutines (push every 30 s, retention, audit pruning, backups, webhooks) don't scale with thousands of tenants. Instead:
- **"Next due" index.** Each tenant writes its next due instant per job kind (earliest undelivered reminder, next backup, next retention pass, pending webhook delivery) into a host-level table whenever it changes.
- **One host scheduler.** It sleeps until the earliest entry, opens only those tenants (D2), runs the job through the same code paths as today, and records the next due time.
- **Single-tenant servers** keep their current loops, so self-hosted behaviour doesn't change.

Alternative considered: polling every tenant on an interval. Rejected because the cost grows with registered tenants, not due work.

### D4. Operator-level settings move to the host
On a host, SMTP, single sign-on, backup destinations, push subject, the MCP and AI switches and sign-up policy are operator concerns. Host mode reads them from host configuration and hides the corresponding owner panels in tenants. Tenant owners keep their tenant-level settings (members, invitations, their own policies). A single-tenant server is unchanged: the owner remains the operator.

### D5. Limits per tenant
These generalise the demo sandbox budgets into tenant limits:
- database size
- ops per hour and in total
- request rate
- import size
- number of members

Exceeding a limit refuses the write with a clear error and leaves sync otherwise working, as the demo budgets do today. Limits are host configuration, so later paid plans can be expressed as limit sets.

### D6. Outgoing email (phase 2)
SMTP with the standard library (`net/smtp` with STARTTLS or TLS), configured by optional `OPENTODO_SMTP_*` variables or owner settings with the password in the secrets directory, like the IMAP password. It enables verified self-service sign-up and self-service password reset. Sending is rate limited per address and per account. Failures are logged and audited, never retried in a tight loop. Without SMTP, nothing changes.

### D7. Tenant lifecycle and portability
The operator interface is authenticated with a host-level token, never reachable from a tenant's host name. It can:
- create a tenant (empty, or from a backup archive)
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

- Host-level registry location and schema details, settled in phase 3.
- Idle timeout and open-tenant cap defaults, settled by measurement in phase 3.
