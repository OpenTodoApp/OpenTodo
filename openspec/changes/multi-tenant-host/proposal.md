# Proposal

## Why

OpenTodo asks every user to run a server, which keeps out most people who pay for Todoist or Things today. A hosted offering, free at first and paid later for hosting (never for features), would let them sign up and use the product like a commercial app. Two obvious shapes fail at that scale:
- **One process per account.** It updates fine (each database migrates in milliseconds), but idle processes cost about 20 MB each and run their own timers. Thousands of free accounts would be unaffordable.
- **One shared database for everyone.** It breaks isolation, the single-writer SQLite model and the "your server" promise.

A host that serves many tenants from one process, with one ordinary data directory per tenant, keeps per-tenant isolation and portability at the cost of a shared process. Because the project is AGPL with outside contributions, the hosted service must run the open code, so this capability belongs in the open binary.

This proposal records the agreed direction. It is deliberately **not scheduled before** the switcher work (named importers, comparison and switch-guide pages) and the parity features, and it has no specs or tasks yet.

## What Changes

- **A tenant is a data directory.** Everything a server builds around its data directory today becomes one tenant: database, lock, settings, secrets, push keys, notifier and per-tenant jobs. A normal server keeps exactly one tenant and behaves as before.
- **Outgoing email, optional.** An operator can configure an SMTP server, enabling verified self-service sign-up and self-service password reset. Useful to self-hosters too. Without it, nothing changes.
- **Host mode, optional.** One process serves many tenants:
  - each tenant is chosen by its host name
  - a tenant's database is opened on first use and closed when idle
  - migrations run when a tenant is opened
  - one shared scheduler drives reminders, backups and retention for all tenants from a small "next due" index, instead of a loop per tenant
- **Limits per tenant.** Database size, write budgets and request rates, reusing the demo sandbox machinery, so one tenant cannot degrade the others.
- **Tenant lifecycle.** Create, suspend, delete, export a tenant as a backup archive, and create a tenant from an archive. The same archive restores into a self-hosted server, so leaving the hosted service takes one download.
- **Out of the binary:** sign-up website, router and shard placement, replication to object storage, monitoring and billing live in a separate control-plane project that drives host mode through an authenticated operator interface.

## Out of scope

- The control plane itself, pricing, payments and legal documents (privacy policy, data processing agreement). They are tracked outside this repository.
- Any change to the op log format, sync protocol or data model of a tenant. A tenant's data directory stays byte-compatible with a self-hosted one.
- Paid features. Hosted and self-hosted run the same binary with the same features.
- Scheduling: this change waits until the importer, website and parity work is done. Phases 1 (tenant refactor) and 2 (outgoing email) may be split out and shipped earlier because they help self-hosters.

Advances a new ROADMAP.md item, "Hosted OpenTodo", to be added under Future ideas when this change is scheduled.

## Capabilities

### New Capabilities

- `multi-tenant-host`: host mode, tenant routing, lazy open and idle close, the shared scheduler, per-tenant limits, the tenant lifecycle and the operator interface the control plane uses.
- `outgoing-email`: optional SMTP configuration, verification and password-reset mail, sending limits and failure behaviour.

### Modified Capabilities

- `account-access`: self-service sign-up with email verification and self-service password reset, when outgoing email is configured.
- `self-hosting`: optional SMTP and host-mode variables (none mandatory), and the guarantee that a single-tenant server behaves as before.
- `backups`: a tenant export and import that are the same archive as `opentodo restore` uses, so hosted and self-hosted data move both ways.

## Impact

- **Code:** `cmd/opentodo/main.go` wiring becomes a tenant constructor, and services already take their database by injection. The data directory is referenced in 9 packages (`store`, `settings`, `push`, `backup`, `oidc`, `assistant`, `httpapi`, `config`, `cmd`), and about 40 package-level variables need a review for shared state. Owner-level settings that are operator concerns on a host (SMTP, single sign-on, backup destinations) need a host-level home.
- **Data:** none per tenant. Host mode adds a small host-level registry and "next due" index outside every tenant's database.
- **Environment:** only optional variables. A server without them is unchanged.
- **Size and memory:** no new dependency is expected for the host. SMTP uses the standard library. Memory in host mode scales with active tenants, not registered ones.
