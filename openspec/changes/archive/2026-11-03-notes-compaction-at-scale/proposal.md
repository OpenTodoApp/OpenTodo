# Proposal

## Why

`performance-10k` built a notes fixture (design D7): the 10,000-task account plus 500 notes saved about 300 times each over a year, 2.65 GB of log. Its first full run (2026-11-03, issue #590) found that the notes history does not scale:

| Measured on the CI runner | Value | Budget |
| --- | --- | --- |
| Full compaction of the fixture | no pass finished in 20 minutes | 120 s |
| Longest push wait behind compaction | 4.4 s | 100 ms |
| Database after compaction | 2,546 MB (pass unfinished) | 250 MB |
| What a new device pulled | 1.99 GB | — |
| First sync with notes (desktop) | 235 s | 45 s |

Profiling on a development machine found three causes:

1. **The candidate query is quadratic.** Compaction looks for superseded ops in windows of 50,000 sequence numbers; for a `description` it checks "a later revision of the same day exists" with a subquery that reads every revision of that note, so one note saved 300 times costs 300 × 300 row reads, and the same check runs again inside the writer's transaction. Finding 100 candidates took 3 to 10 seconds.
2. **Incremental vacuum with gigabytes on the free list is slow.** SQLite looks up each page it returns in the free list's chain of trunk pages; with 2 GB free, a step of 500 pages held the writer for about a second, so writes waited behind it.
3. **A new device downloads every saved copy of every note.** The pull serves the whole log; until compaction catches up that is the whole history, and even after it a new device still downloads every save of the last 30 days and one revision per day of every note, only to merge them away.

## What Changes

- **Compaction plans one note field at a time.** It walks the fields that have a winner (`scope_fields`) in key order, reads the ops of one field without their values (sequence, timestamp, device, receipt time), and decides in memory what to delete: superseded, received more than 30 days ago, and for a `description` not the last revision of its UTC day. The rules of `op-log-compaction` do not change; the work becomes linear in the size of the log.
- **The writer is held for about 20 ms at a time.** Each deletion transaction plans its field again (so a new winner or a new last revision of the day is never deleted), deletes in slices and commits after about 20 ms, so waiting writes go first. The pass resumes from the last field it finished, also across runs and restarts.
- **Freed pages go back while the free list is short.** A run deletes for about two seconds, then returns what it freed with incremental vacuum steps sized to hold the writer about 20 ms each, and repeats; the free list never grows to gigabytes.
- **A new device copies only the latest note documents (`latest_docs`).** A device that pulls the account for the first time sends the sync feature `latest_docs`; the server then leaves out each note document that a later document of the same device supersedes, and every projection (`description`) or append that is not its field's winner. A device's note document only grows (it merges what it has before every save), so the latest document of each device holds everything that device wrote: the new device ends with the same note as with the whole history. Older clients do not send the feature and get the whole log as before.
- **Note search keeps up.** The Notes page's search no longer strips every shown note's Markdown on each keystroke, prepares long ASCII notes about four times faster, and keeps its list while the notes are unchanged (the search keystroke was the last notes budget over its limit once the first sync was fast).
- **Benchmarks.** The notes perf job joins the nightly run; the notes budgets hold.

No op schema change, no migration, no new environment variable. **Not breaking**: the sync request and response formats are unchanged; `latest_docs` is an additive feature name, and the server's answer to a client that does not send it is unchanged.

## Capabilities

### Modified Capabilities

- `op-log-compaction`: "Compaction runs in the background in small steps" states the writer hold, linear work and resuming per field; "Freed space returns to the file system" states that reclaiming runs alongside deleting in short steps.
- `offline-first-sync`: new requirement "A first copy leaves out superseded note history".

## Out of scope

- Loading notes on demand (performance-10k task 3.3, `notes-on-demand`): only if the notes budgets still fail after this change.
- The catch-up replay of a newly joined shared project keeps serving the project's whole remaining history.
- A different storage layout for documents (a separate table, deltas instead of full states).

## Impact

- Server: `internal/sync/compaction.go`, a new `internal/sync/latestdocs.go`, `internal/compaction` (the run loop and vacuum steps), the sync handler's feature list.
- Web app: `lib/sync.ts` and `lib/api.ts` send `latest_docs` during the first copy; `lib/noteSearch.ts`, `lib/noteList.ts` and the Notes page's data hooks for the search keystroke.
- Docs: `docs/sync.md` (Exchange, Compaction), `docs/performance.md`, `docs/backups.md` if it describes the pace.
- CI: `.github/workflows/perf.yml` runs the notes job from the nightly workflow.
- Roadmap: advances `performance-10k` (1.0 "Trust", issue #590), tasks 3.3 and 4.1.
