# Design

## Context

`project.parent_id` has been in the op schema since the bootstrap change (nullable id string, validated on server and client) but nothing reads it. Turning it on is mostly client work plus a convergence rule for the one case the per-field last-writer-wins model cannot prevent on its own: two offline devices each moving one project under the other. Constraints: local-first (tree must render and be editable offline), convergent (no manual conflict resolution), keyboard-first, no new write path.

## Goals / Non-Goals

**Goals:**
- Unlimited nesting depth, rendered as a tree with per-device collapse state.
- Moves, archive cascade and delete promotion expressed purely as existing ops.
- A deterministic, write-free cycle-breaking rule shared by every client.
- Rolled-up counts computed locally.

**Non-Goals:**
- Drag-and-drop in the sidebar (`manual-ordering` adds it on top of this change's data rules).
- Sections or subtasks.
- Server-side materialized tree or a `path` column; the server stays a field store.

## Decisions

### D1. Reuse `parent_id`; no new fields or entities
The tree is fully described by `parent_id` plus the existing `position` (ordering among siblings). The op schema, migrations, export format and REST payloads are unchanged. Data-model impact: none beyond giving semantics to an existing field.

### D2. Cycle handling in three layers
1. **Client prevention**: the "Move to" picker excludes self and descendants (computed from local data), so a single device cannot create a cycle.
2. **REST rejection**: `PATCH /api/v1/projects/{id}` with `parent_id` walks the parent chain in the materialized `fields` table and returns `invalid_input` if it reaches the project itself. REST is server-side and sequential, so rejecting is safe and cheap (a chain walk is bounded by the number of projects).
3. **Convergent repair without writes**: ops arriving by sync are never rejected (rejecting would make state depend on arrival order). After applying ops, the client's tree builder detects cycles; within a cycle, the member whose `parent_id` has the greatest `(ts, device)` clock is rendered as top level. Every replica holds the same clocks, so every replica picks the same member. No repair op is emitted: automatic writes from many devices would race each other and create churn, and the user can resolve it with one move.
- Alternative: emit a repair op setting the chosen member's `parent_id` to null. Rejected: two devices would emit identical-valued ops at different timestamps, which is harmless but noisy, and it hides from the user that their intent was not fully honoured.
- Alternative: reject cycle-forming ops on the server. Rejected: breaks convergence and idempotency guarantees of the sync endpoint.

### D3. Archive cascade as explicit ops; unarchive does not cascade
Archiving writes `archived=true` for each descendant as its own op so each project's state is independent under LWW (a sub-project moved out concurrently keeps the newest of the two edits per field). Unarchive is deliberately non-cascading: it is the safer default when the user only wants one project back, and cascading unarchive could resurrect projects archived earlier for other reasons.

### D4. Delete promotes sub-projects
Deleting writes `deleted_at` on the project and `parent_id = <its parent>` on each direct sub-project; open tasks still go to the Inbox (existing rule). Promotion rather than cascading delete matches the "no data is lost" promise of the existing delete requirement and avoids multi-level accidental deletion. `trash-and-history` will later add restore on top of the same tombstones.

### D5. Counts and collapse state
Counts are a single pass over local open tasks grouped by `project_id`, then a bottom-up sum over the tree; both are memoised per live query. Collapse state is a `Set<projectId>` persisted in the local `meta` table (per device, not synced). Navigating to a project removes its ancestors from the set.

### D6. Orphan display
A project whose parent is missing locally (not yet received, deleted or archived) is shown at the top level without writing anything; when the parent arrives it snaps into place. This keeps the tree total (every project visible) and avoids writes triggered by partial sync state.

## Data model impact
- No new entities or fields. `project.parent_id` and `project.position` gain semantics. No renames. All writes go through `mutate()` / `sync.Apply`.
- No dependency added; container image and runtime memory unchanged. Client bundle +3–4 KB gzipped (tree builder, picker, cycle check).

## Risks / Trade-offs

- [Cycle breaking changes which project is top level after a race] → deterministic and identical on all devices; the project is never hidden; documented in `docs/sync.md`.
- [Deep trees make the sidebar hard to scan on phones] → indentation is capped after level 3 and collapse state is remembered per device.
- [Archive cascade writes many ops for large trees] → one op per project, bounded by project count; well within the 1000-op batch limit for personal data and the outbox splits larger batches anyway.
- [Rolled-up counts cost a tree walk per change] → projects number in the tens to hundreds; the walk is linear and runs inside the existing live query.

## Migration Plan
None. Existing data has `parent_id = null` everywhere and renders as today. Rollback: an older client ignores `parent_id` and shows a flat list; no data is lost.

## Open Questions
- Whether `project-sharing` will need to forbid moving a project between differently shared subtrees; the picker can filter by owner later without schema change.
