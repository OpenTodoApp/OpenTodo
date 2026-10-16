# Spec Delta

## MODIFIED Requirements

### Requirement: Task fields
A task SHALL have a title, description, optional project, priority 1 (highest) to 4 (lowest, default), optional due date, labels, optional assignee, sort position, creation time, optional completion and deletion times, an optional opaque `ical_extra` text of calendar properties the app does not model, a `habit` flag (default false) and, on an occurrence record of a habit, a `skipped` marker (default false; OpenSpec `habits`). Fields without an interface yet SHALL still be stored and synced. Every field SHALL be editable offline and converge by per-field last-writer-wins.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, no assignee, empty description and labels, no `ical_extra`, is not a habit, is not skipped, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, a non-boolean `habit` or `skipped`, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Opaque field survives offline edits
- **WHEN** a task carries `ical_extra` and a device edits the task's title while offline, then syncs
- **THEN** the task keeps its `ical_extra` value and the new title on every device

#### Scenario: Older client keeps the flags
- **WHEN** a device running a build without habits edits the title of a habit and syncs
- **THEN** the task keeps `habit` true on every device, because each field is its own operation
