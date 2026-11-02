## ADDED Requirements

### Requirement: Rotating assignee on recurring tasks
A task SHALL have an optional `rotation`, an ordered list of at most 20 distinct account ids, empty by default, written and synced as one whole-list operation that is applied locally first, works offline and converges by last-writer-wins. The server SHALL refuse at receipt, with reason `not_a_member`, an operation whose rotation names an account that is not a current member of the task's scope, leaving the previous value on every device. A rotation SHALL take effect only on a top-level recurring task whose scope has at least two members; elsewhere it SHALL be kept but inert and hidden. Account ids in a rotation SHALL be stored in plaintext, like the assignee, for accounts with end-to-end encryption too.

#### Scenario: Set a rotation offline
- **WHEN** Alice, an editor of the shared project "House", sets "Bins" (every Monday) to take turns Alice → Bob → Carol while offline
- **THEN** the rotation shows in her task panel at once and on every member's device after sync

#### Scenario: Concurrent rotations
- **WHEN** Alice sets the rotation Alice → Bob and Carol, offline, sets Carol → Bob on the same task, and both sync
- **THEN** every device shows the rotation written with the greater timestamp, whole

#### Scenario: Non-member in the rotation
- **WHEN** a device submits a rotation naming an account that is not a member of the project
- **THEN** the operation is rejected with reason `not_a_member` and the task keeps its previous rotation everywhere

#### Scenario: Rule removed
- **WHEN** the recurrence of a rotating task is removed
- **THEN** the rotation is kept but hidden, completing the task does not change its assignee, and adding a rule back shows the rotation again

### Requirement: Completion passes the turn
Completing the current occurrence of a rotating series SHALL, in the same batch as the occurrence record and the next due date, set the series' assignee to the next person: the person after the current assignee among the rotation's current members, wrapping around, or the first of them when the current assignee is not among them; with no current member in the rotation the assignee SHALL stay. The occurrence record SHALL keep the assignee who held it. The choice SHALL depend only on the rotation, the current assignee and the membership, and SHALL be computed identically by the web client and by every server completion path (REST, CalDAV, the MCP tools and automation rules), pinned by shared test vectors. Skipping an occurrence, detaching one, reopening a record and reassigning SHALL NOT rotate; a series that ends with this completion SHALL keep its assignee. The new assignee SHALL receive the assignment notification, worded as their turn.

#### Scenario: Bob's turn next
- **WHEN** Alice completes "Bins", assigned to her and rotating Alice → Bob → Carol
- **THEN** the occurrence appears in Completed as done by Alice, Bins is due next Monday assigned to Bob, and Bob is notified "It's your turn: Bins"

#### Scenario: Wrap around
- **WHEN** Carol completes the same task on her turn
- **THEN** it is assigned to Alice

#### Scenario: Two devices complete offline
- **WHEN** Alice's phone and Bob's laptop both complete the same occurrence of "Bins" while offline and then sync
- **THEN** every device shows one completion record, one next due date and the same next assignee

#### Scenario: Stale membership on an offline device
- **WHEN** Bob was removed while Alice's phone was offline, and the phone completes "Bins" and names Bob as the next assignee
- **THEN** the record and the next due date are accepted, the assignee change is refused with `not_a_member`, and every device shows the assignee the server chose when Bob left

#### Scenario: Skip keeps the turn
- **WHEN** Bob skips this week's "Bins"
- **THEN** Bins moves to next Monday and stays assigned to Bob

#### Scenario: Completion through CalDAV
- **WHEN** a calendar app marks the current occurrence of a rotating task completed
- **THEN** the server rotates the assignee exactly as the app would

#### Scenario: Same vectors on both sides
- **WHEN** the shared rotation vectors are evaluated by the web client and by the server
- **THEN** both choose the same next assignee for every vector

