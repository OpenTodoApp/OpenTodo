# Proposal

## Why

Four server edges misbehave under conditions the shipped features make ordinary:

1. **Reminders in the Trash fire.** Deleting a project keeps its tasks live (they keep `project_id` and are hidden, trash-and-history D2). The push scheduler and the in-app watcher only check the task itself, so every reminder on a task in a trashed project still notifies the user about work they threw away.
2. **Sync pages have no byte cap.** A pull page holds up to 1000 ops regardless of size. With collaborative rich-text notes (`task.notes_doc`, up to 256 KB each) one page can reach hundreds of megabytes, which a phone or a Raspberry Pi server cannot hold comfortably.
3. **CalDAV leaves rows behind.** `caldav_resources` remembers client-chosen resource names by task id. Purges remove the task but not the row, so the table grows with dead entries forever.
4. **Imports flood webhooks.** Imports write through the op log, so a 20,000-row import queues 20,000 `task.created` deliveries per subscribed webhook, saturating the queue and the receiver.

## What Changes

- Reminders are suppressed, by push and in the app, while the task's project or any ancestor project is tombstoned. Nothing is recorded, so a restore brings them back; a reminder whose time passed meanwhile is delivered once, late, like after server downtime.
- A pull page (regular and member history replay) is also capped by a byte budget of about 4 MB of op values, always serving at least one op; `hasMore` signals the rest. The response format is unchanged.
- Purge (single, project cascade, empty Trash, retention) deletes the purged tasks' `caldav_resources` rows in the same transaction; migration `0024_caldav_orphans.sql` removes existing orphans.
- Ops written by an import or its undo no longer produce per-entity webhook events. Each finished import job produces one `import.completed` delivery and each undo one `import.undone`, per subscribed webhook, with counts and project ids. Two events join the closed catalogue; ordinary writes keep their per-event behavior.

Out of scope: coalescing deliveries for other bulk writers (CalDAV, REST loops, large sync batches), a configurable byte budget, changing how the client shows trashed tasks outside reminders, alarms-to-reminders mapping in CalDAV.

Advances no new ROADMAP.md item; it hardens items already shipped: reminders (`reminders`), sync (`collaborative-rich-text`, `project-sharing`), CalDAV (`caldav`), import (`data-import`) and webhooks (`webhooks`).

No **BREAKING** change to the op log format and no new environment variable. Behavior change for receivers: a webhook that relied on per-task events from imports must subscribe to `import.completed` (documented in CHANGELOG and docs/webhooks.md).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `reminders`: reminders are not delivered while the task's project or an ancestor is in the Trash; restore rule.
- `offline-first-sync`: pull pages are bounded by a byte budget with guaranteed progress.
- `caldav-sync`: resource names are removed together with purged tasks.
- `webhooks`: import origin excluded from per-entity events; `import.completed` and `import.undone` summary events.

## Impact

- Server: `internal/push/service.go` (ancestor walk), `internal/sync/service.go` and `ops.go` (`MaxPullBytes`, Pull and backfill paging), `internal/sync/trash.go` (CalDAV cleanup), `internal/store/migrations/0024_caldav_orphans.sql`, `internal/importer` (summary observer), `internal/webhook` (new events, `ObserveImport`), `internal/httpapi/server.go` (wiring).
- Client: `web/src/lib/reminderWatcher.ts` (ancestor check), webhook event list in `web/src/lib/webhooks.ts` and `types.ts`.
- Docs: `docs/reminders.md`, `docs/sync.md`, `docs/caldav.md`, `docs/webhooks.md`, `docs/import.md`, `docs/api.md`, `CHANGELOG.md`.
- No dependency added; binary and bundle size change is negligible (a few hundred bytes).
