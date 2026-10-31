# Design

## Context

- `notes_doc` is a `kDoc` field (`internal/sync/ops.go`, `MaxDocBytes` = 256 KB) on `task` and `project`, listed in `sync.DocFields`. It is an ordinary last-writer-wins register on the server; the server never decodes it. Each value is a full Yjs state. `description` is its Markdown projection, written in the same batch with the same `ts` (docs/sync.md "Mergeable documents").
- Clients merge every `notes_doc` op they apply into their local document, winning or losing, and republish the union when it holds something the stored winner lacks (rule 1, "merge and republish").
- The server keeps each op in `ops` (`seq`, `user_id`, `op_id`, `entity`, `entity_id`, `field`, `value`, `ts`, `device`, `received_at`) with its scope in `op_scopes`, and the current winner of each field per scope in `scope_fields` (`ts`, `device`, value). `Pull` returns ops with `seq` greater than the cursor, from every scope the caller can see.
- `PurgeSupersededContent` (`internal/sync/e2ee.go`) already deletes non-winning ops of chosen fields in one personal scope, matching the winner on `(scope, entity, entity_id, field, ts, device)`, with `secure_delete` and a full `VACUUM`.
- Background work is a `jobs.Job` in `internal/tenant/jobs.go`. `jobs.Upkeep` makes work due only after a change, so an idle tenant has nothing due and a host never opens one for it.
- `internal/store.Open` sets `journal_mode(WAL)`, `busy_timeout(5000)`, `foreign_keys(ON)`, `synchronous(NORMAL)`; it never sets `auto_vacuum`, so every existing database is `auto_vacuum = NONE` (0). There is one writer connection and a query-only reader pool.
- History (`GET /api/v1/{tasks|projects}/{id}/history`) leaves `notes_doc` out and shows `description` revisions; it lists ops that lost (`lost`).

## Decisions

**D1. What is deleted.** An op is deleted by compaction when all of these hold:

1. its `entity.field` is in `sync.DocFields` (today `task.notes_doc`, `project.notes_doc`; `note.notes_doc` when `notes-overview` lands), or it is the `description` of such an entity and D3 thins it;
2. it is **superseded**: no `scope_fields` row of its scope has the same `(entity, entity_id, field, ts, device)`;
3. the server **received** it more than **30 days** ago (`received_at`, the server's clock, never the author's `ts`).

Every scope is covered: personal scopes and shared project scopes alike. The winner of a field is never deleted, whatever its age. No other field is touched.

**D2. Why deleting a superseded full-state document is safe (convergence).**

- *The register.* Under last-writer-wins a superseded op can never win again: the winner only moves to a greater `(ts, device)`. Every replica that applies the remaining ops reaches the same winner, because the winner's op stays in the log. A device that never saw a deleted op is in the same state as a device that saw it and let the winner beat it. That is the argument `PurgeSupersededContent` already relies on.
- *The merge.* For documents, a losing op can still carry content: device A saves `DA`, device B, which never merged `DA`, saves `DB` with a later clock. `DB` wins, but A's text is only in `DA`. The text reaches the winner only when some device merges `DA` and republishes the union (rule 1). That happens in the first exchange of any device that pulls `DA`: B itself pulls `DA` in the same exchange that pushed `DB`, A merges `DB` into its own copy when it next syncs, and every other device of every member merges both on its next pull.
- *The window.* So a superseded document is safe to delete once some device has merged it. The server cannot check that (it never decodes documents, and on encrypted accounts it cannot). It also does not keep per-device cursors durably, and a device that never returns would block compaction forever. The 30-day window is the practical bound: the op stays pullable for 30 days after the server got it, long enough for any device that is used at all to pull and merge it. The window counts from **receipt**, so a device that edited offline for months and then pushed gets the full 30 days from its push, not from its typing.
- *The one case it does not cover.* The text is lost only if the device that pushed the superseded document vanished right after pushing, the device that superseded it also vanished before pulling, and no other device of any member synced for 30 days. Then nobody alive ever held the text after the original device. If the author's device returns after the window, it still holds its local document, merges the winner into it and republishes the union, so its text comes back.
- *Re-sent ops.* An op deleted on the server can be re-sent by a device that never got the acknowledgement. `INSERT OR IGNORE` then stores it again with a new `received_at`; it loses to the winner as before, other devices merge it (it adds nothing if the winner already holds it), and a later run deletes it again. This is the same as after an encryption purge.
- *Pairs.* `description` and `notes_doc` of one save share `ts`. The fold-back rule (rule 3) compares the clocks of the **winners** only, so deleting superseded descriptions or documents never changes what a device folds.

