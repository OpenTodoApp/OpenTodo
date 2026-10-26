# Spec Delta

## ADDED Requirements

### Requirement: Calendar connection events
The server SHALL record `calendar_connection.created`, `calendar_connection.updated` and `calendar_connection.deleted` with the acting account and the connection id and provider (`caldav` or `google`) in the details, and SHALL list them in the user's own activity. An update SHALL name the setting that changed (`password`, `calendars`, `name`, `enabled`, `options`, `reconnected`) and never a value. Server addresses, usernames, passwords, tokens, calendar names and event content SHALL never be recorded. Sync cycles and the task changes they make SHALL NOT be audited.

#### Scenario: Connection created
- **WHEN** a user connects a calendar account
- **THEN** the log contains `calendar_connection.created` with the user as actor, the connection id and the provider, and no address, username or password

#### Scenario: Password replaced
- **WHEN** a user enters a new app password for a connection
- **THEN** the log contains `calendar_connection.updated` with `setting: password` and no value

#### Scenario: Cycles are not events
- **WHEN** a sync cycle moves tasks
- **THEN** no audit event is recorded
