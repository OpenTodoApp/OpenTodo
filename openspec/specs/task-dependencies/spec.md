# task-dependencies Specification

## Purpose
Lets a task wait for other tasks: the `blocked_by` references, the blocked state derived from them, how cycles are refused and how concurrent edits converge, and how blocked tasks are shown and filtered.

## Requirements

### Requirement: Blocked-by field
A task SHALL have a `blocked_by` list of task ids, empty by default, holding at most 50 distinct ids none of which is the task itself. It SHALL be an additive field written through the operation log as one whole-list value, editable offline, converging by last-writer-wins on the whole list like `labels`. It SHALL be exported, carried by the REST task shape, and stored and forwarded unchanged by clients that do not know it.

#### Scenario: Add a blocker offline
- **WHEN** the device is offline and the user makes "Book flights" blocked by "Confirm dates"
- **THEN** "Book flights" shows as blocked at once and the change is uploaded on the next successful sync

#### Scenario: Concurrent edits of the list
- **WHEN** device A sets a task's blockers to `[X]` and device B sets them to `[Y]`, both offline, and both sync
- **THEN** every device shows the list written with the greater timestamp, never a merge of both

#### Scenario: Invalid value
- **WHEN** a client submits a `blocked_by` that is not an array of strings, contains an empty id or the task's own id, or holds more than 50 ids
- **THEN** the write is rejected as invalid and the list is unchanged

#### Scenario: Older client passes it through
- **WHEN** a device running a client without dependency support receives a `blocked_by` operation and later edits the task's title
- **THEN** the list is unchanged after sync and the device otherwise behaves normally

### Requirement: Blocked state is derived
A task SHALL be blocked while at least one task in its `blocked_by` is known locally, not deleted and not completed. Ids that name a deleted, purged, unknown or completed task SHALL not block and SHALL stay in the list without any write. The state SHALL be computed from local data, so it is correct offline and identical on every device holding the same operations.

#### Scenario: Blocker completed elsewhere
- **WHEN** "Book flights" is blocked by "Confirm dates" and another device completes "Confirm dates", then this device syncs
- **THEN** "Book flights" is no longer blocked, with no operation written for it

#### Scenario: Blocker reopened
- **WHEN** "Confirm dates" is reopened
- **THEN** "Book flights" is blocked again on every device after sync

#### Scenario: Blocker not received yet
- **WHEN** a device receives a task's `blocked_by` before the blocker's own operations
- **THEN** the task is shown as not blocked until the blocker arrives, and nothing is written

#### Scenario: Recurring blocker
- **WHEN** a task is blocked by a recurring task and the current occurrence is completed
- **THEN** the task stays blocked, because the series moves on and remains open

### Requirement: Cycles refused on the device
A dependency SHALL never be written that would make a task depend, directly or through other tasks, on itself. The blocker picker SHALL not offer the task itself, tasks that already depend on it, deleted tasks or completed tasks. A local write that would close a cycle SHALL be refused with a message. A cycle that nevertheless exists locally SHALL block nothing: among its members, the list with the newest clock (timestamp, then device, then id) is ignored for the state.

#### Scenario: Picker excludes dependents
- **WHEN** "Compare prices" is blocked by "Book hotel" and the user opens the "Blocked by" picker on "Book hotel"
- **THEN** "Compare prices" and "Book hotel" are not offered

#### Scenario: Local cycle does not block
- **WHEN** two edits that together form a cycle between X and Y exist on one device before the server has answered
- **THEN** neither X nor Y is shown as blocked by the other, and the device never shows a task that blocks itself

### Requirement: Cycles refused on the server
The server SHALL refuse an operation whose `blocked_by` would close a cycle against the current `blocked_by` values of the task's sharing scope, including operations accepted earlier in the same batch, with the reason `cycle`. Completion and deletion SHALL not affect the check. The refusal SHALL return the current winning value so the device drops its edit and converges, and the other fields of the batch SHALL be applied.

#### Scenario: Two offline devices close a cycle
- **WHEN** device A makes X blocked by Y and device B makes Y blocked by X, both offline, and A syncs before B
- **THEN** A's edit is stored, B's is refused with reason `cycle`, B restores Y's server value, and every device ends with X blocked by Y only

#### Scenario: Cycle through a completed task
- **WHEN** X is blocked by Y, Y is completed, and a client sets Y blocked by X
- **THEN** the operation is refused with reason `cycle`

#### Scenario: Cycle via the API
- **WHEN** a script PATCHes `{"blocked_by":["<id of X>"]}` onto Y while X is blocked by Y
- **THEN** the response is 400 with code `invalid_input` naming the cycle and Y is unchanged

### Requirement: Blockers stay within the sharing scope
Every id in `blocked_by` SHALL name a task of the same sharing scope as the task: the same shared project, or the author's personal scope for Inbox and unshared projects. The picker SHALL offer only such tasks; the server SHALL refuse an id that names a task of another scope with reason `not_in_scope` and SHALL accept an id it does not know. Moving a task to a differently shared project SHALL clear its `blocked_by`.

#### Scenario: Shared project
- **WHEN** a member edits a task of shared project "Launch" and opens the picker
- **THEN** only open tasks of "Launch" are offered, not the member's Inbox or personal projects

#### Scenario: Reference into another scope refused
- **WHEN** a client submits a `blocked_by` naming a task of the author's Inbox for a task in a shared project
- **THEN** the operation is refused with reason `not_in_scope` and the server's value is restored on the device

