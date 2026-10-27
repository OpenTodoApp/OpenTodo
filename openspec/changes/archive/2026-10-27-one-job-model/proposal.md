# One job model for self-hosted and hosted servers

## Why

The server describes its background work twice (KISS/DRY audit, item G1):

- A self-hosted server's `tenant.StartJobs` starts 14 loops, each with its own fixed ticker: webhook and notification-channel queues poll every second, reminders every 30 seconds, calendar feeds and issue connections every 30 seconds, calendar sync every 15 seconds, digests and the demo cleanup every 5 minutes, rules drain every 5 seconds and tick every minute, audit and delivery logs prune hourly, Trash retention, notification sweeps and the database optimizer run daily, and the backup scheduler has its own timer loop.
- A host (`internal/host`) runs the same services through a second path. Its shared scheduler asks each tenant when its work is next due (`NextDue`, `NextPrune`, `NextRun`, ...) and calls the inner pieces (`Tick`, `ProcessDue`, `RunOnce`, `Prune`) itself.

Each service therefore has two entry points and two descriptions of its cadence. Adding a job means editing the service's `Run`, `StartJobs` and the host scheduler, and the copies drift. One example is the demo gating, which lives in `StartJobs` and is re-derived on the host. The fixed tickers also cost latency and work: a reminder can be pushed up to 30 seconds late, a digest up to 5 minutes late, and an idle server still queries its webhook queue every second.

## What Changes

- A new package `internal/jobs` defines one model:
  - `Job{Name, Next, Run}`: when the job is next due, and how to run the due work.
  - `Signal`: services report "this job may have work now" (a delivery was queued) and "data changed".
  - `Upkeep`: maintenance that is only needed after something changed.
  - `Runner`: the self-hosted runner. It sleeps until the earliest due time and wakes at once when a service reports new work.
- Each tenant builds its job list once (`tenant.Jobs`). A self-hosted server runs that list with `Runner`. A host writes the same `Next` times into its index and calls the same `Run` functions; its pass structure, index and limits are unchanged.
- The per-service loops are removed: the `Run` methods of push, digest, demo, email, calendar feeds, issues, calendar sync, webhooks, notification channels and rules; the audit pruner, the notification sweeper, the retention loop, the optimizer loop and the backup scheduler's loop; and the `deliveryq.Loop` and `poll.Every` helpers. The services keep their `Next`/`Run` pieces.
- Timing becomes due-time based. design.md has the guarantees per job. No user-visible delay gets longer, and several get shorter:
  - Reminders are pushed at their firing time instead of up to 30 s late.
  - Digests go out at the hour instead of up to 5 minutes late.
  - Calendar fetches, issue polls and webhook retries happen at their due time instead of on the next tick.
  - Prunes happen when data passes its retention, instead of hourly or daily.
- Upkeep that is not tied to a deadline (database statistics, trimming delivery logs to their size limit, sweeping orphaned secrets, pruning the rule run log) runs hourly after a change and never on an idle server. Today some of it runs hourly and some daily.
- A self-hosted server that runs the jobs notices writes made by another process on the same data directory (a rolling update) within about two seconds, through SQLite's `data_version`.
- The jobs leader is unchanged: only the process holding the jobs lock runs the `Runner` or the host scheduler. Wake-ups in any other process are dropped.

No new dependency, environment variable, route, op field or migration. Not **BREAKING**.

## Capabilities

- `self-hosting`: background jobs run when their work is due (ADDED).
- `multi-tenant-host`: the host runs the same jobs as a self-hosted server (MODIFIED "Background work scales with due work").
- `audit-log`: pruning at the retention deadline (MODIFIED "Retention and pruning").
- `trash-and-history`: retention purge at the deadline (MODIFIED "Automatic purge after retention").
- `task-assignment`: read notifications removed when they pass 90 days (MODIFIED "Read notifications are removed after 90 days").

## Out of scope

- The host's own pass structure (index, tenants per pass, opening limits), and how it learns about writes served by another host process.
- Merging the webhook and channel queues further (done in G2), and the remaining audit items (G3 and later).
- New user-facing settings for any cadence.

ROADMAP: no product item. This is the wave 4 refactoring track (audit `kiss-dry` G1).
