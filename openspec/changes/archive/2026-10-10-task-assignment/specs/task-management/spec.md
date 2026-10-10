# Spec Delta

## MODIFIED Requirements

### Requirement: Task fields
A task SHALL have a title, a description, an optional project, a priority from 1 (highest) to 4 (lowest, default), an optional due date, labels, an optional assignee, a sort position, creation time, optional completion time and optional deletion time. Fields reserved for later changes (`parent_id`, `labels`) SHALL be stored and synced even before the client offers an interface for them. Every field SHALL be editable offline and SHALL converge by per-field last-writer-wins.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, no assignee, empty description and labels, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes
