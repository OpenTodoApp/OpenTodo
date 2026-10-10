# Design

## Context

Tombstones (`deleted_at`) and the append-only `ops` table already contain everything Trash and history need; the gaps are UI and two server features: a read endpoint over the log and a real delete. The hard part is purge: it is the first operation that removes data from a system whose convergence proof assumes ops are never lost. The design must keep "replicas that saw the same ops agree" true while allowing a user to make data disappear everywhere.

## Goals / Non-Goals

**Goals:**
- Trash and restore as ordinary ops (offline, convergent).
- Project delete that is reversible without rewriting tasks.
- History straight from the log, no second storage.
- Purge that is final, converges, and cannot be undone by a late device.
- No mandatory configuration; retention optional.

**Non-Goals:**
- Log compaction for storage (separate change; purge markers are compatible with it).
- History for entities other than tasks and projects (mechanism is generic, UI deferred).
- Text diffs.

## Decisions

### D1. Trash is a view over tombstones
Trash lists local rows with `deleted_at != null`. Restore writes `deleted_at = null`; LWW decides against a concurrent delete. No new field.

### D2. Project delete hides, no longer moves tasks
Today `deleteProject` writes `project_id = null` on every open task, which makes restore lossy (tasks are already in the Inbox and have lost their project). New rule: delete writes only the project tombstone; views treat tasks whose project is deleted as hidden (one extra lookup in the existing live queries, same as the archived check). Restore is then a single op. Trade-off: tasks of trashed projects are invisible yet still carry `project_id`; the export shows them as before. The REST project DELETE handler changes the same way. Interaction with `project-hierarchy`: sub-project promotion on delete stays as that change specifies; tasks and sub-projects are handled differently on purpose (sub-projects are containers the user may still want visible).

### D3. History endpoint reads the `ops` table
`GET /api/v1/{tasks|projects}/{id}/history` selects ops for `(user, entity, entity_id)` ordered by `ts, device`, grouped by `(ts, device)` into change sets, with a `device` label (the device id, or "API" for `server`; the client maps its own device id to "this device"). Losing ops are included and marked so the timeline can show them. Pagination by `before` timestamp, 200 per page. Requires authentication like every route; 404 when the entity has no ops for this user. No index change: `ops_user_seq` plus a filter is adequate for personal volumes; an index on `(user_id, entity_id)` can be added later as a pure optimisation.

### D4. Value restore is a new op
Restoring an old value writes a normal op with the current HLC time. History stays append-only, the restore is visible in the timeline, and convergence is untouched.

### D5. Purge with markers
Purge deletes the entity's rows from `ops` and `fields` and inserts `(user_id, entity, entity_id, seq)` into a new `purges` table (migration `0002`), where `seq` is taken from the same sequence as ops so cursors order them. Three rules keep convergence:
1. **Pull** adds `purged: [{entity, entityId}]` for markers with `seq > cursor`; clients delete those rows locally. Older clients ignore the field (additive response change).
2. **Apply** discards incoming ops whose entity id is in `purges` and counts them as duplicates, so a device with stale offline edits does not recreate a partial entity. Markers are kept indefinitely (a few dozen bytes each).
3. Purging a project purges tasks referencing it (they were hidden with it and would otherwise become orphans whose restore target is gone).
Purge is server-initiated by an authenticated request and is not an op: it cannot be, because an op would itself live in the log it removes. The client therefore only requests purge when online and shows the item as "pending permanent deletion" otherwise; it does not pre-delete locally so that a failed request leaves the user with the item.
- Alternative: a `purged_at` op plus client-side hiding, no real deletion. Rejected: violates the data-ownership promise ("really gone"), and leaves content in backups of the log.

### D6. Automatic archive runs on the client
The client already observes all tasks; a cheap check on completion and once a day finds projects with tasks and no open task for 30 days and writes `archived = true`. Two devices doing it concurrently write the same value; harmless. Per-device opt-out lives in `meta`. Server-side scheduling was rejected to keep the server free of product rules and because the prompt variant needs the UI anyway.

### D7. Retention job on the server
Automatic purge must run even when no client is open, so it is a server job: at startup and every 24 h, purge tombstoned tasks and projects older than `OPENTODO_TRASH_RETENTION_DAYS` (default 30, `0` disables) via the same purge path. Optional variable with a default: not a mandatory configuration change.

## Data model impact
- No op schema change; no renames. New server table `purges` (migration `0002_purges.sql`). Sync response gains optional `purged`. New routes: two history reads, two purge deletes, one trash purge; all `requireAuth`.
- New optional env var `OPENTODO_TRASH_RETENTION_DAYS` (documented in `.env.example`, `docs/self-hosting`).
- Dependencies: none. Container image and runtime memory unchanged (one goroutine timer). Client bundle +5–7 KB gzipped.

## Risks / Trade-offs

- [Purge removes data a backup restore might reintroduce] → markers live in the same database as the log; a restored backup is consistent with itself; documented in self-hosting docs.
- [Old client never receives `purged` and keeps a local copy] → the entity is invisible (still tombstoned locally); on the next shell update the client drops rows for ids in the next pull's `purged` list, and a full resync also clears it.
- [History grows large for busy tasks] → pagination by timestamp; grouping by change set keeps the UI short.
- [Hiding tasks of trashed projects adds a lookup per row] → projects are few; the lookup is a map hit.
- [Automatic archive surprises] → prompt first, 30-day delay, notice with undo, per-device opt-out.
- [Two changes modify "Delete a project"] → noted in the proposal; the second to archive merges both behaviors (sub-project promotion plus task hiding).

## Migration Plan
Migration `0002` creates `purges`. Existing tombstoned tasks of previously deleted projects are already in the Inbox (old behavior) and stay there; no data rewrite. Rollback: an older server ignores `purges` (table remains, unused); an older client ignores `purged`.

## Open Questions
- Whether purge should also be offered for completed-but-not-deleted tasks older than N days ("archive and purge"); out of scope until asked for.
