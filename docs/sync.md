# Sync protocol

OpenTodo syncs with a field-level, last-writer-wins operation log. It is a state-based CRDT (a map of LWW registers), which gives three properties:

- **Convergence**: replicas that have seen the same ops hold the same state, in any order.
- **Idempotency**: applying an op twice changes nothing.
- **Offline safety**: ops can be produced without the server and merged later.

## Operation

```json
{
  "id": "0d1f…",                 // unique per op (UUID v4)
  "entity": "task",              // "task" | "project" | "label" | "view" | "reminder"
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
| task | `due` | `{"date":"YYYY-MM-DD","time":"HH:MM"?,"tz":"Area/City"?}` or null; `tz` (a known IANA zone, at most 64 characters) only together with `time`, see [Zoned due values](#zoned-due-values) |
| task | `labels` | array of strings (label ids, see below) |
| task | `position`, `created_at` | number |
| task | `completed_at`, `deleted_at` | number or null |
| task | `estimate_minutes` | integer 1–10080 (minutes) or null; with `due.time` it forms a calendar block (time-blocking) |
| task | `recurrence` | recurrence rule string (at most 200 characters, must parse under [the grammar](recurrence.md)) or null |
| task | `series_id` | string (task id) or null |
| task | `assignee_id` | string (account id) or null; checked against the task's scope at receipt (see "Assignment" under [Sharing scopes](#sharing-scopes)) |
| label | `name`, `color` | string |
| label | `position`, `created_at` | number |
| label | `deleted_at` | number or null |
| view | `name`, `query`, `color` | string |
| view | `kind`, `group_by`, `sort_by`, `sort_dir` | string (enumeration, see "Saved views") |
| view | `pinned` | boolean |
| view | `panels` | array of strings (view ids) |
| view | `position`, `created_at` | number |
| view | `deleted_at` | number or null |
| reminder | `task_id` | string (task id, required) |
| reminder | `kind` | `"relative"` or `"absolute"` |
| reminder | `offset_minutes` | integer −525600…525600 (minutes from the due time, negative = before) or null |
| reminder | `fire_at` | positive number (Unix ms, the resolved firing instant) or null |
| reminder | `delivered_at`, `dismissed_at` | number or null |
| reminder | `created_at` | number |
| reminder | `deleted_at` | number or null |

Adding fields is backwards compatible. Renaming or removing is not; it needs an OpenSpec change with a migration plan.

A client that receives an op for an entity it does not know (an older build talking to a newer server) ignores it without failing the batch; the cursor still advances.

### Zoned due values

`due` is floating by default: a calendar date and optional wall-clock time that mean the same day and clock time wherever the task is viewed. A due with a `tz` key is *zoned* (OpenSpec change `absolute-datetimes`): `{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}` denotes the instant 09:00 in Berlin on that day. The zone lives inside the value, not in a separate field, so the whole due is one last-writer-wins register: a concurrent floating edit and zoned edit converge on one complete value, never a date from one and a zone from the other.

- The server accepts `tz` only with `time` and only as a zone name it knows (Go's embedded zone database); otherwise the op is rejected like any invalid value. It stores the raw JSON, so servers that predate `tz` also store and serve it untouched, and clients that predate it read `date` and `time` and keep `tz` unless the user edits the due.
- The value is wall time plus zone, not an epoch: it is resolved with the zone's rules in force on that date, so it follows daylight-saving changes and future rule updates. A wall time inside a spring-forward gap resolves to the first valid instant after the gap (02:30 on a 02:00→03:00 day is 03:00); one inside an autumn overlap resolves to its first occurrence. `internal/zoned` (Go) and `web/src/lib/dates.ts` implement the same rules and run the shared vectors in `web/src/lib/zoned.vectors.json`.
- Clients show, sort and group a zoned due by its date and time converted to the viewer's zone (Today, Upcoming, saved views, filters and the calendar grid all use the converted value) and show the original wall time and zone as a hint when the viewer is in another zone. Clearing the time of a zoned due drops `tz`.
- Recurring series keep `time` and `tz` as `date` rolls forward; relative reminders fire relative to the zoned instant.

### Recurring tasks

`task.recurrence` holds a rule such as `every last weekday`; the server rejects an op whose value does not parse (any spelling the grammar accepts is valid, clients store the canonical form). Completing a recurring task is not a single `completed_at` op: the client writes, in one batch, a new *occurrence record* (a task with the series' fields, `completed_at` set, `recurrence: null` and `series_id` pointing at the series) and a `due` op on the series moving it to the next occurrence. The record's id is not random: it is `NameID("occurrence", seriesId + ":" + occurrenceDate)` (SHA-256, formatted as a version 8 UUID; `internal/ids` and `web/src/lib/ids.ts`), and the next due date is a pure function of the rule and dates every device shares. Two devices that complete the same occurrence offline therefore write the same entity and the same `due` value, and LWW only chooses between identical values; Completed shows one entry. "This occurrence only" uses `seriesId + ":detach:" + date` so a copy never collides with a completion. See [recurrence.md](recurrence.md).

### Reminders

A `reminder` belongs to one task (`task_id`) and fires at `fire_at`, always a resolved instant (OpenSpec change `reminders`). An *absolute* reminder keeps the moment the user picked. A *relative* reminder also stores `offset_minutes` and its `fire_at` is the task's due time plus the offset, a date-only due counting as 09:00 in the computing device's time zone and a zoned due counting as its own instant; with no due date `fire_at` is null and it does not fire. The device that changes a task's `due` (an edit, a reschedule, a recurring series completing, skipping or detaching) writes a `fire_at` op for every live relative reminder of the task **in the same batch, with the same timestamp and device** as the `due` op, so LWW always takes the due date and the firing times from the same edit. When the firing moves it also clears `delivered_at` and `dismissed_at`. REST `PATCH /api/v1/tasks/{id}` that changes `due` does the same server-side, in the owner's last reported zone offset (the `tzOffset` field of the sync request) or UTC until one was reported; a zoned due uses its own zone.

- *Snooze* writes a new `fire_at` and clears `delivered_at` and `dismissed_at`; *dismiss* writes `dismissed_at`. Both are ordinary ops, so they queue offline and converge per field.
- `delivered_at` is written by the server (device `server`) when it pushed the reminder. A delivery or dismissal **older than `fire_at`** belongs to an earlier firing and does not count, so a snooze or due change racing the server's delivery op still fires again.
- A reminder is shown when `fire_at` ≤ now, it is not deleted, not dismissed for the current firing, and its task exists and is neither completed nor deleted.
- Reminders are **personal**: every reminder op is stored in its author's personal scope (`user:<id>`), also when the task is in a shared project, so only the author's devices receive it and any member, viewers included, can keep reminders on a shared task. Because another member's device cannot write them, a device that pulls a `due` change for a task in a shared project recomputes its own relative reminders for that task (new ops, not the same batch). A REST due change recomputes only the caller's reminders.
- Push subscriptions are device state on the server (`push_subscriptions`), never ops, and are not exported.

### Task labels

`task.labels` is an array of **label ids**, not names. Renaming or recolouring a label is therefore one op on the label and never touches a task. Ids that point at a deleted label, or at a label this device has not received yet, are kept in the array but not displayed; the chip appears as soon as the label arrives.

The array is a single LWW register: every write replaces the whole value, and when two devices write different arrays for the same task offline, every replica ends with the array that carries the greater `(ts, device)`. Concretely, if device A adds `errand` and device B adds `call` to the same task while both are offline, only one of the two labels survives on every device. To keep the common case safe the client reads the task's current array in the same transaction as the write, so sequential edits on one device never lose a label, and remote ops are applied live so the window is only the offline period. Deleting a label removes its id from every carrying task with one op per task; a concurrent array write elsewhere can resurrect the id, which is why deleted ids are hidden rather than trusted to be absent. Merging a label rewrites each carrying task's array once (source id → target id, de-duplicated) and tombstones the source.

The path to per-element semantics is recorded in `openspec/changes/labels/design.md`: an add-wins set encoded as additional per-element fields would be additive to this schema.

### Saved views

A `view` is a saved filter query with its presentation options (OpenSpec `custom-views`). It is the first synced entity that holds a preference rather than task content, and it follows the same per-field LWW rules: changing the grouping on one device and the sort on another, both offline, leaves every device with both changes.

- `query` is the query string exactly as typed, in the grammar of `docs/filters.md`, never a parsed form. Each client parses it when the view is shown; a query a client cannot parse (for example a term added by a newer version) shows the parse error and no results instead of wrong results.
- `kind` is `list` or `dashboard`; `group_by` is `project`, `due`, `priority`, `label` or `none`; `sort_by` is `due`, `priority`, `position`, `created` or `title`; `sort_dir` is `asc` or `desc`. On the wire these are plain strings so a future value is additive. The op schema accepts any string; a client that meets a value it does not know shows the default (`list`, `project`, `due`, `asc`) without rewriting the field, so the newer device keeps its choice. Only the REST API rejects unknown values, because REST requests are sequential and safe to refuse.
- `panels` holds the ordered view ids shown by a dashboard (empty for lists). Like `task.labels` it is a single LWW register: two devices editing the panel list offline end with the newer list. A panel whose view is missing or deleted is shown as a placeholder; clients refuse to add a dashboard as a panel.
- The start view (the view a device opens on launch) is **not** synced: it lives in the device's `meta` table under `startView`, like the collapsed projects.

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
  "cursor": 158, "hasMore": false, "serverTime": 1760060001000,
  "generation": "4f1c0a9e2b7d4c55a1e0f3b2c8d9e7f6",
  "rejected": [ { "id": "op-17", "reason": "forbidden" } ],
  "memberships": [ { "projectId": "…", "role": "editor", "ownerId": "…",
                     "members": [ { "userId": "…", "name": "Alice", "email": "…", "role": "owner" } ] } ],
  "purged": [ { "entity": "task", "entityId": "…" } ],
  "trashRetentionDays": 30
}
```

