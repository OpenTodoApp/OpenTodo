# Tasks

## 1. Reminders in the Trash

- [x] 1.1 `internal/push`: skip due reminders whose task's project or any ancestor is tombstoned (cycle-safe walk, per-tick cache), without recording delivery; verify `TestSchedulerSkipsTrashedProjects` (direct, ancestor, deleted task, late delivery once after restore) and `TestSchedulerProjectCycle` (`go test ./...`)
- [x] 1.2 `web/src/lib/reminderWatcher.ts`: same rule over local projects (`inTrashedProject`); verify the new case in `reminderWatcher.test.ts` (`npm test`, `npm run build`)

## 2. Bounded pull pages

- [x] 2.1 `internal/sync`: `MaxPullBytes` budget in `PullAll` (at least one op, `hasMore`, cursor at the last served op); verify `TestPullRespectsByteBudget` and `TestPullMakesProgressWithOversizedOp` (`go test ./...`)
- [x] 2.2 Same budget in the member history replay (`backfillPage`, `done_seq` at the last op served); verify `TestBackfillRespectsByteBudget` and the existing `TestNewMemberReplaysHistoryBehindCursor` (`go test ./...`)
- [x] 2.3 Confirm the web client loops on `hasMore` (`web/src/lib/sync.ts`) and no other path pages op values (MCP, SSE, CalDAV); verify by reading the code and `npm test`

## 3. CalDAV rows with purges

- [x] 3.1 `internal/sync/trash.go`: delete `caldav_resources` rows of purged tasks in the purge transaction; verify `TestPurgeRemovesCaldavResources` (single, project cascade, retention, live row kept) (`go test ./...`)
- [x] 3.2 `0024_caldav_orphans.sql` removes rows of already purged tasks, idempotently; verify `TestMigrationCaldavOrphans` (`go test ./...`)

## 4. Import summaries for webhooks

- [x] 4.1 `internal/webhook`: skip import-origin changes; add `import.completed` and `import.undone` to the catalogue; `ObserveImport` with member audience and project filter; verify `TestImportSummaryAudienceAndFilter` (`go test ./...`)
- [x] 4.2 `internal/importer`: summary observer called once per finished job and per undo with counts and project ids; wired in `httpapi.New`; verify `TestImportSendsOneWebhookSummary` (120-task import gives one `import.completed`, undo one `import.undone`, REST create still `task.created`) (`go test ./...`)
- [x] 4.3 Settings event checkboxes include the new events; verify `webhooksSettings.test.tsx` (`npm test`, `npm run build`)

## 5. Docs and checks

- [x] 5.1 `docs/reminders.md`, `docs/sync.md`, `docs/caldav.md`, `docs/webhooks.md`, `docs/import.md`, `docs/api.md`, `CHANGELOG.md` (Fixed, migrations); verify links and `npx --yes @fission-ai/openspec@latest validate --all --strict`
- [x] 5.2 Run `make check` until green
