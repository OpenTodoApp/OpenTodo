# Proposal

## Why

OpenTodo has no way to say that one task waits for another. People fake it with a `@waiting` label (the docs even recommend `@waiting & open` as a saved view, `docs/views.md`), which nobody clears when the other task is done, and the Linear importer drops `Blocked by` relations with a warning (`openspec/changes/named-importers/design.md:89`). Todoist and Things have no dependencies either, but Linear, Asana and the GTD "waiting for" list do, and the comparison pages concede the gap. The task tree already shows how a reference between tasks can live in the op log without a repair write (`task.parent_id`, `docs/sync.md` "Trees: subtasks"); dependencies can follow the same pattern.

## What Changes

- **One additive field, `task.blocked_by`:** a list of task ids, written through the op log as one whole-array register like `task.labels` (`internal/sync/ops.go:154`, `docs/sync.md` "task.labels is an array of label ids"). Empty by default, at most 50 ids, all tasks of the same sharing scope.
- **Blocked is derived, never written:** a task is blocked while at least one of its blockers is open. Completing or deleting the blocker unblocks every dependent on every device with no further op, exactly as a parent that disappears lifts its subtasks to the top level today (`web/src/lib/tree.ts:61`, "no repair op is ever written").
- **Cycles are refused twice:** the picker on the device never offers a task that already depends on this one, and the server refuses an op that would close a cycle against the current state of the scope, in the way it refuses an assignee who is not a member (`internal/sync/scope.go:313-322`, reason `not_a_member`). Two offline devices that each add one half of a cycle converge on the half that reached the server first; the other device drops its edge from the server's restore op. A cycle that exists only locally for a moment never blocks anything, under the same clock rule as the tree cycle breaker.
- **Blocked tasks are dimmed** in every list and on board cards, with a lock marker and the count of open blockers; they can still be completed. In Today they wait in a collapsed "Blocked" group at the end so the list is what can be done now, and surface when their blocker is completed.
- **Detail panel:** a "Blocked by" row that picks tasks with the same picker as "Parent task", and a derived "Blocks" list. `b` on a selected row opens the picker.
- **Filter terms** `blocked` and `unblocked`, so `blocked` is the GTD waiting-for list and `unblocked & today` the real to-do list.
- **Activity:** a change of `blocked_by` is its own event kind on the server and the device, pinned by the shared fixture.
- **Notification:** when the last open blocker of a task assigned to someone else is completed, that assignee gets an in-app "unblocked" notification through the existing sink (`internal/notify`), like an assignment.
- **CalDAV:** blockers are served as `RELATED-TO;RELTYPE=DEPENDS-ON` (RFC 9253) and read back; today every non-parent `RELATED-TO` goes to `ical_extra` (`internal/caldav/vtodo.go:353-358`).
- **Import:** an own export round-trips `blocked_by`; a profile that carries blocking relations between rows of the same file (Linear's `Blocked by` column once `named-importers` lands) maps them instead of warning.

Out of scope:
- Any scheduling automation: moving a blocker never moves its dependents, and nothing is auto-completed.
- A separate "waiting for a person" field. GTD's waiting-for list is the `blocked` filter; waiting on a person who is not a task stays a label.
- Dependencies across sharing scopes (a shared task blocked by a personal one): other members could never see the blocker, so the state would differ per member.
- Assistant, MCP and `ot` write tools: they keep refusing unknown fields; read results carry `blocked_by` because the REST and MCP task shapes are generic. Push notifications for "unblocked" (the in-app bell only).
- A dependency graph or critical path. The project timeline (`month-and-timeline-views`) draws the arrows.

ROADMAP: advances "Next: Parity and depth" row 6, **Task dependencies** (`task-dependencies`). Refinements to the row's notes: "waiting for" is the inverse reading of `blocked_by` (the "Blocks" list and the `blocked` filter), not a second field; blocked tasks are dimmed in place everywhere except Today, where they sit in a collapsed group; blockers must be in the task's sharing scope.

Nothing here is **BREAKING**: one additive task field, no environment variable, no new route. An older server refuses a batch carrying the unknown field as `invalid_op`, as for every additive field, so the client ships in the same binary.

## Capabilities

### New Capabilities
- `task-dependencies`: the `blocked_by` field and its limits, the derived blocked state, cycle refusal on the device and the server and how concurrent edits converge, the sharing-scope rule, how blocked tasks look in lists, boards, Today and the detail panel, the REST shape, and the unblocked notification.

### Modified Capabilities
- `filter-queries`: new terms `blocked` and `unblocked`.
- `activity-log`: a `dependencies` event kind for changes of `blocked_by`, derived identically on both sides.
- `caldav-sync`: `RELATED-TO;RELTYPE=DEPENDS-ON` maps to `blocked_by` both ways; unresolvable relations stay preserved.
- `data-import`: own exports round-trip dependencies; importer profiles that carry blocking relations between rows map them.

## Impact

- **Op schema:** `task.blocked_by` in `internal/sync/ops.go` `Schema` with a new kind (distinct non-empty ids, at most 50), resolver checks for scope and cycles in `internal/sync/scope.go` (`resolve`, new reasons `cycle` and `not_in_scope`), `restoreOps` already covers task fields. Client: `web/src/lib/types.ts`, `TASK_DEFAULTS` and `COPY_FIELDS` in `web/src/lib/ops.ts`, `docs/sync.md`. Ids are not content: not in `e2ee.ContentFields` / `CONTENT_FIELDS`.
- **Server:** `internal/activity/activity.go` (new kind), `internal/notify` (an `Unblocked` event and optional sink interface, in-app sink), `internal/sync` emission after commit next to `emitAssignments`, `internal/caldav/vtodo.go` and `internal/httpapi/caldav_write.go`, `internal/importer` (own export and a relations pass), REST error mapping in `internal/httpapi/server.go` `writeOps`, `docs/api.md`, `docs/caldav.md`, `docs/import.md`.
- **Web:** a pure `web/src/lib/dependencies.ts` (blocked derivation, cycle check, picker exclusions), `web/src/lib/filter/parse.ts` and `evaluate.ts`, `web/src/lib/activity.ts`, `web/src/lib/history.ts` field list, `web/src/app/TaskRow.tsx`, `TaskListView.tsx` (Today group), `task-detail/Properties.tsx` (two rows), `web/src/lib/shortcuts.ts` (`b`), `NotificationBell.tsx`, `docs/tasks-and-projects.md`, `docs/filters.md`, `docs/views.md`, `docs/keyboard.md`, `docs/notifications.md`.
- **Tests:** `internal/activity/testdata/activity_fixture.json` gains a `blocked_by` case run by both suites; sync tests for cycle and scope refusal; vitest for derivation, filter terms and the Today group; a layout check for the dimmed row and the picker.
- **Size:** no dependency. About 2–3 KB gzipped of client code; a few hundred lines of Go. Memory unchanged: the dependency graph of a scope is read per batch that writes `blocked_by` and not cached.
