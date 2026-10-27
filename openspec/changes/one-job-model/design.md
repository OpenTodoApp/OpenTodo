# Design: one job model

## D1. The model

```go
type Job struct {
    Name  string
    Next  func(ctx) (at time.Time, ok bool, err error) // when it next has work; past = now
    Run   func(ctx)                                    // do the due work, return when done
    Check time.Duration                                // trust Next this long (default 30 s)
    Retry time.Duration                                // pause when still due after a run (default 30 s)
}
```

A tenant builds its job list once, when it opens (`tenant.Jobs`, file `internal/tenant/jobs.go`). Both runners use that list:

- **Self-hosted:** `jobs.Runner` runs it. Started by `StartJobs` in the process that holds the jobs lock.
- **Host:** the existing shared scheduler (`internal/host/scheduler.go`) uses it. Each job's `Name` is a kind in the host's "next due" index (the names are the host's current kinds, so existing index rows stay valid). `computeDue` becomes a loop over `Next`, and `runDue` becomes a loop over `Run`.

The demo and `!cfg.Demo` gating, and the owner switches, move into the job list and into each job's `Next`. The runners never check them.

| Job | `Next` | `Run` | Check | Retry |
|---|---|---|---|---|
| `reminders` | `push.NextDue` (earliest eligible firing) | `push.Tick` | 30 s | 30 s |
| `webhooks` | earliest of `webhook.NextDue` and `channels.NextDue` (the latter only while the owner switch is on) | up to 64 `ProcessDue` batches per queue | 30 s | 1 s |
| `calendars` | earliest of `calfeed` `NextFetch` (switch on) and `calsync.NextDue` | `calfeed.RunOnce`, `calsync.RunOnce` | 15 s | 30 s |
| `issues` | `issues` `NextPoll` (switch on) | `issues.RunOnce` | 30 s | 30 s |
| `digest` | `digest.NextDue` (email configured, someone opted in) | `digest.Tick` | 30 s | 30 s |
| `rules` | `rules.NextDue` (now while events wait, else the next minute boundary while a time rule exists) | `rules.RunOnce` (time triggers, then the queue) | 30 s | 30 s |
| `backup` | `backup.NextRun` | `backup.RunIfDue` | 30 s | 30 s |
| `housekeeping` | earliest retention deadline (see D4) and the upkeep time | every prune, sweep and optimize | 30 s | 1 h |
| `email` (self-hosted, mailbox configured) | last poll + `OPENTODO_EMAIL_POLL_SECONDS` | one IMAP poll | — | interval |
| `demo` (demo instances) | pending vacuum, last cleanup + 5 min, the next 03:00 UTC after the last reset | vacuum, reset, cleanup | — | 30 s |
| `writes` (self-hosted only) | last probe + 1 s | `PRAGMA data_version`; a change counts as a data change (D3) | — | — |

## D2. The self-hosted runner

`Runner.Run` keeps one slot per job: the due time, the next check time, a retry floor, and whether the job is running. Each turn it:

1. asks `Next` for every idle job that was woken, or whose check time has passed;
2. starts every idle job whose due time and retry floor have passed, each in its own goroutine;
3. sleeps until the earliest of: an idle job's due time (not before its retry floor), its check time, or the end of the debounce window. It wakes early on `Wake`, `Changed`, or a finished run.

Rules:

- **No overlap, no head-of-line blocking.** A job never runs twice at once. Jobs run independently: a backup that uploads for ten minutes does not delay a webhook delivery. This matches today's separate loops.
- **After a run** the runner asks `Next` again. When the job is still due (a transient failure, or a backlog larger than one run takes), it waits its `Retry` pause, even if woken, so it never spins. The webhook job's 1 s retry keeps a large backlog draining at today's pace (64 × 4 deliveries per run, then one second).
- **`Next` errors** are logged, and the job is asked again after its retry pause.
- **Check interval.** A job's `Next` is trusted for at most its check interval. This is the backstop for work made due by a path that sends no wake-up, and it bounds the effect of a wall-clock jump: timers run on the monotonic clock, while due times are wall-clock times.
- **Shutdown.** `Run` returns when its context ends, after the runs in progress have returned. `StartJobs`' stop function waits for it, so "Background jobs stop before the database closes" keeps holding, with the same 20 s bound in `main`.

The runner takes a `jobs.Clock` (`Now`, `After`). The timing tests drive it with a fake clock, in lockstep through an unexported per-turn hook.

## D3. Wake-ups instead of polling

`jobs.Signal` sits on the services set. Services call it, and the runner that leads the jobs is attached to it.

- **`Wake(name)` asks that job now.** Callers:
  - webhook deliveries queued by the commit observer, an import summary, a redelivery, or a rule's webhook action;
  - a webhook turned on again;
  - a channel message queued;
  - a channel turned on, or the channels owner switch turned on;
  - rule events queued by the observer;
  - a rule changed (its watermark starts);
  - backup settings saved.
- **`Changed()` asks every job again after a 1 s debounce.** The commit observer calls it after every committed batch, for example a new reminder, a moved task with a calendar event, or a trashed item.
- **`Count()`** counts both kinds of wake-up. `Upkeep` uses it.

Where the wake-ups go:

- **Self-hosted leader:** `Wake` and `Changed` go to the runner.
- **Host:** both go to the existing `markDirty` (refresh that tenant's entries after 1 s), as `Hosted.Changed` did.
- **A process that does not lead the jobs:** both are dropped, because nothing is attached.

**Writes from another process.** During a rolling update (or with two processes on one volume), the process that serves a write may not be the one that runs the jobs. Today the leader still finds such work through its fixed polls. The `writes` job replaces that: once a second it reads `PRAGMA data_version` on the leader's writer connection. The value changes only when another connection, here another process, has committed. A change counts as `Changed()`, so the leader sees another process's write within about 2 s (1 s probe, 1 s debounce). That is the same as or better than today for everything except a brand-new webhook delivery, which was at most 1 s and is now at most about 2 s while two processes overlap. The query reads a page header and touches no table.

## D4. Housekeeping: deadlines and upkeep

There are two kinds of housekeeping.

**Deadline work.** It is due exactly when the oldest row passes its retention:

- Trash retention: `sync.NextRetention`;
- the audit log (owner's retention): `audit.NextPrune`;
- expired sign-ups: `auth.NextSignupExpiry`;
- the webhook and channel delivery logs (30 days): `NextPrune`;
- read notifications (90 days): new `notify.NextSweep`, the oldest read notification's `created_at` + 90 days.

**Upkeep.** This work has no deadline and is only needed after something changed:

- `PRAGMA optimize`;
- trimming the delivery logs to their per-target size limit (the same `Prune` statement);
- pruning the rule run log;
- sweeping secrets whose connection was deleted (issue tokens, calendar sync secrets, channel secrets).

`jobs.Upkeep` makes upkeep due one hour after its last run, but only once the tenant's `Signal` counted a wake-up or a change since then. An idle tenant has no upkeep due, so a host never opens a closed, idle tenant for it. That keeps the "Thousands of idle tenants" scenario true. A tenant that was busy before it closed gets at most one upkeep open an hour later. One `housekeeping` run does all of it, deadline and upkeep together, as the host already does.

Retry is 1 hour. A deadline that is still past after a run (an item the purge cannot remove) waits the old hourly pace and never loops every 30 s.

## D5. Timing guarantees

These are maximum delays on a self-hosted server between work becoming due and the job starting, with the jobs leader running. "At the due time" means within the runner's timer resolution (milliseconds). Times marked "unwired" apply only to a change made through a path that sends no wake-up, found by the check interval.

| Work | Before (fixed tickers) | After |
|---|---|---|
| Webhook delivery, new | ≤ 1 s poll; immediate when the worker was woken | immediate (wake on enqueue); another process's write ≤ ~2 s |
| Webhook delivery, retry | ≤ 1 s after `next_attempt_at` | at `next_attempt_at` |
| Webhook turned on again with queued deliveries | ≤ 1 s | immediate (wake); unwired ≤ 30 s |
| Notification channel message | immediate (wake), retries ≤ 1 s late | immediate (wake), retries at their time |
| Reminder push | ≤ 30 s after the firing time | at the firing time when the reminder was saved ≥ 1 s before it, otherwise ≤ 1 s after saving; another process ≤ ~2 s; a failed push retried after 30 s (unchanged) |
| Weekly digest | ≤ 5 min after the hour; retries per `RetryEvery` | at the hour; retries per `RetryEvery` (unchanged); an opt-in change seen ≤ 30 s |
| Rules, event triggers | immediate (wake); ≤ 5 s fallback drain | immediate (wake); another process ≤ ~2 s |
| Rules, time triggers | ≤ 1 min (minute ticker started at boot) | at the minute boundary after the occurrence |
| Calendar subscription fetch | ≤ 30 s after `next_fetch_at` | at `next_fetch_at`; new subscriptions are fetched inline by their route, unwired ≤ 15 s |
| Calendar sync cycle | ≤ 15 s after due; a task change: 20 s debounce + ≤ 15 s | at due; a task change: 20 s debounce + ≤ 1 s |
| Issue connection poll | ≤ 30 s after `next_poll_at` | at `next_poll_at`; unwired ≤ 30 s |
| Scheduled backup | at the time (≤ 1 min after a clock jump); a run missed while stopped: 10 s after start | at the time (≤ 30 s after a clock jump); a missed run: at start |
| Audit log prune | hourly, and at start | when the oldest event passes the retention (≤ 30 s after a retention change) |
| Expired sign-ups | hourly | at expiry |
| Trash retention | daily, and at start | when the oldest trashed item passes the retention |
| Read notifications (90 days) | daily | when the oldest read notification passes 90 days (≤ 30 s after it is read) |
| Delivery logs (30 days) | hourly | when the oldest entry passes 30 days |
| Upkeep (optimize, log size limits, rule run log, orphaned secrets) | hourly or daily, also when idle | hourly after a change; never while idle |
| Email capture poll | every `OPENTODO_EMAIL_POLL_SECONDS` | unchanged |
| Demo sandbox cleanup / nightly reset | every 5 min / 03:00 UTC | unchanged |

**Host.** The host keeps its own guarantees: due work runs when the shared scheduler passes its index entry, and open tenants are refreshed at least every 30 s and about 1 s after a change. The only timing change is the per-job retry pause:

- webhooks: 1 s instead of 30 s, so a backlog drains faster;
- housekeeping: 1 h instead of 30 s;
- everything else: 30 s, as before.

## D6. Jobs leader

Nothing about leadership changes:

- `runJobsWhenLeader` calls `StartJobs` only under `store.LockJobs`, and the host scheduler starts the same way.
- `StartJobs` attaches the runner to the tenant's `Signal`, and its stop function detaches it before waiting.
- A process that does not hold the lock never attaches, so its wake-ups are dropped, and the leader finds that work through the `writes` probe.
- When the old leader exits, the new one's `StartJobs` starts a runner that asks every job at its first turn, so nothing due is lost across the hand-over.

A test opens two tenants on one data directory (two "processes"), starts the jobs in one only, queues a webhook delivery through the other, and checks that the leader delivers it exactly once within a few seconds while the other never sends.

## Data model and size

No migration, op field, route or environment variable. One new query (`notify.NextSweep`) on the existing notifications table. No dependency.

The binary shrinks slightly: 14 loops are removed and about 250 lines added. At runtime, one runner goroutine plus one per running job replaces 14 long-lived goroutines and their tickers. An idle self-hosted server no longer queries the webhook and channel queues every second. It asks each job for its next due time about every 30 s, and probes `data_version` once a second.
