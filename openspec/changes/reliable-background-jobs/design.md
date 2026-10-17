# Design: reliable background jobs

## Shutdown

`StartJobs(ctx, demoSignal) (stop func())` derives a cancellable context and runs every job through a `spawn` helper counted by a `sync.WaitGroup`. `stop` cancels, waits, then calls `backup.Service.Stop`. The backup service counts its own goroutines (scheduler loop, restore housekeeping, `StartRun`) because a web-started run also happens in a process that does not lead the jobs; its `Stop` cancels a lifetime context that `StartRun` hooks with `context.AfterFunc`, so a manual run is cancelled at shutdown (recorded as failed with `WithoutCancel`, as before) instead of outliving the database. `Tenant.Close` calls `Backups.Stop` before closing the database, so hosts and non-leaders are covered too.

`main` waits for `stop` at most 20 s (`jobsStopTimeout`), longer than the 10 s cap of a webhook delivery or a push; past that it logs and closes anyway. `runJobsWhenLeader` now calls `start` under its mutex so `started()` returning true implies the stop function is set.

Outcome writes after a send use `context.WithoutCancel`: `digest` (`MarkSent`, `MarkOutcome`, `Disable` after `mail.Send`) and `push.recordDelivered`. The push sending loop itself is unchanged (another change touches it).

## Backup space and temp files

Estimate: snapshot = database + WAL (an upper bound for `VACUUM INTO`); archive = snapshot + attachments + extra files + 1 KiB per entry (uncompressed worst case). Where the archive is staged on the data directory's filesystem (remote destinations, or a local folder on the same device, compared by `st_dev`), both are checked together; otherwise each on its own filesystem. `ensureSpace` (shared with restores) adds the 64 MiB margin and never fails where free space is unknown (non-Unix).

The sweep at `Start` removes regular files named `snapshot-*` and `opentodo-*` in `<data>/tmp` and `.tmp-opentodo-*` in the local destination. `Start` runs only in the process holding the jobs lock, and the lock is released only when the previous leader exits, so no run of another process owns those files. `tmp/restore` (staged web restores) keeps its own sweep.

Writing the local archive in place: `os.CreateTemp(dir, ".tmp-<name>-*")`, `Sync`, `Rename`; `List` already skips dot files.

## Restore bounds

`Stage` checks `sum(manifest sizes)` (rejecting negative or overflowing sizes) against free space in the staging directory before reading entries, compares each listed entry's tar header size with the manifest, and copies with `io.CopyN(want.Size)`. Unlisted entries are skipped by the tar reader without being written.

## IMAP without UIDPLUS

`UID EXPUNGE` is the only expunge. Without UIDPLUS the messages stay flagged `\Seen \Deleted`; the poller searches `UNSEEN`, so they are never handled twice. The alternative, `CLOSE` after flagging, also expunges every `\Deleted` message and was rejected for the same reason.

## Reminder scan

Two options: filter completed/deleted tasks in SQL, or record dismissal. A task may be materialized in several scopes (personal and shared) and `sync.Get` picks the copy by access rank, so an SQL join on `scope_fields` could see a stale copy in a scope the user no longer reads; dismissing via a server op reuses the same visibility rules and is one write per reminder, once. Only completed tasks are dismissed: the Trash requirement says a deleted task's reminder must come back on restore, and purging from the Trash removes it. Dismissal value = now (≥ fire_at), timestamp at least one past the stored one (same rule as `delivered_at`). A later fire time (snooze, recurrence, edited due) makes it fire again because a dismissal older than `fire_at` belongs to an earlier firing.

Pages of 500 candidates ordered by `(fire_at, scope_id, entity_id)` with a keyset continuation; dismissals during the scan do not shift pages.

## Large archives

Multipart only when the body is an `io.ReaderAt` (the archive file) and above 100 MiB, so ordinary archives keep the single signed PUT. Each part is read twice (hash, then send) through an `io.NewSectionReader`, keeping memory constant; `UNSIGNED-PAYLOAD` was rejected to keep every request's integrity covered by the signature, as today. `CompleteMultipartUpload` can answer 200 with an `<Error>` body, which is checked. A failure aborts with `WithoutCancel` so shutdown does not leave billed parts.

Deadlines: `doWithProgress` wraps both destinations' requests. A timer cancels the request context with cause `errStalled` after 5 minutes without progress; reading the request body, receiving headers and reading the response body reset it; closing the response body releases it. The default client has no `Timeout`. A restore download from the destination is covered the same way.

## Size impact

No dependency; a few hundred lines of Go including tests.
