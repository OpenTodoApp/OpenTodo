# Tasks

## 1. Server: history and purge

- [ ] 1.1 Migration `0002_purges.sql` (`user_id`, `entity`, `entity_id`, `seq`, `purged_at`); verify `store.Open` on an old database applies it (`TestMigrationsApplyPurges`, `go test ./...`)
- [ ] 1.2 `sync.History(user, entity, id, before, limit)` grouping ops by `(ts, device)` and marking losers; verify `TestHistoryIncludesLosingOps` (`go test ./...`)
- [ ] 1.3 `sync.Purge(user, entity, ids)` deleting ops and fields, inserting markers from the shared sequence, cascading project → tasks; verify `TestPurgeRemovesOpsAndCascades` (`go test ./...`)
- [ ] 1.4 `Apply` discards ops for purged ids (counted as duplicates); `Pull` returns `purged` after the cursor; verify `TestApplyDiscardsPurgedEntity`, `TestPullReportsPurged` (`go test ./...`)
- [ ] 1.5 Routes `GET /api/v1/{tasks,projects}/{id}/history`, `DELETE /api/v1/{tasks,projects}/{id}/purge` (409 `not_deleted` when not tombstoned), `POST /api/v1/trash/purge`, all with `requireAuth`; verify `TestHistoryRequiresAuthAnd404`, `TestPurgeRejectsLiveEntity`, `TestTrashPurgeRequiresAuth` (`go test ./...`)
- [ ] 1.6 Project DELETE via REST no longer moves tasks to the Inbox; verify `TestProjectDeleteKeepsTaskReferences` (`go test ./...`)
- [ ] 1.7 Retention job (`OPENTODO_TRASH_RETENTION_DAYS`, default 30, `0` disables, invalid value fails startup) at startup and every 24 h; verify `TestRetentionPurgesOldTombstones`, `TestConfigRejectsInvalidRetention` (`go test ./...`)
- [ ] 1.8 Docs: `docs/api.md` (history, purge), `docs/sync.md` (purge markers, `purged`), `.env.example` and `docs/self-hosting/*.md` (retention variable); verify documented routes and codes match handler tests

## 2. Client data layer

- [ ] 2.1 `deleteProject` writes only the tombstone; live queries hide tasks whose project is deleted (and their counts); verify `ops.test.ts` "delete project hides tasks without task ops" (`npm test`)
- [ ] 2.2 `restoreTask` (Inbox fallback when the project is deleted), `restoreProject`; verify `trash.test.ts` restore cases and "concurrent delete and restore resolves to newer" (`npm test`)
- [ ] 2.3 Sync loop handles `purged`: deletes local rows and drops matching outbox ops; verify `sync.test.ts` "purged ids are removed locally" (`npm test`)
- [ ] 2.4 Auto-archive helper: candidates with tasks and no open task for 30 days, Inbox excluded, per-device opt-out in `meta`; verify `archive.test.ts` candidate selection and opt-out (`npm test`)
- [ ] 2.5 History API client and value-restore helper writing a normal op; verify `history.test.ts` restore writes a new op with the current clock (`npm test`)

## 3. UI

- [ ] 3.1 `TrashView.tsx` (`g x`, sidebar entry with count, newest first, remaining-days column, restore and permanent delete with confirmation, empty Trash, pending state when offline); verify browser flow matching "Deleted task appears in the Trash", "Project returns with its tasks" and "Purge one task"
- [ ] 3.2 History panel in `TaskDetail.tsx` and `ProjectHeader.tsx` with timeline grouped by change set, device labels, losing values marked, "restore this value", offline notice; verify browser flow matching "Timeline of changes" and "Restore an old title"
- [ ] 3.3 Archive prompt on last completion (Enter archives, other keys dismiss), automatic archive notice with undo, Settings toggle; verify browser flow matching the three auto-archive scenarios (use a test clock for the 30-day case)
- [ ] 3.4 Update `?` help; `npm run build` passes with bundle growth under 8 KB gzipped; verify by comparing `dist` sizes

## 4. Integration and docs

- [ ] 4.1 Two-device browser run: delete a project with tasks on A, restore on B, delete a task on A and purge it, edit the same task offline on B before syncing; verify the task is gone on both devices and absent from export and history
- [ ] 4.2 README feature list and CHANGELOG under Unreleased; verify `make check` passes
