# Design

## Context

Four independent fixes share one change because each is small and touches only server edges (plus the in-app reminder watcher and the webhook event list in Settings). None alters the op schema.

## Decisions

### D1. Reminders under a trashed project: skip, do not record, deliver late after restore

The push scheduler already re-reads the task through `sync.Get` for every due candidate. It now also walks the project chain: `task.project_id`, then each project's `parent_id`, through `sync.Get` in the reminder owner's view, stopping at an unknown project, a cycle (seen set) or a depth of 64. If any project on the chain has `deleted_at`, the reminder is skipped. Results are cached per tick.

Why ancestors: deleting a project re-parents its direct sub-projects (project-organization), but concurrent offline edits can still leave a live sub-project under a tombstoned parent. Cheap to cover.

Restore rule: a skipped reminder is **not** recorded as delivered or dismissed. When the project is restored, the next tick delivers it, once, even if its firing time passed while trashed. Alternatives considered:

- *Drop reminders that fell due while trashed.* Needs a server write on a trashed entity (a fake `dismissed_at`) or new state, and loses a reminder the user may want after an accidental delete.
- *Deliver late (chosen).* Matches the existing rules for a deleted task that is restored and for a server that was down at firing time, and matches the in-app watcher, which shows any fired, undismissed reminder. No new state, nothing to converge.

The in-app watcher (`web/src/lib/reminderWatcher.ts`) applies the same walk over the local `projects` table (`inTrashedProject`), so offline devices behave the same way. The service worker needs no change: the server never pushes a suppressed reminder.

Cost: suppressed candidates stay in the scheduler's scan every tick until restored or purged, exactly like reminders on deleted tasks today; purge removes them.

### D2. Pull byte budget

`sync.MaxPullBytes = 4 MiB`, an internal constant. Pull keeps reading in `seq` order; before appending an op that is not the caller's own, it stops when the page already holds at least one op and the summed `len(value)` would exceed the budget. The cursor is the last op served (own-device ops before it are skipped and passed), `hasMore = true`. Purge markers keep the existing "up to the page's last op" rule. The member history replay (`backfillPage`) uses the same budget and records `done_seq` at the last op served.

At least one op per page guarantees progress: a value larger than the budget (impossible today, values are at most 256 KB, but future-proof) travels alone. Only op values are counted; envelope overhead is bounded by the 1000-op limit. The protocol is unchanged: the web client already loops on `hasMore` (`web/src/lib/sync.ts`); the CLI does not pull ops; MCP reads materialized state; the SSE channel carries no ops; CalDAV's `ChangedSince` reads field names only.

### D3. CalDAV rows go with the purge

`purgeTx` deletes `caldav_resources` rows for every purged task target after removing its fields, inside the same transaction, guarded by "no `scope_fields` row remains for this task id" so a task id still living in another scope keeps its name. This covers single purge, project cascade, empty Trash and the retention job, which all run through `purgeTx`. `0024_caldav_orphans.sql` deletes rows whose task has no fields (idempotent).

### D4. Imports report one summary per job

Webhook event derivation skips changes whose origin is the import device (`importer.Device = "import"`), covering import and undo writes. The importer gets a summary observer (`SetSummaryObserver`), installed by `httpapi.New` when webhooks are wired, and calls it once when a job ends (done or failed, after the final state is stored) and once per successful undo. `webhook.ObserveImport` queues at most one delivery per subscribed webhook:

- events `import.completed` and `import.undone` join the closed catalogue (`webhook.Events`, `WebhookEvent`, Settings checkboxes);
- payload version 1, `source: "import"`, `data.import = {id, format, status, message?, totals, counts, project_ids}`, `changes: {}`; signing, retries, log, redelivery and the SSRF guard are unchanged because the delivery goes through the same queue;
- audience: the importing user with all touched project ids; each other member of a touched shared project with only the shared projects they belong to;
- project filter: matches when its project is in that receiver's `project_ids`.

Alternatives: per-subscriber coalescing windows of `task.created` (needs timers and changes delivery semantics for every writer), or keeping per-task events but rate-limiting (still unbounded). One summary event is explicit, bounded and documented. Trade-off: existing webhooks that relied on per-task events from imports must subscribe to the new event; CHANGELOG says so.

## Data model impact

No op field is added, renamed or removed. One migration (`0024_caldav_orphans.sql`) only deletes dead rows. No new table or column.

## Size and memory

No dependency. Binary grows by a few KB; web bundle by a few hundred bytes. Peak memory of a sync response is now bounded by about 4 MB of values plus envelope instead of up to 1000 x 256 KB.

## Risks

- A device on an old client that ignores `hasMore` would stop early; the shipped client loops, and `hasMore` existed since the first release.
- Late delivery after restore may surprise a user restoring a long-trashed project; documented in docs/reminders.md, and snooze/dismiss remain available.