#### Scenario: Move across scopes
- **WHEN** a task blocked by two Inbox tasks is moved into a shared project
- **THEN** the copy in the shared project has no blockers, and the Inbox tasks are unchanged

### Requirement: Blocked tasks in lists and boards
In every task list and on board cards a blocked task SHALL be shown dimmed with a lock marker carrying the number of open blockers, in its usual position. It SHALL remain selectable, openable and completable; completing it SHALL not touch its blockers. Unblocked tasks SHALL look as before.

#### Scenario: Dimmed row with count
- **WHEN** a task has two open blockers and one completed blocker
- **THEN** its row is dimmed and the marker reads "Blocked by 2"

#### Scenario: Complete a blocked task anyway
- **WHEN** the user presses `c` on a blocked task
- **THEN** the task is completed and its blockers are unchanged

### Requirement: Today keeps blocked tasks aside
The Today view SHALL list blocked tasks due today or earlier in a collapsed "Blocked" group after today's tasks, with their count, expandable per device. A task SHALL leave that group and take its normal place as soon as it is no longer blocked. Upcoming and every other view SHALL keep blocked tasks in place, dimmed.

#### Scenario: Blocked task due today
- **WHEN** "Book flights", due today and blocked, is viewed in Today
- **THEN** it is not among today's tasks but in a collapsed "Blocked 1" group at the end, which Enter or a click expands

#### Scenario: Blocker completed
- **WHEN** the user completes "Confirm dates", the only open blocker of "Book flights"
- **THEN** "Book flights" moves into today's tasks without a reload

### Requirement: Dependencies in the detail panel
The detail panel SHALL show each blocker as a part of the Who line reading "waits for" and the blocker's title (completed ones struck through), and the open tasks that depend on this task as one part reading "blocks" with their number. The blockers' popover SHALL hold the picker to add or remove blockers; the "blocks" popover SHALL list the dependent tasks, each opening that task. Pressing `b` on a selected list row SHALL open the picker. Every action SHALL be reachable with the keyboard and SHALL apply locally at once.

#### Scenario: Add from the keyboard
- **WHEN** a task is selected in a list and the user presses `b`, types "conf" and presses Enter on "Confirm dates"
- **THEN** "Confirm dates" is a blocker of the task, the Who line reads "waits for Confirm dates", and the row shows the marker immediately

#### Scenario: Blocks list
- **WHEN** the user opens "Confirm dates", which blocks "Book flights" and "Book hotel"
- **THEN** the Who line reads "blocks 2", and opening that part lists both, each opening that task

#### Scenario: Blocker completed
- **WHEN** a blocker of the open task is completed on another device and this device syncs
- **THEN** its "waits for" part is struck through without a reload

### Requirement: Dependencies via the API
`POST` and `PATCH /api/v1/tasks` SHALL accept `blocked_by` and the task shape SHALL return it. A value that is invalid, closes a cycle or references another scope SHALL be refused with 400 `invalid_input` and nothing written. The routes keep requiring authentication.

#### Scenario: Set blockers via the API
- **WHEN** a script PATCHes `{"blocked_by":["<id>"]}` onto a task with a bearer token
- **THEN** the response is 200 with the task carrying the list, and devices show it blocked after their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials patches a task's `blocked_by`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Reference to another scope via the API
- **WHEN** a script sets a shared task's `blocked_by` to an Inbox task id
- **THEN** the response is 400 `invalid_input` and the task is unchanged

### Requirement: Unblocked notification
When a completion wins on the server and leaves a task with no open blocker, and that task is assigned to someone other than the author of the completion, the server SHALL emit an unblocked event delivered as an in-app notification to the assignee through the existing notifications routes. No external service SHALL be contacted, and the event SHALL never fail or roll back the batch.

#### Scenario: Assignee is notified
- **WHEN** Alice completes "Confirm dates", the last open blocker of "Book flights" assigned to Bob, and Bob's device syncs
- **THEN** Bob sees an unread notification naming Alice, "Book flights" and the project

#### Scenario: One of several blockers
- **WHEN** Alice completes one of two open blockers of Bob's task
- **THEN** no notification is sent

#### Scenario: Own task
- **WHEN** Bob completes the last blocker of a task assigned to himself
- **THEN** no notification is sent

### Requirement: Dependency checks cost one graph read per batch
When the server checks the blocked_by ops of a sync batch for cycles, it SHALL read each sharing scope's dependency graph at most once per batch and SHALL account for the batch's own accepted blocked_by ops under last-writer-wins, so the cost of a batch does not multiply by the size of the project. Which ops are accepted or refused SHALL be the same as when the graph is read for every op. Devices are unaffected: offline edits arrive in batches as before and converge the same way.

#### Scenario: Large batch on a large project
- **WHEN** a device sends one batch of 1,000 blocked_by ops for a project of 10,000 tasks
- **THEN** the server reads the project's dependency graph once and answers in well under a second on ordinary hardware

#### Scenario: Cycle closed inside the batch
- **WHEN** a batch adds the edges of a chain and, last, an edge that closes it into a cycle
- **THEN** every edge but the last is applied and the last is refused with `cycle`

#### Scenario: Older op in the batch does not clear a stored edge
- **WHEN** a batch holds an op that empties a task's blocked_by with a timestamp older than the stored value, followed by an op that would close a cycle through the stored edge
- **THEN** the first op does not win and the second is refused with `cycle`
