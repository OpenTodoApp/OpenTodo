## ADDED Requirements

### Requirement: Refused changes

The vault SHALL announce the sync feature `invalid_ops`, so the server refuses an operation it cannot accept on its own and applies the rest of the sync. A sync SHALL report each refused operation as a warning naming the field, the entity and the server's reason, SHALL NOT fail because of it, and SHALL write the file from the server's value of that field. The vault SHALL NOT keep a refused operation to send again.

#### Scenario: A value the server refuses

- **WHEN** a sync pushes a task line whose priority the server refuses as `invalid` together with a new due date
- **THEN** the sync succeeds with a warning that names the priority and `invalid`, the server holds the new due date and its own priority, the line shows both, and the next sync is idle
