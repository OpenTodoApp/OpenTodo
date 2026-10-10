# Spec Delta

## MODIFIED Requirements

### Requirement: Task fields
A task SHALL have a title, a description, an optional project, a priority from 1 (highest) to 4 (lowest, default), an optional due date, labels, a sort position, creation time, optional completion time, optional deletion time and an optional opaque `ical_extra` text holding calendar properties the app does not model. Fields reserved for later changes (`parent_id`, `labels`) and `ical_extra` SHALL be stored and synced even before the client offers an interface for them.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, empty description and labels, no `ical_extra`, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Opaque field survives offline edits
- **WHEN** a task carries `ical_extra` and a device edits the task's title while offline, then syncs
- **THEN** the task keeps its `ical_extra` value and the new title on every device
