# Spec Delta

## ADDED Requirements

### Requirement: Rolling updates
A new server process SHALL start and serve on a data directory that an older process still serves, so orchestrators can replace a container without downtime. Background jobs (reminder push, webhook deliveries, backups, email polling, Trash retention, audit pruning, demo reset) SHALL run in only one process at a time and SHALL move to the new process when the old one stops. Maintenance commands SHALL still refuse while any server runs.

#### Scenario: Coolify rolling update
- **WHEN** a new container starts on the volume while the old one still runs
- **THEN** the new one passes its health check and serves requests, the old one keeps running the background jobs until it stops, and the new one then takes them over

#### Scenario: Restore while serving
- **WHEN** `opentodo restore` runs while any server process uses the data directory
- **THEN** it refuses and asks to stop the server first

#### Scenario: Leader crashes
- **WHEN** the process running the background jobs is killed
- **THEN** another running process starts them within a few seconds
