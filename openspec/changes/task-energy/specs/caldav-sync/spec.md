## ADDED Requirements

### Requirement: Energy as a calendar property
A task's energy SHALL be served as `X-OPENTODO-ENERGY` with the value `DEEP`, `MEDIUM` or `LOW`, omitted when unset. A client that sends the property SHALL set the field (case ignored), written as an operation like every CalDAV write; a VTODO without it SHALL clear the energy only when the task was served with it. An invalid value SHALL be ignored and kept in `ical_extra`. The mapped property SHALL never be stored in `ical_extra`.

#### Scenario: Served
- **WHEN** a task with energy Deep is fetched over CalDAV
- **THEN** its VTODO carries `X-OPENTODO-ENERGY:DEEP`

#### Scenario: Set from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-ENERGY:low`
- **THEN** the task's energy is Low and devices show it after their next sync

#### Scenario: Invalid value
- **WHEN** a client PUTs `X-OPENTODO-ENERGY:HIGH`
- **THEN** the energy is unchanged and the line is kept in `ical_extra`
