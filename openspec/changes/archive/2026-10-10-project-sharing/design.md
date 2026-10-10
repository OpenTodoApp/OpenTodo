# Design

## Context

The op log (`ops`), the materialized values (`fields`) and every read are keyed by `user_id`; `Pull` is `WHERE user_id = ? AND seq > ?`. Membership and permissions do not exist. Clients hold a single integer cursor, upload from an outbox, and treat any non-200 sync response as a retryable error, so a permanently refused op would wedge the outbox. `seq` is already one global `AUTOINCREMENT` across all users, which is the property the design below leans on.

Constraints: local-first (members edit offline), convergence without manual resolution, no write path around the op log, auth by default, no new mandatory configuration, keep old clients working.

## Goals / Non-Goals

**Goals**
- Scope ops so a shared project is one log that all members read and write, with roles enforced server-side.
- Keep one cursor per device and keep the request format unchanged.
- Make permission changes for offline members deterministic.
- Lay the scoping foundation that `task-assignment`, `comments-and-activity` and `activity-feed` reuse unchanged.

**Non-Goals**
- Invitations, cross-server sharing, public links, per-task sharing, end-to-end encryption of shared scopes.

## Decisions

### D1. Scopes: a label on every op, not a second log
Every op and every materialized field row gets a `scope_id`: `user:<userId>` for personal data, `project:<projectId>` for a shared project. `ops.user_id` keeps its column and becomes "author" (needed later for activity). `Pull` becomes `WHERE scope_id IN (<caller's scopes>) AND seq > ? ORDER BY seq`. Because `seq` is global, one cursor per device still totally orders everything a device may see.
- Why: minimal change to the engine; LWW is unaffected (the winner clock is still per `(entity, entityId, field)`, now inside a scope); REST reads become "fields in my scopes".
- Alternatives: (a) per-scope cursors, i.e. `cursor` becomes a map. Rejected: changes the request format, forces every client to migrate, and gains nothing since `seq` is global. (b) Copying shared ops into each member's personal log. Rejected: N copies per op, ids collide, and a member added later needs the whole history copied anyway.

### D2. Which scope an incoming op belongs to
- `project` ops: `project:<id>` if a scope row exists for that project, else the author's personal scope.
- `task` ops: the scope of the task's `project_id`, taken from the same batch when the task is being created, else from the stored value. Inbox tasks are personal.
- A `project_id` op whose target lies in a different scope than the task currently lives in is refused with reason `scope_change`. The client implements "move to another scope" as copy + tombstone (new id in the destination, `deleted_at` on the original). This keeps "who can see this task" immutable, which is what makes removal, catch-up and authorization simple.
- Sharing a project for the first time runs one transaction that creates the scope and relabels the existing rows of the project and of its tasks from `user:<owner>` to `project:<id>` (an `UPDATE scope_id`, not a rewrite of op content; `seq` and `op_id` are untouched). Unsharing is never relabelled back; a scope whose only member is the owner behaves exactly like personal data.

### D3. Authorization is evaluated at receipt, per op, and reported, not errored
`Apply` checks each op against `project_members` at that moment: viewer → no writes; editor → `task` entity only; admin → `task` plus `project` fields except `deleted_at`; owner → everything. Refused ops are collected into `rejected: [{id, reason}]` in the 200 response and never inserted. Allowed ops in the same batch are applied.
- Why receipt time: the server is the single authority on membership, so "membership when the server saw it" is the only clock all devices agree on. Evaluating against `op.ts` would let a client backdate edits into a window where it still had rights.
- Why per op: a batch-level 400 would make the outbox retry for ever (poison op). Per-op reporting lets the client drop exactly the refused ops.
- Client side: on a rejected op the client deletes the outbox row, clears the local winner clock for that `(entity, id, field)`, and re-applies the server's value. The server includes the current winning op for each refused field in the same response's `ops` so the device needs no extra round trip. Local state therefore equals server state after one exchange.
- Old clients: they already delete outbox rows on any 200, so refused ops are not retried; they merely cannot restore the field until the next pull delivers a newer value. Since an old client cannot have been added to a shared project without a newer client existing somewhere, this is acceptable and documented.

