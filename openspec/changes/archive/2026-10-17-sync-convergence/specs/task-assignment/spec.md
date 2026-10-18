## MODIFIED Requirements

### Requirement: Unassign on departure
When a member leaves or is removed from a project, or their account is deleted, every task in that project assigned to them SHALL be unassigned by operations written by the server, so devices that were offline during the departure converge on the unassigned state without client logic. Assignments to that person submitted afterwards SHALL be rejected.

#### Scenario: Removed member had tasks
- **WHEN** Bob, assignee of four tasks in a shared project, is removed
- **THEN** after their next sync all members' devices show those four tasks unassigned, and the unassignments appear as server-authored changes

#### Scenario: Offline assignment to a departed member
- **WHEN** Alice assigns a task to Bob offline, Bob leaves before Alice reconnects, and Alice syncs
- **THEN** the assignment is rejected with reason `not_a_member` and Alice's device shows the task unassigned

#### Scenario: Deleted account had tasks in someone else's project
- **WHEN** the owner deletes Bob's account while Bob is the assignee of a task in Alice's shared project
- **THEN** the task is unassigned by a server-authored change in Alice's project, Alice's devices show it unassigned after their next sync, and webhooks see the change
