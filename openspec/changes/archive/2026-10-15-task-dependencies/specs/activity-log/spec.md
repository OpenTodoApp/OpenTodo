# Spec Delta

## ADDED Requirements

### Requirement: Dependency events
A change of a task's `blocked_by` SHALL be an event of kind `dependencies`, carrying the old and new lists, derived identically on the server and on the device and folded with the actor's other operations on the task within the usual window. It SHALL be classified after completion, deletion, due, assignee and project changes, so a batch that also moves the task is still a "moved" event.

#### Scenario: Blockers added
- **WHEN** Alice makes "Book flights" blocked by "Confirm dates"
- **THEN** the task's activity shows one `dependencies` event by Alice from an empty list to `["<id of Confirm dates>"]`, offline as well as from the server

#### Scenario: Same derivation on both sides
- **WHEN** the shared fixture holds a batch that sets `blocked_by` and the title within the window
- **THEN** the server and the device both derive a single `dependencies` event listing both changes
