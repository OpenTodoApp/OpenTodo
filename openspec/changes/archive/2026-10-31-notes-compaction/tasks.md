# Tasks

## 1. Store

- [x] 1.1 `internal/store`: `PRAGMA auto_vacuum = INCREMENTAL` on a new database before the first migration; `AutoVacuumMode`, `ConvertIncremental(ctx, db)` (the one-time `VACUUM`), `IncrementalVacuum(ctx, db, pages)` and `FileStats` (page count, free pages, page size, WAL size); verify `go test ./internal/store/...` (a fresh database reports mode 2; an old-mode database reports 0, converts, and reports 2 with its data intact)
- [x] 1.2 Free-space check of the data directory (`syscall.Statfs` on Unix, "unknown" elsewhere, which skips the conversion with a warning); verify a unit test with a stubbed reader

## 2. Compaction pass

- [x] 2.1 `internal/sync`: `CompactNotes(ctx, now, budget)` with the D1 conditions (fields from `DocFields` and the `description` of the same entities), the D3 per-UTC-day thinning, chunks of 1,000 found on the reader and deleted on the writer with the conditions repeated in the `DELETE`, `op_scopes` rows in the same transaction, a high-water mark, the time budget and the result `{opsRemoved, valueBytesRemoved, more}`; share the "superseded" predicate with `PurgeSupersededContent`; verify `go test ./internal/sync/...`
- [x] 2.2 Tests (all in `internal/sync`, `go test ./internal/sync/...`):
  - the winner is never deleted, at any age, for `notes_doc` and `description`;
  - an op received 29 days ago is kept; 31 days ago and superseded is deleted; `received_at`, not `ts`, decides (an op with a 90-day-old `ts` received yesterday is kept);
  - personal and shared project scopes are both compacted; other fields (title, due, labels) are untouched;
  - thinning keeps the last revision of each UTC day, including at 23:59:59.999 and 00:00 boundaries;
  - **convergence after compaction:** two simulated devices edit one note concurrently (real Yjs updates from the shared fixture, as `internal/sync` convergence tests do with opaque values), sync, compaction runs 31 days later; a third device pulling from cursor 0 ends with the same rows as the first two;
  - **long-offline device:** a device with cursor before the deleted ops pulls after compaction, pushes its pending op, and every replica converges on the same winner;
  - **un-pulled ops inside the grace window are never deleted:** device A pushes, device B pushes a later document without pulling, compaction at day 10 keeps A's op, and a pull from B's cursor still returns it;
  - a candidate that becomes the winner between selection and deletion is not deleted (race test with a write between the two steps);
  - a re-sent deleted op is stored again, loses, and is deleted by a later run;
  - cursors: a pull with a cursor inside a deleted range returns the next remaining ops and advances past the hole; paging limits still hold
- [x] 2.3 Quota: optional `Removed(n)` on `sync.Quota`, called after each chunk; `internal/host` quota lowers its in-memory total; verify `go test ./internal/host/...` (a tenant at its op limit can write again after compaction)

## 3. Job and reporting

- [x] 3.1 `internal/jobs`: name `Compaction = "compaction"`; `internal/tenant/jobs.go`: the job with `jobs.Upkeep{Every: 24h}`, first due an hour after start, `Retry: time.Minute` while `more`, then incremental vacuum steps and the one-time conversion (quiet for 10 minutes, or 7 days passed; disk check); verify `go test ./internal/tenant/... ./internal/jobs/...` (idle tenant: no run; after a change: due 24 h after the last run; `more` re-runs after the retry pause; the demo tenant registers the job and removes nothing)
- [x] 3.2 Report: `Info` log line `notes compaction` with `ops`, `value_bytes`, `file_bytes`, `more`; `Warn` for missing disk space; the `settings` key `compaction.last` with the conversion state; verify a tenant test reading the stored report after a run
- [x] 3.3 `GET /api/v1/settings/storage` registered as `ownerOnly("see storage").DemoDenied()` plus the `demo.go` deny-list entry; response shape in `docs/api.md`; verify `go test ./internal/httpapi/...` (owner 200 with the fields; 401 without credentials; 403 `forbidden` for a member and an admin; 403 `demo_restricted` on a demo; `policy_test.go` and the route matrix pass)

## 4. Web

- [x] 4.1 Database storage card on Settings › Server › Backups (owner only): size, free inside the file, last compaction in words, the conversion state, offline line; copy in `web/src/lib/settingsCopy.ts` within the copy limits; verify a happy-dom test (owner sees the numbers, offline shows the line, a member never sees the card), `npm test`, `npm run build`
- [x] 4.2 History tab: the muted "Older note versions are kept one per day (UTC)" line under the first note revision older than 30 days (a client rule from the change set's time; the route is unchanged); verify a happy-dom test (a 40-day-old revision shows the line once, a recent one does not)
- [x] 4.3 Strings in the six catalogs; verify `make i18n-check`

## 5. Docs and checks

- [x] 5.1 docs/sync.md "Compaction" section (rules, window, thinning, convergence argument, interactions with Purge and the encryption purge); docs/backups.md (earlier backups keep history; the one-time conversion's cost and disk need); self-hosting guide and the 0.19 release notes (the one-time conversion); verify `make docs-check`
- [x] 5.2 CHANGELOG Unreleased entry (at archive)
- [x] 5.3 `go test ./...`, `make check`, `make openspec-validate`
