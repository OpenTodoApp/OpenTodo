## ADDED Requirements

### Requirement: Multi-day flag as a calendar property
A task drawn as a span (OpenSpec `multi-day-tasks`) SHALL carry `X-OPENTODO-SPAN:TRUE` beside its `X-OPENTODO-START`; the property SHALL be omitted when `span` is false. A client that sends `X-OPENTODO-SPAN:TRUE` or `FALSE` SHALL set the field, written as an operation like every CalDAV write; an invalid value SHALL be ignored and kept in `ical_extra`. The property SHALL never be stored in `ical_extra` when mapped. DTSTART and DUE SHALL keep their meaning from the due and deadline mapping, so a client that does not read the property shows the task on its due day.

#### Scenario: Span served
- **WHEN** a task that is a span from 2026-11-03 to 2026-11-05 without a deadline is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261105`, `X-OPENTODO-START:20261103` and `X-OPENTODO-SPAN:TRUE`, and no DTSTART

#### Scenario: Flag from a client
- **WHEN** a client PUTs a VTODO with `X-OPENTODO-START:20261103`, `DUE;VALUE=DATE:20261105` and `X-OPENTODO-SPAN:TRUE`
- **THEN** the task is a span from 3 to 5 November on every device after its next sync

#### Scenario: Invalid flag value
- **WHEN** a client PUTs `X-OPENTODO-SPAN:MAYBE`
- **THEN** the task's span is unchanged, the line is kept in `ical_extra`, and the response is 201 or 204 as for any accepted write
