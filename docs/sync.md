# Sync protocol

OpenTodo syncs with a field-level, last-writer-wins operation log. It is a state-based CRDT (a map of LWW registers), which gives three properties:

- **Convergence**: replicas that have seen the same ops hold the same state, in any order.
- **Idempotency**: applying an op twice changes nothing.
- **Offline safety**: ops can be produced without the server and merged later.

## Operation

```json
{
  "id": "0d1f…",                 // unique per op (UUID v4)
  "entity": "task",              // "task" | "project"
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
| task | `labels` | array of strings |
| task | `position`, `created_at` | number |
| task | `completed_at`, `deleted_at` | number or null |

Adding fields is backwards compatible. Renaming or removing is not; it needs an OpenSpec change with a migration plan.

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

## Trees: sub-projects

`project.parent_id` encodes the project tree with the same LWW register and the same derived-tree rules; `web/src/lib/projects.ts` builds it on `tree.ts`.

- **Moves are two ops.** A move writes `parent_id` and a `position` after the new siblings. Two devices moving the same project resolve each field by the winner rule.
- **Cascades are per-project ops.** Archiving writes `archived=true` on every descendant; deleting writes `deleted_at` on the project, `parent_id = <its parent>` on each direct sub-project and `project_id = null` on each of its open tasks. Unarchiving does not cascade. Because each project's `archived` is its own register, a sub-project moved out on one device while its parent is archived on another ends up archived at the top level when the archive op is newer, and open at the top level otherwise, identically everywhere.
- **Missing parents render at the top level.** A project whose parent is not present locally, deleted or archived is shown as a top-level project until the parent appears; nothing is written.
- **Cycle breaking.** Two offline devices can move `X` under `Y` and `Y` under `X`. Every client breaks the cycle identically: the member whose `parent_id` has the newest clock under the winner rule (`ts`, then `device`, then id as a last resort) is displayed at the top level, the others stay nested beneath it, and no repair op is written. The user can move it again with one action. The REST API rejects a `parent_id` that would close a cycle (`400 invalid_input`) because REST requests are sequential against current state; sync batches are never rejected for tree reasons.
- **Collapse state is local.** Which projects are collapsed in the sidebar lives in the device's `meta` table and never enters the op log.

## REST writes

REST handlers translate request bodies into ops stamped with server time and `device: "server"`, then call the same `Apply`. There is exactly one write path.

## Limits

- 1000 ops per request, 64 KB per value, 4 MB per request body.
- `labels` is replaced as a whole value (set semantics are a future change).
