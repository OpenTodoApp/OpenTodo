# Spec Delta

## ADDED Requirements

### Requirement: Reminders created with their task
A reminder MAY be written in the same operation set as the task it belongs to, for example from a quick-add line or `ot add`. A relative reminder in that set SHALL carry the firing time computed from the task's due date in the same set (09:00 for a date-only due), and an absolute reminder SHALL carry the moment chosen. The set SHALL be applied locally as one transaction, queued as one upload, and SHALL converge like any reminder written later.

#### Scenario: Offline task with a reminder
- **WHEN** the device is offline and a task due tomorrow at 15:00 is captured with a "30 minutes before" reminder
- **THEN** the task and the reminder appear together, the reminder's firing time is tomorrow 14:30 local, and both upload in the next successful sync

#### Scenario: Reminder on a task that does not exist yet on another device
- **WHEN** device B receives the reminder op before it has applied the task op from the same set
- **THEN** after both are applied the reminder is shown on the task with its firing time, and nothing fires in between because the task is unknown

#### Scenario: Created through the REST API
- **WHEN** a client creates a task with `POST /api/v1/tasks` and then its reminder with `POST /api/v1/reminders` naming the new task id
- **THEN** the reminder is accepted with the firing time computed by the server for a relative reminder, exactly as for a reminder added later
