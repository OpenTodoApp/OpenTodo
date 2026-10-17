# Design: sync-convergence

## D1 Refuse, don't clamp, for clients that can handle it
Clamping changes an op's timestamp on the server only, so the author's device holds a different clock for the same value and the two never agree again. Returning the clamped op would fix the server copy but still let a fast device stamp every later edit far ahead. Refusing with `clock_skew` and the server's time lets the device fix the cause: it adopts the offset, restarts its last timestamp from server time, re-stamps the refused ops (one new timestamp per original timestamp, order kept, the row's clock follows) and re-sends them under the same ids (they were never stored, so they are not duplicates). The rest of the batch is applied as usual.

An old client treats an unknown reason like `forbidden`: it forgets the field's clock and drops the edit. So the server refuses only when the request announces `features: ["clock_skew"]` (set on the Apply context by the sync route); everyone else gets the clamp. REST and other server writers stamp with the server clock and never hit either path. The client stops after three refusal rounds in one exchange (the outbox is kept and the status shows an error) instead of looping.

## D2 One server clock and a per-process device
`Service.ServerTS()`/`ServerTSAt(ms)` keep one `lastTS` behind a mutex in the sync service; every server writer goes through it (`ServerTSAt` lets a writer pass its own clock reading or a floor that beats a stored value). `ServerDevice` is `server:` plus eight hex characters chosen at start, so two processes on one database (or a restart with a clock step back) never tie either. `IsServerDevice` accepts the bare `server` of older ops; `ReservedDevice`, the `uploaded_at` rule, webhook `SourceFor` and the history label use it. Activity derivation (Go and web) groups by (ts, device) and never compares with `server`, so the parity fixture is unchanged.

## D3 Confirmed backfill pages
A replay page keeps the request's cursor, so the next request cannot tell a received page from a lost one. With `features: ["backfill_ack"]` the server records the page's end in `member_backfill_served` and returns it as `backfillSeq`; the next request's `backfillAck` equal to it moves `done_seq` there. A request without the echo is served the same page again. The side table (instead of `ALTER TABLE ADD COLUMN`, which SQLite cannot run idempotently) loses its row with the `member_backfills` row through a trigger. Old clients keep advancing on serve.

## D4 Account deletion
`Service.DeleteAccountData` (the auth hook) calls `unassignDeparted` for every project the account joined but did not own, authored by that project's owner, before removing the memberships. The changes are collected through the context (`WithAccountDeletion`) and handed to the observer after the auth transaction commits (`ObserveAccountDeletion`). The package function keeps working for the demo reset.

## D5 Migrations
`schema_migrations(name, applied_at)` is created by `Migrate` itself. Files at or below `user_version` that are not recorded and numbered above every recorded one were applied by a binary that did not record names: they are recorded (applied_at 0). One numbered below a recorded one is logged as an error with the file name; the server still starts (nothing can be inferred about what the file would do). The repo check compares added files with `origin/main` (CI checks out full history); it is skipped when the ref is missing.
