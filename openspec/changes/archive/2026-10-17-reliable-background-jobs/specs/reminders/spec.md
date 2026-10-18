## ADDED Requirements

### Requirement: Reminders of completed tasks are dismissed by the server
When the server's scheduler finds a due reminder whose task is completed, it SHALL record the reminder as dismissed for that firing time with an operation authored by the server, and SHALL not examine it again until its firing time changes. Reminders on deleted tasks SHALL follow the Trash rule instead (nothing recorded). The scheduler SHALL read its candidates in bounded pages, so many stale reminders never hold back a due one.

#### Scenario: Many reminders on completed tasks
- **WHEN** a user has a thousand overdue reminders on completed tasks and one due reminder on an open task
- **THEN** the due reminder is pushed on the next check, the others are recorded as dismissed, and later checks no longer examine them

#### Scenario: New firing time after completion
- **WHEN** a dismissed reminder's task is reopened and the reminder gets a new firing time
- **THEN** it is pushed again at the new time
