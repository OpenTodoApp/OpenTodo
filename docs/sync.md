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
| task | `estimate_minutes` | integer 1–10080 (minutes) or null |
| task | `recurrence` | recurrence rule string (at most 200 characters, must parse under [the grammar](recurrence.md)) or null |
| task | `series_id` | string (task id) or null |
| label | `name`, `color` | string |
| label | `position`, `created_at` | number |
| label | `deleted_at` | number or null |

Adding fields is backwards compatible. Renaming or removing is not; it needs an OpenSpec change with a migration plan.

A client that receives an op for an entity it does not know (an older build talking to a newer server) ignores it without failing the batch; the cursor still advances.

### Recurring tasks

`task.recurrence` holds a rule such as `every last weekday`; the server rejects an op whose value does not parse (any spelling the grammar accepts is valid, clients store the canonical form). Completing a recurring task is not a single `completed_at` op: the client writes, in one batch, a new *occurrence record* (a task with the series' fields, `completed_at` set, `recurrence: null` and `series_id` pointing at the series) and a `due` op on the series moving it to the next occurrence. The record's id is not random: it is `NameID("occurrence", seriesId + ":" + occurrenceDate)` (SHA-256, formatted as a version 8 UUID; `internal/ids` and `web/src/lib/ids.ts`), and the next due date is a pure function of the rule and dates every device shares. Two devices that complete the same occurrence offline therefore write the same entity and the same `due` value, and LWW only chooses between identical values; Completed shows one entry. "This occurrence only" uses `seriesId + ":detach:" + date` so a copy never collides with a completion. See [recurrence.md](recurrence.md).

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

Triggers: 250 ms after a local edit, on `online`, when the tab becomes visible, on a live wake-up (below), on every (re)connection of the live channel, periodically (every 30 s, relaxed to 5 min while live updates are connected), and manually from the status pill.

Server (`internal/sync.Apply`): validate the whole batch, then in one transaction `INSERT OR IGNORE` each op into `ops` (duplicate ids are counted, not re-applied) and upsert `fields` under the winner rule. `Pull` returns ops after the cursor in `seq` order, skipping the caller's own device but still advancing the cursor past them.

## Live updates

Polling alone would leave a change made on one device invisible on another for up to 30 s. The server therefore offers a wake-up channel: an authenticated server-sent event stream per device.

`GET /api/v1/sync/events?device=3c54…` (same session cookie or bearer token as every other route; `device` is required, 400 `bad_request` without it)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no

: connected

event: ops
data: {"cursor":158}

: ping
```

- **Payload.** An `ops` event carries only the user's latest `seq`. It never contains op values, field names or entity ids, so the stream is safe to log and proxy. Data still travels exclusively through the exchange above: on an `ops` event the client compares the cursor with its stored one and runs an exchange only when it is newer. A lost event is harmless.
- **Exclusion.** The server wakes every subscription of the user except the one whose `device` equals the device that pushed the ops, so a device never re-syncs because of its own push. REST writes are stamped `device: "server"` and wake every device.
- **Heartbeat.** An idle stream writes a comment line `: ping` every 25 s, below the idle timeouts of common reverse proxies. On every heartbeat the server re-validates the session or token; a revoked one ends the stream within one interval, and the next connection attempt gets 401.
- **Limits.** At most 16 concurrent streams per account; opening one more closes the oldest instead of refusing the new one, so a device reconnecting after a half-closed connection is never locked out. Open streams are closed on graceful shutdown so clients reconnect to the new process.
- **Client lifecycle** (`web/src/lib/sync.ts`): `startSync()` opens an `EventSource` after sign-in, `stopSync()` closes it. On `open` the client syncs once to cover anything missed and marks `live: true` in the status snapshot; on `error` it closes the source and reconnects with jittered exponential backoff (1 s base, 30 s cap). No connection is attempted while offline; the `online` event starts one.
- **Fallback.** Periodic polling continues: every 30 s while the channel is disconnected, every 5 min while it is connected. A client that never opens the stream keeps working exactly as before.

Implementation: `internal/sync.Notifier` is an in-memory, per-user subscriber set with a one-slot channel per stream (a slow reader coalesces wake-ups into the newest cursor and never blocks `Apply`); the sync handler and the REST write-through call `Notify` after a committed `Apply`. One process is the deployment contract, so there is no cross-process fan-out.

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
- `labels` is replaced as a whole value (see "Task labels" above; set semantics are a future change).
