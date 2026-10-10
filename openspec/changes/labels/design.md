# Design

## Context

`task.labels` has been a synced `array of strings` since bootstrap, replaced as a whole value under LWW (a known limit recorded in the bootstrap design). The question this change must settle is what the strings mean. That choice determines rename cost, convergence behavior and how the filter language will refer to labels. Constraints: no breaking op change, offline-first, keyboard-first, small.

## Goals / Non-Goals

**Goals:**
- A `label` entity with stable identity so rename is one op.
- A clear, documented convergence story for the whole-array field.
- Label views and counts computed locally.
- The entity pattern consistent with sections (schema entry, client table, REST collection, export key).

**Non-Goals:**
- Per-element (set) semantics for `task.labels` in this change.
- Parsing `@label` in quick add; label expressions in filters.
- Per-project or shared labels.

## Decisions

### D1. `task.labels` holds label ids
Alternatives:
- **Names as the value** (no entity): zero schema work, but rename means rewriting every task (N ops, conflicts with concurrent edits to the same arrays), colours need a side table anyway, and the filter language would bind to mutable strings.
- **Ids referencing a `label` entity** (chosen): rename and recolour are one op each; tasks never change on rename; duplicates can be merged deterministically; filters bind to ids and display names.
Cost: one more entity, and a dangling-id display rule (hide unknown or deleted ids, never drop them). The array type is unchanged, so this is a convention, not a format change, and the array is empty in all existing data.

### D2. Whole-array LWW stays, with mitigation and a documented path forward
Keeping the array as one register means concurrent additions of different labels on two devices lose one. Mitigation now: (a) the client reads the current array inside the same transaction as the write, so sequential edits on one device never lose; (b) the caveat is documented in `docs/sync.md`; (c) the UI applies remote changes live, so the window is the offline period only. Path forward, recorded for a later change: an add-wins observed-remove set encoded as additional per-element fields (`labels.<id>` = added timestamp / tombstone) would be additive to the op schema and could coexist with the array during migration. Not done now because it changes the materialization model for one field and the practical collision rate for a personal task list is low.

### D3. Uniqueness is a client-side rule plus merge
Names are unique per user case-insensitively on the creating device. The server cannot enforce uniqueness on the sync path without rejecting ops, so concurrent creations yield duplicates that are flagged and mergeable. Merge rewrites each affected task's array once (source id → target id, de-duplicated) and tombstones the source. Under concurrency a task may still receive the source id from a stale device; it is hidden by the deleted-label display rule.

### D4. Delete removes ids from tasks
Writing one op per carrying task keeps the export clean and counts honest. Because arrays are whole-value registers, a concurrent array write elsewhere can resurrect the id; the display rule hides deleted ids, so the user never sees a ghost chip.

### D5. Views, counts and keyboard
Label views are a live query over open tasks filtered by array membership, grouped by project; counts are one pass over open tasks. `L` opens the picker on the selected task (lower-case `l` stays free for board column navigation); `g l` opens the labels overview.

### D6. REST validation
`POST/PATCH /api/v1/labels` validate name non-empty; uniqueness is advisory (409 is not used, since devices may hold duplicates legitimately). Task writes via REST validate that every id in `labels` is an existing, non-deleted label; REST is sequential so rejection is safe. Sync ops are never rejected for this reason.

## Data model impact
- New entity `label`: `name` string, `color` string, `position` number, `created_at` number, `deleted_at` number|null. Added to the server `Schema` and `Plural` (`labels → label`), the client types, defaults and a `labels` table (database version bump). `task.labels` unchanged in type; semantics: array of label ids. No renames. Export gains `labels`; version stays 1. All writes through the op log.
- Dependencies: none. Container image and runtime memory unchanged. Client bundle +4–6 KB gzipped.

## Risks / Trade-offs

- [Concurrent additions on two devices lose a label] → documented, mitigated by immediate read-before-write and live apply; set semantics planned (D2).
- [Older export consumers see opaque ids in `task.labels`] → the export now includes the `labels` array to resolve them; documented in `docs/api.md`.
- [Duplicate labels confuse users] → duplicate marker and one-click merge.
- [Delete writes many ops] → one per carrying task; outbox batching.

## Migration Plan
Additive; no data migration. Existing arrays are empty. Rollback: an older client ignores `label` ops (after the unknown-entity guard from `board-view`, or by shipping that guard here if this lands first) and shows no chips.

## Open Questions
- When to introduce per-element label semantics: after `filter-query-language` ships and usage shows whether collisions matter.
