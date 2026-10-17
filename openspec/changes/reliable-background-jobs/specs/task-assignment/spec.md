## ADDED Requirements

### Requirement: Read notifications are removed after 90 days
Read in-app notifications older than 90 days SHALL be removed when the server opens the data directory and then once a day while it runs, on a self-hosted server as on a host. Unread notifications SHALL be kept whatever their age.

#### Scenario: Server running for months
- **WHEN** a self-hosted server runs without a restart and a read notification passes 90 days
- **THEN** it is removed within a day, and unread notifications stay
