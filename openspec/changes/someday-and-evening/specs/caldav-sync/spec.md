# Spec Delta

## ADDED Requirements

### Requirement: Start and evening as calendar properties
A task's start SHALL be served as `X-OPENTODO-START`, with the value `SOMEDAY` or the date as `YYYYMMDD`, and an evening task SHALL carry `X-OPENTODO-EVENING:TRUE`; both SHALL be omitted when unset. A client that sends these properties SHALL set the fields, written as operations like every CalDAV write; an invalid value SHALL be ignored and kept in `ical_extra`. The two properties SHALL never be stored in `ical_extra` when mapped, and `DTSTART` SHALL keep its meaning from the deadlines mapping.

#### Scenario: Someday task served
- **WHEN** a parked task is fetched
- **THEN** the VTODO carries `X-OPENTODO-START:SOMEDAY`, no DUE and no DTSTART

#### Scenario: Deferred evening task from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-START:20261021` and `X-OPENTODO-EVENING:TRUE`
- **THEN** the task's start is `2026-10-21` and its evening flag is set, and devices show both after their next sync

#### Scenario: Unknown value preserved
- **WHEN** a client PUTs `X-OPENTODO-START:LATER`
- **THEN** the task's start is unchanged, the line is kept in `ical_extra`, and the response is 201 or 204 as for any accepted write

#### Scenario: Client without the properties
- **WHEN** a client that never sends X- properties edits the summary of a parked task
- **THEN** the task stays parked, because the properties were absent rather than removed and the write changes only the title
