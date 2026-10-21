## MODIFIED Requirements

### Requirement: Task fields
A task SHALL have a title, description, optional project, priority 1 (highest) to 4 (lowest, default), optional due date, labels, optional assignee, sort position, creation time, optional completion and deletion times, an optional opaque `ical_extra` text of calendar properties the app does not model, and an additive `workspace_id` that places a task without a project in a workspace's Inbox (absent or null means the default workspace; ignored while the task has a project, whose workspace it then follows). Fields without an interface yet SHALL still be stored and synced. Every field SHALL be editable offline and converge by per-field last-writer-wins.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (the Inbox of the workspace it was created in), no due date, no assignee, empty description and labels, no `ical_extra`, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Opaque field survives offline edits
- **WHEN** a task carries `ical_extra` and a device edits the task's title while offline, then syncs
- **THEN** the task keeps its `ical_extra` value and the new title on every device

#### Scenario: Workspace of a task with a project
- **WHEN** a task carries `workspace_id` of "Personal" and is in the project "Website" of "Work"
- **THEN** every view treats it as a task of Work, and no client rewrites its `workspace_id`

#### Scenario: Invalid workspace value
- **WHEN** a client submits a `workspace_id` that is not a string or null
- **THEN** the write is rejected as invalid and the task is unchanged
