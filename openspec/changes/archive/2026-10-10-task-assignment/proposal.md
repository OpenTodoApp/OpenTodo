# Proposal

## Why

A shared project answers "what needs doing" but not "who is doing it". Without assignees two people either duplicate work or keep a side channel to split it. Assignment is the smallest collaboration primitive on top of sharing: one additive task field, a cross-project "Assigned to me" view, and the first hook that later notification and webhook changes will plug into.

## What Changes

- A task in a shared project can be assigned to exactly one member of that project (or to nobody). Personal tasks may only be assigned to their owner or left unassigned.
- New additive task field `assignee_id` in the op schema, synced like any other field with last-writer-wins.
- The server validates assignments against the project's membership at receipt time, rejecting them per operation the same way `project-sharing` rejects unauthorized writes, so offline assignments to someone who has since left converge deterministically.
- When a member is removed or leaves, every task assigned to them in that project is unassigned by server-written operations, so all devices converge without client cooperation.
- "Assigned to me" view across all projects, assignee shown on task rows, assignment from the detail panel and the keyboard.
- A notifications hook: assigning a task to someone other than yourself emits an internal event that produces an in-app notification for the assignee; the same event is the extension point for `reminders` (web push) and `webhooks`. No external calls in this change.

Depends on `project-sharing` (membership, scopes, per-op rejection); it cannot be applied before that change is archived.

Out of scope: multiple assignees, assigning to people outside the project, due-date delegation, workload views, email or push delivery (`reminders`), outbound delivery (`webhooks`).

Advances ROADMAP.md section 5 "Assignees" (`task-assignment`).

No new environment variables. Op log change is additive only (one new nullable field), not **BREAKING**.

## Capabilities

### New Capabilities
- `task-assignment`: the assignee field and its validation, the assigned-to-me view, unassignment on member departure, and the notification hook.

### Modified Capabilities
- `task-management`: "Task fields" gains the optional assignee in the field list; existing scenarios are unchanged.

## Impact

- Server: `assignee_id` in the op schema with membership validation in `internal/sync`; unassign-on-departure in the membership handlers; `internal/notify` interface with an in-app implementation; `GET /api/v1/notifications` and mark-read route.
- Client: `assignee_id` in types and op defaults, assignee picker, task row avatar, "Assigned to me" view and shortcut, notification badge.
- Docs: `docs/sync.md` schema table, `docs/api.md`.
- Dependencies: none.