`rejected` and `memberships` are additive (see [Sharing scopes](#sharing-scopes)); so are `purged` and `trashRetentionDays` (see [Purge](#purge)). Older clients ignore them.

Client loop (`web/src/lib/sync.ts`):

1. Read up to 500 ops from the outbox and the stored cursor.
2. Send; on success delete those outbox rows, apply the returned ops with the winner rule, store the new cursor.
3. Repeat while `hasMore` or the outbox is not empty.

Before storing the cursor the client compares `generation` with the one it stored; see [Log generation](#log-generation).

Triggers: 250 ms after a local edit, on `online`, when the tab becomes visible, on a live wake-up (below), on every (re)connection of the live channel, periodically (every 30 s, relaxed to 5 min while live updates are connected), and manually from the status pill.

Server (`internal/sync.Apply`): validate the whole batch, then in one transaction resolve each op's scope, refuse the ones the author may not write (reported in `rejected`), `INSERT OR IGNORE` the others into `ops` (duplicate ids are counted, not re-applied) with their scope in `op_scopes`, and upsert `scope_fields` under the winner rule. `Pull` returns ops after the cursor from every scope the caller can see in `seq` order, skipping the caller's own device but still advancing the cursor past them.

## Sharing scopes

Every op and every materialized field belongs to one scope (OpenSpec `project-sharing`): `user:<userId>` holds a user's Inbox, unshared projects, labels and saved views; `project:<projectId>` holds a shared project and its tasks. `ops.user_id` is the op's author. Because `seq` is one global sequence, a device keeps a single cursor across all the scopes it can see, and the request format is unchanged.

- **Which scope an op belongs to.** A project op goes to the project's scope once it is shared, otherwise to the author's personal scope. A task op goes to the scope the task already lives in; a new task goes to the scope of the `project_id` sent in the same batch (no project = Inbox = personal). Labels and views are always personal.
- **A task never changes scope.** A `project_id` that would move a task into another scope is refused with reason `scope_change`. Clients move across scopes by copying the task (new id) into the destination and tombstoning the original; deleting a shared project tombstones the project and its tasks and the owner's device copies the open tasks into the owner's Inbox.
- **First share.** Sharing a project relabels the project and its tasks from the owner's personal scope to the project scope in one transaction. Only the scope label changes; `seq`, op ids and content stay, so the owner's devices keep their cursor.
- **Authorization at receipt.** Each op is checked against the author's membership when the server receives it, never against `op.ts`: viewer → nothing; editor → tasks; admin → tasks and project fields except `deleted_at`; owner → everything; non-members → nothing. A refused op is not stored and is listed in `rejected` with its id and reason (`forbidden`, `scope_change` or `not_a_member`) in a 200 response; the rest of the batch is applied. The response's `ops` also carry the current winning op of every refused field the caller can see, so the device drops its local change and shows the server's value without another round trip. Resending an already refused op gives the same answer.
- **Catch-up for a new member.** A device whose cursor is past part of a project's history when its user joins receives that history first: pages of the project's ops up to the device's cursor at its first exchange after joining, with `cursor` unchanged and `hasMore: true`, then the regular pull. Progress is kept per device (`member_backfills`), so each of the member's devices replays the history once. A replay page lost in transit is not resent; re-syncing from cursor 0 recovers it.
- **Membership** lives outside the op log (`project_members`) and changes only through the REST routes, so offline devices cannot race on it. Every exchange returns the caller's `memberships`; a device purges a project (and its tasks) that it knew as shared and that is no longer listed. A membership change wakes the affected devices with an event that carries no cursor (`data: {}`), so they always run the exchange.
- **Assignment** (OpenSpec `task-assignment`). A non-null `task.assignee_id` must name a current member of the task's shared project, or the author for a task in a personal scope; otherwise the op is refused with reason `not_a_member` (plus the server's value in `ops`, as for `forbidden`). Viewers are refused with `forbidden` like any other write. When a member leaves or is removed, the server writes `assignee_id: null` ops (device `server`, author = whoever removed them) for every task of that project assigned to them, in the same transaction as the membership change and stamped later than the value they replace, so every device converges on "unassigned" without client logic. An assignment to someone other than its author that wins on the server emits an internal assignment event after commit (`internal/notify`), which becomes an in-app notification (`GET /api/v1/notifications`).
- **Older clients** keep syncing their personal data unchanged. They drop refused ops from the outbox like any acknowledged op but only show the server's value once a newer value arrives.

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

## Log generation

The cursor scheme assumes the server's log only grows. A [restore from a backup](backups.md#restore) breaks that: the server goes back to the moment of the backup, its `seq` numbers restart below what devices have seen, and it no longer knows edits made after the backup, although the devices still hold them. The **log generation** makes this visible.

- The server keeps a random 128-bit `generation` in its `settings` table. It is created once with the database and replaced with a new random value by every `opentodo restore`. Every `POST /api/v1/sync` response carries it (an additive field: clients that ignore it keep working, they just do not re-seed).
- The client stores the value in its `meta` table. The first value a device sees is adopted. A different value on any later exchange means the server was restored.
- On a mismatch the client, in one IndexedDB transaction, re-emits **every field of every local row** (projects, tasks, labels, saved views, tombstones included) as a new op `{id: <new uuid>, entity, entityId, field, value, ts: <stored ts>, device: <stored device>}` taken from the row's per-field clock, adds them to the outbox (in chunks of 1,000), sets `cursor = 0` and stores the new generation. Ops already waiting in the outbox stay. The normal loop then uploads the outbox in batches and pulls the whole log from zero. The status pill shows **Re-syncing after restore…** meanwhile.
- **Convergence.** The re-emitted ops carry the clocks the device already stored, not the current time, so the server ends up with exactly the state the device had, and the winner rule decides between devices as usual: an edit made after the backup (newer `ts`) beats the restored value, an older local value loses to a newer one from another device, and two devices re-seeding concurrently converge on the value with the greatest `(ts, device)` everywhere. Fresh op ids keep the server from discarding them as duplicates; unchanged entity ids mean nothing is duplicated. A stale device cannot overwrite newer data, which is why the timestamps are not bumped to now.
- **Offline devices** re-seed on their next successful exchange, however long after the restore.
- **Cost.** A re-seed sends one op per stored field: about 11 per task, so 5,000 tasks are roughly 55,000 ops, a few seconds on a Raspberry Pi, once per device per restore. The server clamps far-future timestamps as always; re-emitted timestamps were already clamped when first stored.

## Deletes

Deletion sets `deleted_at`. Lists filter tombstones out; export includes them. Because a tombstone is just another field under LWW, a delete made on one device wins over older edits from another and the entity never reappears. Restoring from the Trash writes `deleted_at: null`; between a delete and a restore made concurrently, the op with the greater timestamp wins.

Deleting a project writes only the project's tombstone (plus moving its direct sub-projects to its parent). Its tasks keep `project_id` and clients hide every task whose project is deleted, so restoring the project is one op and brings the tasks back exactly as they were. Deleting a shared project additionally tombstones its tasks and copies the owner's open tasks into the owner's Inbox (project-sharing).

## Purge

Purge is the one operation that removes data from the log, and it is not an op (an op would live in the log it removes). An authenticated request (`DELETE /api/v1/{tasks|projects}/{id}/purge`, `POST /api/v1/trash/purge`, or the server's retention job) deletes the entity's rows from `ops`, `op_scopes` and `scope_fields` and inserts a marker into `purges` (`scope_id`, `entity`, `entity_id`, `seq`). Only entities whose `deleted_at` is set can be purged. Purging a project purges every task that references it in the same scope; purging a task purges its deleted descendants; reminders of purged tasks (every member's) are purged too.

Three rules keep replicas convergent:

1. **Markers share the op sequence.** A marker's `seq` is reserved from the same AUTOINCREMENT sequence as ops, so `Pull` reports markers with `seq > cursor` (and, on a partial page, `seq <=` the page's last op) in `purged`, and the returned cursor moves past them. Ops and markers are read in one snapshot. Clients delete the listed rows locally, together with any outbox ops for them.
2. **Late ops are discarded.** `Apply` drops ops for an entity that has a marker in a scope the author can see and counts them as `duplicates`; a device that edited the entity offline therefore cannot recreate a partial copy. Markers are kept indefinitely (a few dozen bytes each).
3. **Purge is requested online only.** The client never deletes locally before the server confirms; offline, the Trash marks the item as pending and nothing is lost if the request fails.

Everyone who can see the purged entity's scope receives the marker and is woken over the live channel. Older clients ignore `purged`; the entity stays tombstoned (invisible) on them.

**Retention.** At startup and every 24 hours the server purges tasks and projects whose `deleted_at` is older than `OPENTODO_TRASH_RETENTION_DAYS` (default 30; `0` disables automatic purge), through the same path. The value is reported as `trashRetentionDays` so the Trash can show remaining days. A database restored from a backup is consistent with itself: markers and the log live in the same database.

## History

`GET /api/v1/{tasks|projects}/{id}/history` reads the entity's ops from the scopes the caller can see, ordered by `(ts, device)` and grouped into change sets of one timestamp and device. An op that arrived after a newer write to the same field is marked `lost`. Restoring an earlier value from the history writes a new op with the current clock, so history stays append-only and the restore converges like any edit.

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
- `labels` is replaced as a whole value (see "Task labels" above; set semantics are a future change). The same holds for `view.panels`.
