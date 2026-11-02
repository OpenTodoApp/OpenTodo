## ADDED Requirements

### Requirement: Routines in shared projects
A shared project's routines (`routines` "Routines of a shared project") SHALL follow the role permissions: a viewer reads them and their runs; an editor additionally creates, edits, turns on and off and deletes them and undoes their runs; an admin and the owner as an editor. Membership changes SHALL apply to them: the first share relabels them with the project's tasks, leaving, removal and a change to viewer pause the routines that run as that person, and purging the project removes them. Routines SHALL never change membership, roles or sharing.

#### Scenario: Editor creates a routine
- **WHEN** an editor of a shared project creates a routine in it
- **THEN** the server accepts the operations and every member sees the routine after their next sync

#### Scenario: Viewer cannot turn it on
- **WHEN** a viewer's device submits `enabled: true` for a routine of the project
- **THEN** the operation is rejected and the routine stays off for every member
