# Design

## Context

Sections are the first new entity since bootstrap, so this change also establishes the pattern for adding an entity: a schema entry on the server, a table and defaults on the client, a REST collection, an export key, nothing else. A board is a pure rendering of sections and tasks; there is no board state to sync. Constraints: offline-first, convergent, keyboard-first, no new dependencies for drag and drop.

## Goals / Non-Goals

**Goals:**
- Sections and `section_id` as purely additive schema.
- List and board as two renderings of the same local query.
- Moves between sections that converge with the same LWW rule as every other field.
- A drag-and-drop implementation small enough to avoid a library.

**Non-Goals:**
- Within-column fine ordering rules and cross-device reorder convergence (`manual-ordering`).
- Boards for non-project views, WIP limits, swimlanes.
- Server-side validation that `section_id` matches the task's project on the sync path (rejecting would break convergence; see D3).

## Decisions

### D1. Data model: `section` entity and `task.section_id`
Op schema additions (server `Schema`, client `types.ts` and defaults in `ops.ts`):
- `section`: `name` string, `project_id` string, `position` number, `created_at` number, `deleted_at` number|null.
- `task.section_id`: string|null, default null.
`Plural` gains `sections → section`. Client database version bumps to add a `sections` table indexed on `project_id, position` and a `section_id` index on `tasks`; Dexie upgrades are additive and existing rows get `section_id = null` on read via defaults. The export adds a `sections` array; `version` stays 1 because consumers that ignore unknown keys keep working. No SQL migration: entities live in the generic `fields` table.

### D2. Unknown entities on older clients
Today `applyOps` would throw on an unknown entity. As part of this change the client skips ops for entities it does not know (logging once) so that future entities never break an installed, not yet refreshed PWA shell. Server and client ship in one binary, so the server never lags the client except during an explicit rollback, which is covered by the migration note below.

### D3. Dangling references are a display rule, not a write
A task can end up pointing at a deleted section, a section of another project, or a section not yet received (ops for different entities can arrive in different batches). All three render as "No section". Writing a repair op would make state depend on arrival order and could overwrite a concurrent, newer move. Only user actions write: moving a task to another project explicitly clears `section_id` in the same mutation; deleting a section explicitly clears the reference on its tasks.

### D4. Moves set two fields in one mutation
Moving a task to a column writes `section_id` and `position` (end of the target column: max position + 1 at the time of the move) in one `mutate()` call so they share a timestamp. Under concurrent moves the newer timestamp wins both fields together, so the task lands in exactly one column with a consistent position. Fractional positions and same-column reordering are specified by `manual-ordering`; this change only appends.

### D5. Board and list are one query
Both views run the same live query (open tasks of the project joined with sections) and differ only in layout. View mode and collapsed sections are stored per device in the local `meta` table under the project id and are never synced; a view preference is personal to a screen size.

### D6. Drag and drop without a library
Pointer-event based drag (pointerdown, move threshold, pointerup) with a ghost element and column highlight: roughly 150 lines, works with mouse and touch, no dependency. Alternative: a drag-and-drop library (typically 10–30 KB gzipped). Rejected for size and because the only operation needed here is "drop on a column"; `manual-ordering` reuses the same primitive for within-list placement.

### D7. REST validation
`POST /api/v1/sections` validates `name` non-empty and `project_id` existing and not deleted; `PATCH` rejects `project_id` changes with `invalid_input` (a section does not move between projects; recreate instead). Tasks accept `section_id` in create and patch; the REST path validates that the section exists and belongs to the task's project, because REST is sequential and rejection there is safe.

## Data model impact
- New entity `section` (5 fields) and new nullable field `task.section_id`; both additive. No renames. All writes through the op log (client `mutate()`, server `sync.Apply`).
- Dependencies: none. Container image and runtime memory unchanged. Client bundle +7–9 KB gzipped (board layout, drag primitive, section menus).

## Risks / Trade-offs

- [Stale PWA shell receives `section` ops before refreshing] → unknown entities are skipped on apply (D2); the next shell load picks them up because the ops stay in the server log and the cursor is only advanced after a successful apply of known entities. Decision: skip-and-advance is acceptable because every op is re-derivable from the server with a cursor reset, and a `resync` action already exists in settings.
- [Section deletion writes one op per task] → bounded by tasks in the section; sent in outbox batches of 500.
- [Horizontal board on phones] → columns scroll horizontally with snap points; list remains the default.
- [Two devices create sections with the same name] → both exist; names are not unique, like projects.

## Migration Plan
Additive schema; no data migration. Rollback to a build without sections: the server rejects `section` ops from newer clients with `invalid_op`, so the outbox would stall until the client is also rolled back (same binary, so this happens together); already-stored section ops are ignored by the old reader and preserved in the log.

## Open Questions
- Whether completed tasks should be visible per column behind a toggle; deferred until there is usage feedback.