### Requirement: Rotation in the client
In a project with at least two members, the Assignee menu of a recurring task SHALL offer "Take turns…" to editors, admins and the owner, opening an ordered people list that can be reordered with the pointer and the keyboard, filled from the project's members with the people picker and from "Add everyone in <group>" for each workspace group on the project (adding its current members once), and cleared with "Stop taking turns". The task panel SHALL show the rotation as one line under the assignee with the current assignee emphasised, and a row SHALL mark a rotating task's assignee avatar with a rotate glyph that has an accessible name. Personal projects, non-recurring tasks and viewers SHALL NOT be offered the action, and a viewer SHALL see the line read-only. Assigned to me SHALL list a rotating task only for its current assignee.

#### Scenario: Personal project
- **WHEN** a user opens the Assignee menu of a recurring task in a project only they belong to
- **THEN** no "Take turns…" item is shown

#### Scenario: Fill from a group
- **WHEN** an editor chooses "Add everyone in Adults" for a project shared with the group Adults (Alice, Bob, Carol)
- **THEN** the three are added to the rotation in that order, and a later change to the group does not change the rotation

#### Scenario: Reorder with the keyboard
- **WHEN** the user focuses Carol in the list and presses Alt+Up twice
- **THEN** Carol is first, and the rotation is saved as one operation

### Requirement: Rotation through the API
The REST task representation SHALL include `rotation`, and `PATCH /api/v1/tasks/{id}` SHALL accept it under the same authentication and role rules as the assignee. A rotation with duplicates, more than 20 ids, on a task without a recurrence, on a subtask or in a scope with fewer than two members SHALL be refused with 400 `invalid_rotation`; one naming a non-member SHALL be refused with 409 `not_a_member`. Completing a rotating task through the API SHALL rotate it. The command-line client SHALL set and clear a rotation with `ot task edit --rotate` and `--no-rotate`, and the MCP task view and update tool SHALL expose it.

#### Scenario: Set through the API
- **WHEN** a client with a full token patches a recurring task of a shared project with the ids of two members
- **THEN** the response is 200 with the rotation, and every member's device shows it after sync

#### Scenario: Unauthenticated
- **WHEN** the same request arrives without credentials
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Viewer
- **WHEN** a viewer patches the rotation
- **THEN** the response is 403 `forbidden` and the rotation is unchanged

#### Scenario: Not recurring
- **WHEN** a client sets a rotation on a task without a recurrence
- **THEN** the response is 400 `invalid_rotation`

## MODIFIED Requirements

### Requirement: Unassign on departure
When a member leaves or is removed from a project, or their account is deleted, every task in that project assigned to them SHALL be unassigned by operations written by the server, except that a recurring task with a rotation (see "Rotating assignee on recurring tasks") SHALL instead be assigned to the next person of its rotation among the remaining members, or unassigned when none remains; in the same server-authored batch the departing account SHALL be removed from every rotation in that project, so devices that were offline during the departure converge on the unassigned state without client logic. Assignments to that person submitted afterwards SHALL be rejected.

#### Scenario: Removed member had tasks
- **WHEN** Bob, assignee of four tasks in a shared project, is removed
- **THEN** after their next sync all members' devices show those four tasks unassigned, and the unassignments appear as server-authored changes

#### Scenario: Offline assignment to a departed member
- **WHEN** Alice assigns a task to Bob offline, Bob leaves before Alice reconnects, and Alice syncs
- **THEN** the assignment is rejected with reason `not_a_member` and Alice's device shows the task unassigned

#### Scenario: Deleted account had tasks in someone else's project
- **WHEN** the owner deletes Bob's account while Bob is the assignee of a task in Alice's shared project
- **THEN** the task is unassigned by a server-authored change in Alice's project, Alice's devices show it unassigned after their next sync, and webhooks see the change

#### Scenario: Departing member held a rotating chore
- **WHEN** Bob is removed from "House" while it is his turn on "Bins", which rotates Alice → Bob → Carol
- **THEN** after the next sync every member's device shows Bins assigned to Carol with the rotation Alice → Carol, both written as server-authored changes

#### Scenario: Last other member leaves
- **WHEN** Carol leaves a project whose rotating task "Litter" rotates Alice → Carol and is assigned to Carol
- **THEN** Litter is assigned to Alice and its rotation holds Alice only, which no longer rotates
