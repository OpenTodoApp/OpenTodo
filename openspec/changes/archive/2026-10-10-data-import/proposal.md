# Proposal

## Why

People switching to OpenTodo arrive with years of tasks locked in another app, a spreadsheet or an earlier OpenTodo instance. Today the only way in is retyping or scripting against the REST API. Without import, the "replace your subscription task manager" promise fails on day one, and the existing JSON export is a one-way door: there is no round trip to move between instances or recover from a mistake. Import closes that gap while keeping the one rule that makes sync safe: every imported row becomes ordinary operations in the op log.

## What Changes

- A server-side importer that accepts three kinds of files: the app's own JSON export (`opentodo-export`, exact round trip including ids and tombstones), CSV with a documented column mapping, and JSON exports from other task managers through named, documented importer profiles that map projects, sections, tasks, subtasks, labels, priorities, due dates and completion state.
- A dry-run preview before anything is written: per-row outcome (create, update, skip as duplicate, error with reason), counts, and user-adjustable options (target project for unassigned tasks, time zone for date-times, how to handle duplicates and errors, what to do with sections).
- Duplicate detection against existing data: by id for round trips, by remembered source ids for repeated imports of the same foreign file, and by a title/project/due fingerprint flagged as "possible duplicate".
- Commit as a background job whose progress and summary are visible in settings and through the API; every created or changed field is written as an operation stamped with server time, so all devices receive the imported data on their next sync with no new write path.
- Undo of a whole import: everything the job created is tombstoned through the op log.
- Limits (file size, row count, rows in error) that keep a Raspberry Pi responsive, with per-row error reporting instead of all-or-nothing failures.
- Import UI in Settings (file picker, format detection, options, preview table, job history with undo), keyboard reachable, plus API documentation so the future CLI can drive the same endpoints.

Out of scope: importing comments, attachments, reminders, recurrence rules and collaborators (rows carrying them import with a per-row warning that the unsupported part was dropped); importing directly from a third-party account through its network API (no outbound calls); scheduled or incremental imports; exporting to CSV; importing into another user's account.

Advances ROADMAP.md section 6, "JSON / CSV import, including export files from popular commercial task apps" (`data-import`).

No breaking changes: no new mandatory environment variable (one optional `OPENTODO_IMPORT_MAX_MB`, default 20), no change to existing op fields; the op log format is unchanged and imported data is plain operations.

## Capabilities

### New Capabilities
- `data-import`: accepted formats and their mapping, dry-run preview, duplicate detection, the import job and its limits, write-through to the op log, undo, and the settings screen and API routes that expose it.

### Modified Capabilities
- none. Imported rows already fit the existing `task-management` and `project-organization` entities; reserved fields (`parent_id`, `labels`) are used as stored.

## Impact

- Server: new `internal/importer` package (format detection, profiles, CSV and JSON readers, preview and commit), new routes under `/api/v1/import/*`, two additive tables (`import_jobs`, `import_items`) in a new migration, optional config value. No new Go dependency (CSV and JSON come from the standard library).
- Client: new Settings → Import screen, job list, undo; small bundle increase (one screen and a table component).
- Docs: `docs/import.md` (CSV columns, profile list, limits, undo), `docs/api.md` (routes), README feature list.
