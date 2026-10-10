# Sync protocol

OpenTodo syncs with a field-level, last-writer-wins operation log. It is a state-based CRDT (a map of LWW registers), which gives three properties:

- **Convergence**: replicas that have seen the same ops hold the same state, in any order.
- **Idempotency**: applying an op twice changes nothing.
- **Offline safety**: ops can be produced without the server and merged later.

## Operation

```json
{
  "id": "0d1f…",                 // unique per op (UUID v4)
  "entity": "task",              // "task" | "project" | "label"
  "entityId": "8c2a…",           // UUID of the entity
  "field": "title",              // must be in the schema for the entity
  "value": "Buy oat milk",       // JSON, type-checked per field
  "ts": 1760060000123,           // hybrid logical clock, unix ms
  "device": "3c54…"              // id of the producing device ("server" for REST writes)
}
```

### Schema (v1)

| Entity | Field | Type |
| --- | --- | --- |
| project | `name`, `color` | string |
| project | `position`, `created_at` | number |
| project | `archived` | boolean |
| project | `parent_id` | string or null |
| project | `deleted_at` | number or null |
| task | `title`, `description` | string |
| task | `project_id`, `parent_id` | string or null |
| task | `priority` | integer 1–4 (1 highest) |
| task | `due` | `{"date":"YYYY-MM-DD","time":"HH:MM"?}` or null |
| task | `labels` | array of strings (label ids, see below) |
| task | `position`, `created_at` | number |
| task | `completed_at`, `deleted_at` | number or null |
| label | `name`, `color` | string |
| label | `position`, `created_at` | number |
| label | `deleted_at` | number or null |

Adding fields is backwards compatible. Renaming or removing is not; it needs an OpenSpec change with a migration plan.

A client that receives an op for an entity it does not know (an older build talking to a newer server) ignores it without failing the batch; the cursor still advances.

### Task labels

`task.labels` is an array of **label ids**, not names. Renaming or recolouring a label is therefore one op on the label and never touches a task. Ids that point at a deleted label, or at a label this device has not received yet, are kept in the array but not displayed; the chip appears as soon as the label arrives.

The array is a single LWW register: every write replaces the whole value, and when two devices write different arrays for the same task offline, every replica ends with the array that carries the greater `(ts, device)`. Concretely, if device A adds `errand` and device B adds `call` to the same task while both are offline, only one of the two labels survives on every device. To keep the common case safe the client reads the task's current array in the same transaction as the write, so sequential edits on one device never lose a label, and remote ops are applied live so the window is only the offline period. Deleting a label removes its id from every carrying task with one op per task; a concurrent array write elsewhere can resurrect the id, which is why deleted ids are hidden rather than trusted to be absent. Merging a label rewrites each carrying task's array once (source id → target id, de-duplicated) and tombstones the source.

The path to per-element semantics is recorded in `openspec/changes/labels/design.md`: an add-wins set encoded as additional per-element fields would be additive to this schema.

## Winner rule

For a given `(entity, entityId, field)`, an incoming op replaces the stored value when

```
op.ts > cur.ts  OR  (op.ts == cur.ts AND op.device > cur.device)
```

The same comparison runs in Go (`internal/sync.Wins`) and TypeScript (`web/src/lib/hlc.ts`).

## Clocks

Each device stamps ops with `max(Date.now() + offset, last + 1)`, so its own timestamps are strictly increasing even if the system clock jumps back. After every exchange the client compares `serverTime` with its clock and adopts the offset when the skew is over two seconds. The server clamps any `ts` more than five minutes ahead of its own clock.

## Exchange

`POST /api/v1/sync`

```json
{ "device": "3c54…", "cursor": 140, "ops": [ …pending ops… ] }
```

Response:

```json
{
  "applied": 3, "duplicates": 0,
  "ops": [ …ops with seq > 140 not authored by this device… ],
  "cursor": 158, "hasMore": false, "serverTime": 1760060001000
}
```

Client loop (`web/src/lib/sync.ts`):

1. Read up to 500 ops from the outbox and the stored cursor.
2. Send; on success delete those outbox rows, apply the returned ops with the winner rule, store the new cursor.
3. Repeat while `hasMore` or the outbox is not empty.

Triggers: 250 ms after a local edit, on `online`, when the tab becomes visible, every 30 s, and manually from the status pill.

Server (`internal/sync.Apply`): validate the whole batch, then in one transaction `INSERT OR IGNORE` each op into `ops` (duplicate ids are counted, not re-applied) and upsert `fields` under the winner rule. `Pull` returns ops after the cursor in `seq` order, skipping the caller's own device but still advancing the cursor past them.

## Deletes

Deletion sets `deleted_at`. Lists filter tombstones out; export includes them. Because a tombstone is just another field under LWW, a delete made on one device wins over older edits from another and the entity never reappears.

## Trees: subtasks

`task.parent_id` encodes a tree in an LWW register, so two devices can move tasks concurrently. The tree is **derived** from the current field values; no repair op is ever written, which keeps the result independent of arrival order.

- **Cascades are per-task ops.** Completing a parent writes `completed_at` on every open descendant; deleting a parent writes `deleted_at` on every descendant; moving a parent to another project writes `project_id` on every descendant. Each is a normal op, so a concurrent edit on one descendant still resolves field by field (a rename of a deleted subtask survives in the export, the tombstone stays). Reopening a parent does not cascade.
- **Inconsistent parents render at the top level.** A subtask whose parent is missing locally, deleted, completed (while the child is open) or in another project is shown at the top level of its project with a breadcrumb when the parent is known. When the parent's ops arrive or it is reopened, the child nests again.
- **Cycle breaking.** If moves on two devices produce a cycle (`X` under `Y` and `Y` under `X`), every client breaks it identically: among the members of the cycle, the task whose `parent_id` has the newest clock under the winner rule (`ts`, then `device`, then id as a last resort) is treated as a root. The user sees it at the top level and can move it again. The REST API additionally rejects a `parent_id` that would close a cycle or cross projects (`400 invalid_input`), because REST requests are sequential against current state; sync batches are never rejected for tree reasons.

The implementation lives in `web/src/lib/tree.ts` (generic `buildTree`, `descendants`, `isDescendant`, cycle breaking) and `web/src/lib/subtasks.ts` (progress and display state).

## REST writes

REST handlers translate request bodies into ops stamped with server time and `device: "server"`, then call the same `Apply`. There is exactly one write path.

## Limits

- 1000 ops per request, 64 KB per value, 4 MB per request body.
- `labels` is replaced as a whole value (see "Task labels" above; set semantics are a future change).
