# Design

## Context

The only write path is the op log (`internal/sync.Apply`); REST writes already translate bodies into ops with `device: "server"`. Export exists (`GET /api/v1/export`, `opentodo-export` v1) and includes tombstones. The client is local-first, but an import of tens of thousands of rows is a rare, online, bulk operation. The data model has `parent_id` and `labels` reserved and synced but without UI; sections and nested projects do not exist yet.

## Goals / Non-Goals

**Goals:**
- Exact round trip of the own export (migration between instances, recovery).
- A documented CSV contract that spreadsheets and scripts can produce.
- Foreign JSON exports mapped through small, testable profiles with fixtures.
- Nothing written without a preview; nothing written outside the op log; undo available.
- Bounded memory and time on a Raspberry Pi.

**Non-Goals:**
- Pulling data from third-party APIs (no outbound calls).
- Incremental or scheduled imports; a future `cli-client` can script repeated runs against the same endpoints.
- Importing entities the model lacks (comments, reminders, attachments, recurrence). They are dropped with a warning; later changes can extend profiles additively.

## Decisions

### D1. Server-side importer, client as uploader
Chosen: the browser uploads the file; the server parses, previews and commits. The client learns about the result through normal sync.
- Why: one importer serves the UI, the API and the future CLI; the server has the user's full data for duplicate checks; 50,000 rows become up to ~500,000 ops, which would take thousands of sync round trips if generated client-side; the server can stream a CSV and bound memory.
- Alternative: client-side parsing writing through `mutate()`. Truest to local-first (works offline) but slow for large files, duplicates parsing logic between TS and Go for the CLI, and the preview table would still need the full dataset in memory in the browser. Rejected; the Import screen states that a connection is required.

### D2. Ops stamped with server time, device `import`
Imported fields are ops `{ts: now, device: "import"}` applied through `Apply` in batches of 1,000. `created_at` and `completed_at` from the source are field values. Devices receive import ops like REST ops (the sync pull excludes only the caller's own device id).
- Why: LWW stays uniform; a later edit on any device beats the import; an import never resurrects a tombstoned entity because the tombstone op is only written for `opentodo` round trips that carry it.
- Own-export overwrite mode writes only fields whose value differs from the current one, so an unchanged field keeps its original clock and a concurrent device edit is not clobbered needlessly.

### D3. Importer profiles
`internal/importer` exposes `type Profile interface { Detect([]byte) bool; Read(io.Reader, Options) ([]Row, error) }` where `Row` is a normalised intermediate record `{SourceID, Kind (project|task), Title, Description, ProjectName, SectionName, ParentSourceID, Priority, Due, Labels, CompletedAt, CreatedAt, Warnings}`. Profiles: `opentodo`, `csv`, and one per foreign JSON shape, each with a fixture under `internal/importer/testdata/` and a mapping table in `docs/import.md`. Detection tries `opentodo`, then each JSON profile's structural signature, then CSV (header contains `title`). The user can override.
- Why: adding a format is a new file plus a fixture; no product names in code paths beyond the profile identifier.

### D4. Mapping rules worth stating
- Projects: match an existing non-deleted project by case-insensitive name; otherwise create. Unassigned rows go to the chosen target project or Inbox.
- Sections: option `sections: label | ignore` (default `label`, producing `labels += ["<section>"]`). When `board-view` ships, a `section` option can be added without changing the file formats.
- Priority: profiles normalise to 1–4; CSV accepts `1`–`4` or `p1`–`p4`; blank → 4.
- Dates: `YYYY-MM-DD` → date; `YYYY-MM-DDTHH:MM[:SS]` without zone → date + time; with zone or `Z` → converted to the chosen time zone (default: browser zone sent by the client) then split. CSV `due_time` requires `due_date`.
- Subtasks: `ParentSourceID` resolved after all rows are read, so order does not matter; unresolved parents become top-level tasks with a warning.
- Completion: any truthy completion marker becomes `completed_at` = source timestamp or import time.

### D5. Duplicate detection and job memory
Two additive tables:
- `import_jobs(id, user_id, profile, status, options_json, totals_json, errors_json, created_at, finished_at, undone_at)`
- `import_items(job_id, source_id, entity, entity_id, action)` where `action ∈ {created, updated}`.
Rules, in order: own-export id exists → `update` or `skip`; `(user, profile, source_id)` already in `import_items` → `skip already_imported`; fingerprint `lower(trim(title)) + project + due.date` matches an open task → `possible_duplicate`, skipped unless `duplicates: import`. The fingerprint index is built once per preview from the user's open tasks (in memory, bounded by task count, not file size).
Undo tombstones every `created` item of the job through ops; `updated` items are left alone (their previous values are still in the op log for a future `trash-and-history` change).

### D6. Job execution and limits
Preview is synchronous (bounded by the 20 MB / 50,000-row limits; CSV streamed, JSON decoded once). Commit runs in a goroutine per job, one job per user at a time, progress persisted in `import_jobs.totals_json` every batch so a restart leaves a `failed` job with an accurate count instead of a silent half-import. Request body limit for `/api/v1/import*` is raised from the global 4 MB to `OPENTODO_IMPORT_MAX_MB` (default 20) for these routes only.
- Memory: worst case a 20 MB JSON file decodes to roughly 5× its size in Go values; peak around 100–120 MB during preview on the largest allowed file, released after the response. Typical imports (a few thousand rows) stay under 10 MB. Documented in `docs/import.md` with the knob.

### D7. Data model impact
No new op fields. New tables `import_jobs` and `import_items` (migration `0002_import.sql`), additive. Export is unchanged (jobs are operational metadata and not exported).

### D8. Dependencies and footprint
No new Go dependency: `encoding/csv`, `encoding/json`, `mime/multipart`, `time` zones from the embedded `time/tzdata` (adds ~450 KB to the binary; needed because the distroless image has no zoneinfo). Image size effect: < 0.5 MB. Client: one settings screen, no new npm package; expected bundle growth under 8 KB gzipped.

## Risks / Trade-offs

- [Large import floods other devices with ops on next sync] → ops are small; the client already pages pulls at 1,000; the sync status shows progress. Acceptable for a one-time migration.
- [Foreign formats change without notice] → profiles are detected structurally and fail soft (rows with warnings, not a crash); fixtures pin the supported shape; the user can always fall back to CSV.
- [Fingerprint duplicate detection has false positives] → it only flags and skips with a visible reason; the user can choose `duplicates: import`.
- [A job interrupted by a restart leaves a partial import] → progress is persisted per batch, the job shows `failed` with counts, and undo removes what was created.
- [Preview memory on a 1 GB Raspberry Pi] → 20 MB default limit; the limit is adjustable downward; CSV is streamed.
- [Imported ops all share one wall-clock second] → ties within the import resolve deterministically by device id, and every later user edit has a greater timestamp.

## Migration Plan

Additive migration; no data transformation. Rollback is to run an older image: the two new tables are ignored, imported entities remain ordinary tasks and projects.

## Open Questions

- Whether the `cli-client` change should add `opentodo import <file>` as a thin wrapper around these endpoints (likely yes; nothing here blocks it).
- Whether sections should default to labels or to nothing once `board-view` lands; the option stays, only the default would change.