Alternative considered: delete only ops below the lowest cursor of every device that can see the scope. Rejected: the server keeps no durable per-device cursor, a lost or wiped device would block compaction forever, and a cursor says the device pulled the op, not that it merged it before being wiped.

**D3. Thinning note revisions to one per day.** `description` is the readable revision of a note; History shows it. Superseded `description` ops of entities with a document field, received more than 30 days ago, are thinned per `(scope, entity, entity_id)` and per calendar day of their `ts` in **UTC**: the op with the greatest `(ts, device)` of each day is kept, the others are deleted. The winner is always kept and counts as its day's revision.

UTC, not the server's local day: the container usually runs in UTC anyway, a host serves people in every time zone, the server has no single "local" day that would be right for everyone, and UTC gives the same result on every server and in tests. A person in Tokyo sees the kept revision of a "day" end at 09:00 local; for history older than a month that is good enough, and the History tab's one-per-day line says the day is in UTC.

Last of the day (not first): it is the state the person left the note in at the end of that day, the one they would most likely want back.

**D4. Running in small steps.** The job's run:

1. finds candidates on the **reader** pool in `seq` order after a stored high-water mark, 1,000 at a time;
2. deletes each chunk on the **writer** in its own short transaction with the conditions of D1 repeated in the `DELETE` (`NOT EXISTS` winner, `received_at` cutoff), so an op that became the winner meanwhile, or a candidate found by a stale read, is never deleted;
3. deletes the matching `op_scopes` rows in the same transaction;
4. stops after about 20 seconds of work and reports "more to do", so the job is due again after its retry pause (`Retry: time.Minute`), and resumes from the high-water mark.

A chunk transaction holds the writer for milliseconds, so pushes and REST writes wait at most that. `secure_delete` stays off: compaction saves space, it is not erasure (see the proposal's out of scope).

**D5. Schedule.** A new `jobs.Compaction` (`"compaction"`) job, not a step of housekeeping, so a long run never delays the Trash retention or delivery-log pruning. Its `Next` comes from a `jobs.Upkeep` with `Every = 24h`: due a day after the last full run, and only once something changed since. The first run after start-up is due one hour after start, so a restart loop does not compact repeatedly. Runs only on the jobs leader (self-hosted) or the host scheduler. The "more to do" case of D4 uses `Retry`.

**D6. Incremental vacuum and the one-time conversion.**

- After a run that deleted anything, the job runs `PRAGMA incremental_vacuum(2000)` (about 8 MB with 4 KB pages) in a loop, one step per short write, until `freelist_count` is 0 or the run's time budget is spent; the rest is reclaimed next time. Then `PRAGMA wal_checkpoint(PASSIVE)`.
- `incremental_vacuum` does nothing unless `auto_vacuum = INCREMENTAL` (2). The mode can be set freely only before the first table exists; afterwards it takes effect only through a full `VACUUM`.
- **New databases:** `store.Open` runs `PRAGMA auto_vacuum = INCREMENTAL` before the first migration when the file is new (`user_version` 0 and no tables). A test asserts the mode of a fresh database.
- **Existing databases:** the compaction job converts them once: `PRAGMA auto_vacuum = INCREMENTAL; VACUUM;` on the writer. It does so only:
  - when the database has been **quiet** (no op received for 10 minutes); if no quiet moment came within 7 days of the first attempt, at the next run anyway;
  - when the data directory's file system has free space of at least the database size plus 10 % (a full `VACUUM` writes a complete copy; `syscall.Statfs` on Unix, skipped with a warning where unavailable); otherwise it logs a warning once a day, shows it on the storage card, and compacts without reclaiming (the freed pages are reused by new writes, so the file stops growing even without the conversion).
- **Cost note (for the release notes and docs/backups.md):** the conversion rewrites the whole file once. It takes about as long as a backup's `VACUUM INTO` (seconds for a 50 MB database on an SSD, about a minute for 500 MB on a Raspberry Pi's SD card) and needs that much free disk for the duration. Writes wait meanwhile: a sync push waits up to `busy_timeout` (5 s) and then fails as `busy`; the client retries with its backoff and nothing is lost. Reads continue (WAL). It happens once per database.
- Before the conversion has run, compaction still deletes ops; SQLite reuses the free pages, so the file stops growing, but it does not shrink.

Alternative: convert at start-up. Rejected: start-up must stay under the 2 s health budget (`performance-10k`) and rolling updates start the new process while the old one serves.
Alternative: a SQL migration. Rejected: `VACUUM` cannot run inside the migration's transaction, and a migration cannot wait for a quiet moment.

**D7. Reporting.** Each run produces `{at, opsRemoved, valueBytesRemoved, fileBytesReclaimed, more, converted}`:

