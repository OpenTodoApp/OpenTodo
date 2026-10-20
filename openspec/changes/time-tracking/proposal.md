# Proposal

## Why

A task carries an estimate (`estimate_minutes`, OpenSpec `time-blocking`) but nothing about what it actually took, so the one question an estimate exists to answer, "was I right?", cannot be answered in OpenTodo today, and people who bill or report their hours keep a second app running next to it. The op log already converges per field across devices, the Statistics screen already computes everything on the device, and the quick-add parser already reads durations: tracked time is a small, additive entity on top of what exists. ROADMAP.md lists "a focus timer with time tracking" under "Considered and set aside"; this change picks up the time-tracking half and leaves the timer to a later `focus-mode` change that will build on these entries.

## What Changes

- **A synced `time_entry` entity.** One row per stretch of work: `task_id`, `user_id`, `started_at`, `ended_at` (null while running), `device_id`, an optional `note`, `created_at` and a `deleted_at` tombstone. Entries are written through the op log like comments, live in the scope of their task, and are the author's alone to edit; two devices tracking the same task write two rows and never conflict. The `note` is user-written text and joins the encrypted content fields.
- **One running entry per user.** Starting an entry stops the user's running one in the same batch. When two devices start concurrently while offline, every device applies the same rule after sync: the entry with the later `started_at` keeps running and the other ends at that start, so all devices converge without asking.
- **Start and stop everywhere a task is.** From the row's menu and the task panel, with `y` on the selected task in every task list (`y` is free in the list scope; it parks a task in the Inbox triage, which has no task list), and from a running indicator in the sidebar footer (the phone bar below 768 px) that shows the elapsed time and the task's name, opens the task and stops it.
- **A Time tab in the task panel** next to Comments, Activity and History: the entries of the task with start, end, duration and note, Start/Stop, manual add (`45m`, `1h30`, or a start and end), edit and delete. The row's estimate chip reads `35m / 1h` once an entry exists.
- **Tracked time in Today, Statistics and filters.** Today's page header shows the day's tracked total beside the planned total. Statistics gains the time tracked in the period, tracked per day and tracked per project, computed on the device from the user's own entries, and an **Export time entries (CSV)** action. The filter grammar gains `tracked` (any time tracked) and `tracked cmp duration` (`tracked > 1h`), validated on the server and evaluated on the device from the same examples file.
- **Quick add `30m/2h`**: "30 minutes already spent, 2 hours estimated" creates the task with the estimate and one closed entry ending now; `+30m` stays an estimate only. Same result in the six parser languages, pinned by the shared vectors.
- **API, CLI, MCP, export.** REST routes under `/api/v1/time-entries` (list, CSV, start, stop, log, edit, delete) through the policy wrapper; read tokens are refused on the writes, agent tokens too. `ot time start|stop|log|list|export`. One MCP read tool `list_time_entries`, and `tracked_minutes` on task results; no write tool. The JSON export carries `time_entries`, an own-export import restores them, backups need nothing (the database snapshot holds the log). CalDAV is untouched. The demo instance allows all of it (no outbound request, no stored secret).

**Out of scope:** idle detection, Pomodoro and focus sessions (`focus-mode`), billing rates and invoices, write-back to external trackers, time entries on projects without a task, a per-project "who tracked what" report for admins, `estimate cmp duration` in the filter grammar (the duration value grammar this change adds makes it a small follow-up), webhook and activity events for entries.

**ROADMAP.md:** advances the "focus timer with time tracking" item set aside in "Considered and set aside for now", for the tracking half; `focus-mode` would take the rest.

No new environment variable. The op log format gains one entity and no field changes; not **BREAKING**.

## Capabilities

### New Capabilities

- `time-tracking`: the `time_entry` entity and its convergence rules (one running entry per user), start, stop and manual entries in the web app (rows, panel Time tab, the `y` shortcut, the running indicator), tracked totals on rows and in Today, the CSV export and the REST routes.

