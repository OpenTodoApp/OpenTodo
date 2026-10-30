# Spec Delta

## ADDED Requirements

### Requirement: Part of the day as a calendar property
A task with the part Morning or Afternoon SHALL be served with `X-OPENTODO-DAY-PART:MORNING` or `X-OPENTODO-DAY-PART:AFTERNOON`, omitted otherwise; Evening SHALL stay `X-OPENTODO-EVENING:TRUE` only. A client that sends `X-OPENTODO-DAY-PART` SHALL set the part as OpenSpec `day-parts` pairs it (the evening flag cleared), written as operations like every CalDAV write; an unknown value SHALL be ignored and kept in `ical_extra`. A client that sends only `X-OPENTODO-EVENING` SHALL change only the evening flag, and a client that never sends the property SHALL leave the part unchanged. The property SHALL never be stored in `ical_extra` when mapped.

#### Scenario: Morning task served
- **WHEN** a task set to Morning is fetched
- **THEN** the VTODO carries `X-OPENTODO-DAY-PART:MORNING` and no `X-OPENTODO-EVENING`

#### Scenario: Afternoon from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-DAY-PART:AFTERNOON` for an evening task
- **THEN** the task's part is Afternoon, its evening flag is cleared, and devices show it after their next sync

#### Scenario: Client without the property
- **WHEN** a client that never sends X- properties edits the summary of a Morning task
- **THEN** the task stays in Morning