- **log:** one `Info` line `notes compaction` with those fields when anything was removed (`Debug` otherwise), and a `Warn` for the disk-space case;
- **stored:** the last completed run under the `settings` key `compaction.last` (JSON), plus the conversion state (`pending`, `waiting_for_quiet`, `no_space`, `done`);
- **shown:** `GET /api/v1/settings/storage` (owner only, `ownerOnly("see storage")` with `.demoDenied()` and a `demo.go` deny-list entry) returns the database file size, the free pages inside it in bytes, the WAL size, the stored report and the conversion state. The **Database storage** card on Settings › Server › Backups shows "Database 48 MB, 3 MB free inside the file · Last compacted 31 Oct, 12,400 old note versions removed, 210 MB reclaimed" and, when the conversion waits for disk space, one line saying how much is needed. It reads the route when opened; offline it says it needs a connection.

`valueBytesRemoved` is the summed `length(value)` of deleted ops (cheap and exact for what the log held); `fileBytesReclaimed` is the file size before minus after the incremental vacuum.

**D8. Interactions.**

- **Cursors and paging:** `seq` is never reused, so holes in the sequence are harmless; `Pull` is "`seq` > cursor" and its page budget counts only what it serves. A device that pulls after compaction simply receives fewer ops.
- **Purge and purge markers:** compaction is not a purge. The entity stays, no `purges` marker is written, devices are not told anything and need nothing.
- **Encryption purge (`PurgeSupersededContent`):** both delete only superseded ops; they commute. On an encrypted account the encryption purge removes plaintext history at once; compaction later removes superseded ciphertext. Neither decodes a value.
- **Catch-up for a new member (`member_backfills`):** the replay serves the project's ops below the device's cursor; after compaction there are fewer to replay, and the winners are among them.
- **History and activity:** History lists the remaining ops (`trash-and-history` MODIFIED); the History tab shows one muted line above the first note revision older than 30 days, a client rule from the change set's time, so the route is unchanged. The project activity feed (`internal/activity`, derived from ops) shows at most one "edited the note" event per day for edits older than 30 days; the derivation is unchanged, so the shared fixture still matches.
- **Backups:** a backup (`VACUUM INTO`) taken after compaction is smaller. Earlier backups keep the history they had; that is stated in docs/backups.md.
- **Restore and log generation:** a restored database is compacted by the next run like any other (its ops' `received_at` came with it). Devices re-seed after a restore by re-emitting their fields with their stored clocks; nothing in the re-seed depends on superseded ops.
- **Demo mode:** sandboxes live less than a day, so nothing reaches the 30-day window; the job is registered anyway (no outbound request) and finds nothing. The demo's nightly reset keeps its own `VACUUM`.
- **Host mode:** the job is per tenant, scheduled by the host's one scheduler like every other tenant job; `jobs.Upkeep` means an idle tenant is never opened for it. The host's per-tenant limits (`internal/host/limits.go`) need two adjustments: the storage limit already counts used pages (`page_count - freelist_count`), so space freed by compaction counts at once, even before any vacuum; the operation-count limit keeps its total in memory, seeded once from `COUNT(*) FROM ops`, so the sync service's `Quota` gains an optional `Removed(n int)` that compaction calls after each chunk (the total would otherwise stay too high until the tenant reopens). The one-time conversion of a tenant runs under the scheduler like any other job; tenants convert one after another because each runs it only when quiet and only on its own job.
- **Rolling updates:** only the jobs leader runs it; the other process keeps serving reads and writes, which wait on the writer as described in D4 and D6.
- **Offline devices:** nothing changes for them. A device offline for longer than 30 days still converges: it pushes its outbox, pulls the winners, merges, and republishes the union if its local document holds something the winner lacks.

## Data model impact

No op schema change and no op field renamed. One `settings` key (`compaction.last`, JSON) and the database's `auto_vacuum` mode. Additive and invisible to clients.

## Size and memory

No dependency. Binary growth negligible. The job reads candidates 1,000 at a time (ids and lengths only), so its memory is a few hundred KB. The full `VACUUM` of the one-time conversion uses SQLite's page cache, as a backup does. Image size unchanged.

## Interface budget

One card on an existing settings page (Server › Backups): no chrome row, no sidebar destination, no new scroll region, no shortcut. The History tab gains one muted line above the first note revision older than 30 days, inside its existing list.

## Open questions

- **The 30-day window** is a constant, not a setting (the owner's number). If self-hosters with very long-offline devices ask for a longer one, an optional `OPENTODO_NOTES_HISTORY_DAYS` could be added later without breaking anything. Default chosen: no setting.
- **UTC day for thinning** (D3) rather than each user's own day start. Default chosen: UTC; a per-user day would need the user's time zone on the server, which it does not keep.
