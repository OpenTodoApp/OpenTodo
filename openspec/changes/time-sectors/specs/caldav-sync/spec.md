## ADDED Requirements

### Requirement: Time sector as a calendar property
A task's sector (OpenSpec `time-sectors`) SHALL be served as `X-OPENTODO-SECTOR` with the stored period, such as `2026-W44`, `2026-11` or `2026-Q4`, and SHALL be omitted when empty. A client that sends the property SHALL set the field through an operation like every CalDAV write; an invalid value SHALL be ignored and kept in `ical_extra`. A write without the property SHALL leave the sector unchanged. A VTODO that carries `DUE` and the property SHALL set both fields as sent.

#### Scenario: Sector served
- **WHEN** a task with the sector `2026-W45` and no due date is fetched
- **THEN** the VTODO carries `X-OPENTODO-SECTOR:2026-W45` and no DUE

#### Scenario: Set from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-SECTOR:2026-Q1`
- **THEN** the task's sector is `2026-Q1` and devices show it after their next sync

#### Scenario: Invalid value
- **WHEN** a client PUTs `X-OPENTODO-SECTOR:SOON`
- **THEN** the sector is unchanged, the line is kept in `ical_extra`, and the response is 201 or 204 as for any accepted write

#### Scenario: Client without the property
- **WHEN** a client that never sends X- properties edits the summary of a task with a sector
- **THEN** the task keeps its sector