### Modified Capabilities

- `statistics`: "What is counted" gains the time tracked in the period; "Breakdowns and charts" gains tracked per day and tracked per project; a new "Time entries export" requirement for the CSV action.
- `filter-queries`: a new "Tracked time terms" requirement (`tracked`, `tracked cmp duration`) and the duration value grammar.
- `natural-language-capture`: "Attribute tokens" gains `<spent>/<estimate>` (`30m/2h`).
- `cli-client`: a new "Time commands" requirement (`ot time start|stop|log|list|export`) and `--natural` picking up `30m/2h`.
- `http-api`: "Export" includes `time_entries`.
- `mcp-server`: "Read-only tools" lists six read tools (`list_time_entries` added) and task results carry `tracked_minutes`.
- `end-to-end-encryption`: "Encrypted and plaintext fields" adds the time entry note to the encrypted text and the timestamps to the plaintext fields.
- `data-import`: "Own export completeness" restores time entries with their ids.
- `web-app`: "Task panel tabs" gains the Time tab.
- `task-list-presentation`: "Metadata language" lets the estimate chip read `tracked / estimate`.
- `trash-and-history`: "Permanent purge" purges a task's time entries with it.

## Impact

- **Server:** `internal/sync/ops.go` (`Schema["time_entry"]`), `internal/sync/scope.go` plus a new `internal/sync/timeentries.go` (scope and authorship, modelled on `comments.go`), `internal/sync/trash.go` (purge cascade and the `timeEntries` count), `internal/e2ee/e2ee.go` (`ContentFields["time_entry"] = {"note"}`); a new `internal/timetrack` package (the running-entry rule, totals, CSV columns, shared with the web through a fixture); `internal/httpapi/timeentries.go` (routes, `ApplyStrict` + `NotifyApplied`), `export.go` (`time_entries`); `internal/importer/plan_own.go`; `internal/filter/filter.go` (`tracked`, durations); `internal/quickadd` (`SpentMinutes`); `internal/agenttools/read.go` and `data.go` (`list_time_entries`, `tracked_minutes`); `internal/cli` (`cmd_time.go`, `schema/time_entry.json`, the skill file); `docs/sync.md`, `docs/api.md`, `docs/cli.md`, `docs/mcp.md`, `docs/filters.md` (worked examples are the shared vectors), `docs/quick-add.md`, `docs/statistics.md`, `docs/e2ee.md`, `docs/keyboard.md`, a new `docs/time-tracking.md`.
- **Web:** `web/src/lib/types.ts`, `ops.ts` (defaults, `startTracking`, `stopTracking`, `logTime`), `db.ts` (Dexie version 20, `timeEntries` table), `e2ee.ts`, `sync.ts` (reseed sends own entries only), a new `web/src/lib/time.ts` (running rule, totals per task, per day, per project, CSV), `stats.ts`, `filter/parse.ts`, `filter/evaluate.ts`, `nlp/attributes.ts`, `nlp/parse.ts`, `shortcuts.ts` (`list.track`, `panel.track`); `web/src/app/TaskRow.tsx`, `TaskListView.tsx` (Today total), `task-detail/TimeTab.tsx` and `ConversationTabs.tsx`, `Sidebar.tsx` and `Shell.tsx` (the running indicator), `review/StatsView.tsx`, `QuickAdd.tsx` (the spent chip), menus. Six catalogs gain the new strings.
- **Size:** no dependency. Web main chunk about +10 KB gzipped (entries module, Time tab, indicator, statistics and filter additions); each language catalog about +1.5 KB. Binary about +0.3 MB uncompressed (package, handlers, CLI command, MCP tool), image size unchanged in practice; runtime memory unchanged (entries are rows in the same tables as every entity). Dexie gains one table.
- **Data model:** one additive entity, no field renamed or removed; the row of a task is unchanged. Sync, backup, restore and the trash need no format change.
