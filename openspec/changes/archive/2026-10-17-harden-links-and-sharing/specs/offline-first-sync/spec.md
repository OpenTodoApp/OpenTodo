## ADDED Requirements

### Requirement: Entity id characters
An op's `entityId` SHALL be 1 to 64 characters from ASCII letters, digits and `.` `_` `:` `@` `+` `=` `~` `-`. The server SHALL refuse a batch containing any other id as an invalid op (400 `invalid_op` on sync, nothing stored), so a stored id can always be written into JSON and URLs. Every id the clients generate (UUIDs, name-derived UUIDs, `me`, CalDAV UIDs) SHALL stay valid, so offline devices keep converging. The server SHALL write ids into JSON with standard JSON string quoting.

#### Scenario: Control character refused
- **WHEN** a device pushes an op for task id `x\u0007`
- **THEN** the batch is refused as invalid, nothing is stored, and every member's task list still loads

#### Scenario: Client ids accepted
- **WHEN** a device pushes ops for a UUID, a CalDAV UID such as `20261017T101500Z-1234@example.com`, or the preferences row `me`
- **THEN** the ops are applied as before
