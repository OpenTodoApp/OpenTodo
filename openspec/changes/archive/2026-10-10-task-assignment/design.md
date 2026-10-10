# Design

## Context

Builds on `project-sharing`: scopes, `project_members`, per-op authorization at receipt time, `rejected` in the sync response, and the client's rejection handling (drop outbox row, restore server value). Those mechanisms are reused as-is; this change adds one task field, one validation rule, one server-side reaction to membership changes, and a notification sink.

## Goals / Non-Goals

**Goals**
- One assignee per task, validated against membership, convergent offline.
- Zero client logic for departures: the server writes the unassignments.
- A single internal event for "assigned" that later changes extend without touching the sync engine.

**Non-Goals**
- Multiple assignees, assignment history views (the activity log covers it), delivery of notifications outside the app.

## Decisions

### D1. `assignee_id` as a nullable string field on `task`
Added to the op schema as `kNullableString`, to the TypeScript types and to the op defaults (`null`). Additive: old clients validate against the server, not locally, and they store unknown fields they receive, so they keep syncing. It is a plain LWW register; "last assignment wins" is the behaviour users expect.
- Alternative: a separate `assignments` entity with its own lifecycle. Rejected: more ops per assignment, no benefit while there is one assignee.

### D2. Validation at receipt time, per op, reusing the rejection channel
In `Apply`, for an `assignee_id` op whose value is non-null: if the task's scope is `project:<id>`, the value must be a current member of that project; if personal, it must equal the author. Failures produce `rejected: [{id, reason: "not_a_member"}]` plus the current winning value in `ops`, exactly like `forbidden` in `project-sharing`. Deterministic because membership is server-only.

### D3. Departure writes unassign ops with `device="server"`
The remove/leave handlers, in the same transaction as the membership change, select tasks in that scope with `assignee_id == departed` and apply `assignee_id=null` ops stamped with server time. These are ordinary ops: every device, online or not, receives them and LWW resolves them (an offline device's older assignment to the departed member loses by timestamp; a newer one is rejected by D2 anyway). No client code path is needed for convergence.

### D4. Notification hook: an in-process interface with one implementation
`internal/notify.Sink` with `Assigned(ctx, event)`; `Apply` calls it after commit for assignments where `assignee != author`. The only implementation here writes to a new `notifications(id, user_id, kind, payload, created_at, read_at)` table and serves it via REST. `reminders` and `webhooks` will register further sinks. Events are emitted after commit so a sink can never block or roll back a sync.
- Alternative: have clients derive notifications from pulled ops. Rejected: a device that was off would miss nothing but the assignee would never learn about assignments made while they had no device open, and push/webhook delivery needs a server-side event anyway.

### D5. "Assigned to me" is a pure local query
A live query over local tasks `where assignee_id == me and completed_at == null and deleted_at == null`, grouped by project, like Today. Shortcut `g a`; assign shortcut `a` on a selected task opens the picker. No server round trip, so it works offline.

### Data-model impact
- Op schema: `task.assignee_id` (nullable string). No renames, no removals.
- Tables: `notifications` (new). No change to `ops`/`fields` beyond the new field value rows.
- REST: `assignee_id` accepted in POST/PATCH `/tasks` with the same validation; `GET /api/v1/notifications`, `POST /api/v1/notifications/{id}/read`.

### Dependencies and footprint
No new dependency. Image size and server memory unchanged. Client bundle +2 KB gzipped (picker, view, badge).

## Risks / Trade-offs

- [Member removed while an offline device assigns to them] → D2 rejects on arrival and D3 already cleared earlier assignments; the device shows the restored value and the standard "changes not accepted" notice.
- [Server-written unassign ops carry server time and could lose to a far-future client timestamp] → Clamping to five minutes bounds the window; the arriving op is rejected by D2 regardless, so the field converges on `null` after the next exchange.
- [Notification table grows] → Rows are tiny; a retention sweep (read and older than 90 days) runs at start-up; no configuration needed.
- [Assignment is noisy in the activity log] → `comments-and-activity` treats `assignee_id` as a first-class event ("assigned to Bob").

## Migration Plan

Migration `0003_assignment.sql` adds the `notifications` table. Existing tasks have no `assignee_id` row, which reads as `null`. Rollback: restore the database file; the field is ignored by older binaries because unknown fields in `fields` are simply not in their schema.

## Open Questions

- Whether assigning should also follow the task when it is copied across scopes (currently the copy keeps `assignee_id` only if the assignee is a member of the destination; otherwise it is cleared on the client).
