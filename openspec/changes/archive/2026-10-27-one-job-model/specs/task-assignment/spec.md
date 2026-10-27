## MODIFIED Requirements

### Requirement: Read notifications are removed after 90 days
Read in-app notifications older than 90 days SHALL be removed when the server opens the data directory and, while it runs, within a minute of the oldest read notification passing 90 days, on a self-hosted server as on a host. Unread notifications SHALL be kept whatever their age.

#### Scenario: Server running for months
- **WHEN** a self-hosted server runs without a restart and a read notification passes 90 days
- **THEN** it is removed within a minute, and unread notifications stay

#### Scenario: Old notification read late
- **WHEN** a user reads a notification created 100 days ago
- **THEN** it is removed within a minute of being read
