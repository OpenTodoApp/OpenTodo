## ADDED Requirements

### Requirement: An event that already exists is taken over
When the creation of a task's event in a CalDAV or Google calendar is answered 412 or 409 because an event already exists at `<task-id>.ics` (the connection was made again, or the database was restored from a backup), the server SHALL read that event's ETag, replace the event with the task's and keep it as the task's event. It SHALL NOT write a second event for the task, and the cycle SHALL NOT fail for that answer.

#### Scenario: A connection made again on a server that answers 412
- **WHEN** a calendar already holds `t1.ics` from an earlier connection and a new connection's cycle creates the event of task `t1` and is answered 412
- **THEN** the cycle replaces that event with the task's, the calendar holds one event for the task and the cycle succeeds

#### Scenario: Google answers 409
- **WHEN** a Google calendar already holds the events of two tasks from an earlier connection, one task was renamed since, and a new connection's cycle is answered 409 to both creations
- **THEN** both events are replaced, the renamed task's event carries the new title, the calendar holds two events, the cycle succeeds and the next cycle writes nothing
