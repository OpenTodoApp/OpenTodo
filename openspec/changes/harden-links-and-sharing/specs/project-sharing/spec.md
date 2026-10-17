## ADDED Requirements

### Requirement: Project id cannot be taken over
Sharing a project for the first time (adding a member or accepting an invite link to an unshared project) SHALL be refused when another account's personal scope holds a project with the same id. The member routes answer 409 `project_id_conflict`; invite acceptance answers 404 `invitation_invalid`. Nothing is shared and no scope is created. Each account keeps its own project and writes it as before, offline included.

#### Scenario: Squatted id
- **WHEN** bob creates a project whose id equals alice's unshared project and adds carol to it
- **THEN** the request fails with 409 `project_id_conflict`, no project scope exists, and alice still owns and edits her project

#### Scenario: Unique id
- **WHEN** alice shares a project whose id no other account uses
- **THEN** sharing works as before

### Requirement: Attachments move with a shared project
The first share SHALL move the attachments of the project's tasks into the project's scope, together with the tasks, sections, fields and comments, keeping op ids and sequence numbers. A server upgraded from an earlier version SHALL move, once at startup, the attachments that earlier shares left in the owner's personal scope, and members' devices SHALL replay that project's history so they receive them. Purging a task of a shared project then removes its attachments.

#### Scenario: Files added before sharing
- **WHEN** alice attaches a file to a task, then shares the project with bob
- **THEN** bob's devices receive the attachment and `GET` returns it for bob

#### Scenario: Project shared on an older version
- **WHEN** the server starts on a database where a shared project's attachments are still in the owner's personal scope
- **THEN** they move to the project's scope, attachments of personal tasks stay private, and a second start changes nothing
