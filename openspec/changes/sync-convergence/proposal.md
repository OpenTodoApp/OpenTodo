# Sync convergence: clock skew, server clock, backfill confirmation, departures, due values, migrations

## Why

An audit of the sync core found ways devices or the server stop converging, or lose work silently:

- **Clock skew (CORE-2, DATA-2).** The server clamps an op stamped more than five minutes ahead to now + 5 min but never tells the device, which keeps its own far-future timestamp. A device whose clock ran an hour fast therefore keeps winning locally against later edits from other devices: server and device diverge permanently. The client also never resets its clock offset once the clock is right again, and its persisted clock seed stays in the future.
- **Account deletion (CORE-9).** Deleting an account removes its memberships but does not unassign its tasks in projects other people own, so those tasks keep a ghost assignee (task-assignment "Unassign on departure").
- **Post-commit effects (CORE-10).** After a batch commits, observers (webhooks) and notification sinks run with the request's context; if the client disconnects, their reads and writes fail and the notification is lost.
- **Backfill progress (CORE-11).** A page of a joined project's history is marked done when it is served, so a page lost in transit is never sent again.
- **Server clocks (CORE-13).** REST, assistant tools, push, importer, email and membership each kept their own clock, all writing as device `server`: two of them writing one field in the same millisecond tie on (ts, device), and the second write is dropped.
- **Due values (CORE-14).** `due` accepts `2026-13-99`, `2026-02-31` and `99:99`, which break recurrence completion and reminders.
- **Migrations (CORE-12).** The runner skips every file numbered at or below the database's version, so a migration merged after a higher-numbered one never runs, silently.

## What Changes

- **Clock skew protocol.** A device that sends `features: ["clock_skew"]` gets ops stamped more than five minutes ahead refused with reason `clock_skew` and the server's time; it corrects its clock, re-stamps those ops (same ids) and re-sends them in the same exchange, so no edit is lost. Clients that do not announce the feature (older apps would drop an op refused for an unknown reason) keep the clamping. The client clock resets its offset when the skew is within two seconds and brings a seed far ahead of the server back to server time.
- **One server clock.** `sync.Service.ServerTS()` is the one strictly increasing clock for every server-side writer, and the server writes as `server:<boot id>`. Every check of the server's device accepts `server` and `server:` (reserved devices, `uploaded_at`, webhook source, history label).
- **Confirmed backfill pages.** A device that sends `features: ["backfill_ack"]` gets `backfillSeq` with each replay page and echoes it as `backfillAck`; progress advances only on the echo, so a lost page is served again. Older clients keep the previous behaviour.
- **Account deletion** unassigns the account's tasks in other owners' projects inside the deletion transaction (server ops authored by the project's owner) and tells observers after commit.
- **Post-commit effects** use `context.WithoutCancel`.
- **Due values** must be real dates and clock times (00:00–23:59).
- **Migrations.** Applied file names are recorded in `schema_migrations` (backfilled for existing databases); a file numbered below an applied one that never ran is logged as an error at startup. `scripts/repo-checks.test.mjs` fails a branch that adds a migration not numbered above every migration on `origin/main`.

## Capabilities

- `offline-first-sync`: Clock safety (modified); one server clock; post-commit effects; valid due values (added).
- `project-sharing`: confirmed history replay (added).
- `task-assignment`: Unassign on departure covers account deletion (modified).
- `self-hosting`: Schema migrations record applied files (modified).

## Impact

- Wire format: additive request fields `features`, `backfillAck`; additive response field `backfillSeq`; rejection field `serverTime`; new rejection reason `clock_skew` (only for clients that ask for it).
- New ops from the server carry device `server:<boot id>` instead of `server` (webhook `source` stays `server`).
- Migration `0036_backfill_confirm.sql` (side table `member_backfill_served` plus a cleanup trigger) and the `schema_migrations` table, created at startup.
- A `due` with an impossible date or time is now refused (400 `invalid_op` on sync, `invalid_input` on REST).
- No new dependency, environment variable or setting; binary and bundle size change negligibly (a few hundred bytes of client code).
