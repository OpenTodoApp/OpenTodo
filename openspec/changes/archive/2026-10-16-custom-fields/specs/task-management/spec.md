# Spec Delta

## MODIFIED Requirements

### Requirement: Task fields
A task SHALL have a title, description, optional project, priority 1 (highest) to 4 (lowest, default), optional due date, labels, optional assignee, sort position, creation time, optional completion and deletion times, an optional opaque `ical_extra` text of calendar properties the app does not model, and a `fields` map of custom field values keyed by definition id (OpenSpec `custom-fields`). Fields without an interface yet SHALL still be stored and synced. Every field, and every entry of `fields`, SHALL be editable offline and converge by per-field last-writer-wins.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, no assignee, empty description, labels and `fields`, no `ical_extra`, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time, or a `fields` entry that is an object or an array
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Opaque field survives offline edits
- **WHEN** a task carries `ical_extra` and a device edits the task's title while offline, then syncs
- **THEN** the task keeps its `ical_extra` value and the new title on every device

#### Scenario: Field entries are independent operations
- **WHEN** a device sets the task's "Cost" entry while another device renames the task offline, and both sync
- **THEN** every device shows the new title and the new Cost, because each is its own operation
