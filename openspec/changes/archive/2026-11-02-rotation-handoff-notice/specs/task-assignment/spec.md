## MODIFIED Requirements

### Requirement: Unassign on departure
When a member leaves or is removed from a project, or their account is deleted, every task in that project assigned to them SHALL be unassigned by operations written by the server, except that a recurring task with a rotation (see "Rotating assignee on recurring tasks") SHALL instead be assigned to the next person of its rotation among the remaining members, or unassigned when none remains; in the same server-authored batch the departing account SHALL be removed from every rotation in that project, so devices that were offline during the departure converge on the unassigned state without client logic. The person a rotating task is handed to SHALL receive the assignment notification worded as their turn, as after a completion, unless they are the author of the departure; an unassignment SHALL NOT notify anyone. Assignments to that person submitted afterwards SHALL be rejected.

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

#### Scenario: Turn handed on by a departure is announced
- **WHEN** Bob leaves "House" while it is his turn on "Bins", which rotates Alice → Bob → Carol
- **THEN** Carol is notified "It's your turn: Bins", as if Bob had completed it, and nobody is notified about Bob's other tasks being unassigned

#### Scenario: Last other member leaves
- **WHEN** Carol leaves a project whose rotating task "Litter" rotates Alice → Carol and is assigned to Carol
- **THEN** Litter is assigned to Alice and its rotation holds Alice only, which no longer rotates