### D4. Catch-up for a newly added member: replay history behind the cursor
`project_members` carries `backfill_seq` (nullable). On add it is set to 0. `Pull` first serves ops from scopes with pending backfill (`scope_id = ? AND seq > backfill_seq ORDER BY seq`), advancing `backfill_seq` and reporting `hasMore = true` until exhausted, then serves the regular query. The response `cursor` is unchanged during backfill pages and continues from the regular query afterwards, so it stays monotonic.
- Why history and not a snapshot of `fields`: real op ids (idempotent on retry), and the later activity log needs the history on the member's device too. Pages of 1000 bound each request.
- Membership presence: the response always includes `memberships: [{projectId, role, ownerId, members: [{userId, name, role}]}]` for the caller. It is small, stateless and lets the client detect removals (a project missing from the list that is marked shared locally → purge). No separate version counter needed.

### D5. Membership lives outside the op log
`project_members(project_id, user_id, role, added_by, created_at, backfill_seq)` is authorization data, like sessions and tokens, changed only through authenticated REST routes with server-side checks. It is not an op because it must not be writable from an offline device by LWW (two offline owners "transferring" would otherwise race). Clients cache it in a `memberships` table in the local database for offline rendering; the server copy wins on every sync.

### D6. Data-model impact (additive)
- Migration `0002_sharing.sql`: `ALTER TABLE ops ADD COLUMN scope_id TEXT NOT NULL DEFAULT ''` then backfill `'user:'||user_id`; index `ops_scope_seq(scope_id, seq)`; unique index `ops_scope_op(scope_id, op_id)`. `fields` is rebuilt with primary key `(scope_id, entity, entity_id, field)` and backfilled the same way. New tables `project_scopes(project_id PRIMARY KEY, owner_id, created_at)` and `project_members`.
- Op format: no field added, renamed or removed. Sync request unchanged. Sync response gains optional `rejected` and `memberships`.
- Export gains `role` and `owner_id` on shared projects (new keys only).

### D7. REST
`GET/POST /api/v1/projects/{id}/members`, `PATCH/DELETE /api/v1/projects/{id}/members/{userId}`, `POST /api/v1/projects/{id}/transfer`, all behind `requireAuth`. Non-members get 404 to avoid confirming the project exists. Adding by exact email only: there is no account directory route, so a member cannot enumerate users. Collection handlers union the caller's scopes and enforce the same role table as `Apply` for PATCH/DELETE; REST writes continue to go through `Apply` with `device="server"`.

### D8. Deleting a shared project
Owner only. The client emits `deleted_at` on the project and on its tasks (all in the project scope), and creates copies of the open tasks in the owner's personal scope. The copy happens on the owner's device so it works offline; the other members only ever see tombstones. The project-organization behaviour "open tasks move to the Inbox" is preserved for the owner.

### Dependencies and footprint
No new Go or npm dependency. Container image size unchanged; runtime memory unchanged apart from one small membership cache per request. Bundle grows by the share dialog and membership cache (~3 KB gzipped estimated).

## Risks / Trade-offs

- [A member's offline edits are silently discarded after a downgrade] → The client surfaces a one-line notice "N changes were not accepted (your role in <project> changed)" with the affected task titles; the data is still visible in the local outbox until dropped, and the activity log change will later expose it as history.
- [Relabelling on first share touches many rows] → One transaction, indexed by `(scope_id, entity, entity_id)`; measured cost is linear in the project's ops and runs once per project.
- [History replay for a big project is slow for a new member] → Paged at 1000 ops; the UI shows "catching up" from `hasMore`; a later compaction change can replace replay by a snapshot when history is not needed.
- [`scope_change` rejections surprise third-party API scripts that PATCH `project_id`] → The REST PATCH returns 400 `scope_change` with a message pointing to copy + delete; documented in `docs/api.md`.
- [Old client on a shared project] → Cannot restore refused fields immediately (see D3); the next pull of a newer value fixes it; minimum client version is noted in the release notes.
- [Membership list in every sync response] → A few hundred bytes for typical use; if it ever matters, an `If-None-Match`-style hash can be added without breaking anyone.

## Migration Plan

1. Deploy: migration 0002 runs at start-up, backfills scopes, rebuilds `fields`. No data loss; rollback is restoring the pre-upgrade database file.
2. Old clients keep syncing personal data unchanged.
3. New clients add the `memberships` table on first load; nothing to migrate locally.

## Open Questions

- Should admins be allowed to transfer ownership on the owner's behalf when the owner account is disabled? Deferred to `audit-log`/account administration.
- Whether `project-hierarchy` should forbid nesting a shared project under a personal one or inherit the scope; to be decided in that change.
