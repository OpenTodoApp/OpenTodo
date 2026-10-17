## ADDED Requirements

### Requirement: Background jobs stop before the database closes
On shutdown (SIGTERM, interrupt or a restart for a web restore) the server SHALL cancel its background jobs and wait for them to finish, for at most 20 seconds, before it closes the database. A job that was sending something when shutdown began SHALL record the outcome of that send, so it is not repeated after the next start. When the wait times out the server SHALL log it and close anyway.

#### Scenario: Backup running at shutdown
- **WHEN** the server is stopped while a backup is uploading
- **THEN** the backup is cancelled and recorded as failed before the database closes, and no "database is closed" error is logged

#### Scenario: Digest sent during shutdown
- **WHEN** a weekly digest was handed to the mail server just as shutdown began
- **THEN** it is recorded as sent, and the next start does not send it again

#### Scenario: Reminder pushed during shutdown
- **WHEN** a reminder push was accepted by the push service just as shutdown began
- **THEN** the delivery is recorded, and the reminder is not pushed again after the restart
