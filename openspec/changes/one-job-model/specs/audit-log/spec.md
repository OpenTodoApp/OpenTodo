## MODIFIED Requirements

### Requirement: Retention and pruning
The owner SHALL set retention through `GET`/`PUT /api/v1/settings/audit` between 7 and 3650 days, default 90, and SHALL toggle address logging there. The server SHALL prune events at startup and, while it runs, within a minute of the oldest event passing the retention; after the owner shortens the retention, the events it no longer covers SHALL be pruned within a minute. Retention is server configuration, not synced.

#### Scenario: Shorter retention prunes
- **WHEN** the owner lowers retention to 30 days while events older than that exist
- **THEN** those events are gone within a minute and the audit setting change itself is recorded

#### Scenario: Event passes the retention
- **WHEN** the oldest event in the log becomes older than the retention while the server runs
- **THEN** it is pruned within a minute, without waiting for an hourly pass

#### Scenario: Invalid retention or wrong role
- **WHEN** retention is set to 3 days, or a member writes the settings
- **THEN** the response is a 400 `invalid_input` error for the value and a 403 `forbidden` error for the member
