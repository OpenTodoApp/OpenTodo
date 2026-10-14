# Spec Delta

## MODIFIED Requirements

### Requirement: Property mapping
Each task SHALL be served as one VTODO resource, by default `<task-id>.ics` with UID equal to the task id; a client-chosen resource name or a UID that is not a usable task id SHALL be kept. The mapping SHALL be: SUMMARY↔title, DESCRIPTION↔description, DUE and DTSTART↔due and deadline as defined under "Due forms and recurrence", PRIORITY↔priority (1→1, 2→5, 3→9, 4→0; inbound 1–3→1, 4–6→2, 7–9→3, 0→4), STATUS/COMPLETED↔completed_at, CATEGORIES↔labels by name, RELATED-TO (parent)↔parent_id, CREATED↔created_at.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` with no time zone and no DTSTART, and a client in any time zone shows 09:30 on that date

#### Scenario: Priority round trip
- **WHEN** a client sets PRIORITY 5 on a task
- **THEN** the task has priority 2 in the app and is served back with PRIORITY 5

### Requirement: Due forms and recurrence
A task without a deadline SHALL be served with DUE = its due date: DATE for a due without time, floating DATE-TIME for a floating due with time, and DATE-TIME with TZID (served with a VTIMEZONE) for a zoned due. A task with a deadline SHALL be served with DUE = the deadline as a DATE and, when it has a due date, DTSTART = the due date in the same forms. Inbound, a VTODO with only DUE SHALL set the due date; one whose DTSTART and DUE differ SHALL set the due date from DTSTART and the deadline from the date of DUE; one whose DTSTART equals DUE SHALL set the due date only. RRULE SHALL map to the task's recurrence rule where the recurrence grammar expresses it, and completing a recurring task through CalDAV SHALL behave as completing it in the app.

#### Scenario: Zoned due
- **WHEN** a client sends `DUE;TZID=Europe/Berlin:20261011T093000` and no DTSTART
- **THEN** the task's due is 09:30 on 2026-10-11 fixed to `Europe/Berlin`, it has no deadline, and it is served back with the same TZID and a VTIMEZONE

#### Scenario: Recurring task
- **WHEN** a client sends `RRULE:FREQ=WEEKLY` on a task and later marks it completed
- **THEN** the task's rule is `every week`, and the completion records an occurrence and moves the task to its next due date as in the app

#### Scenario: Deadline served
- **WHEN** a task due `2026-10-13` at `09:30` with the deadline `2026-10-17` is fetched
- **THEN** the VTODO carries `DTSTART:20261013T093000` and `DUE;VALUE=DATE:20261017`, and a calendar client shows it starting on the 13th and due on the 17th

#### Scenario: Deadline without a due date
- **WHEN** a task with no due date and the deadline `2026-10-17` is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261017` and no DTSTART

#### Scenario: Start and due from a client
- **WHEN** a client PUTs a VTODO with `DTSTART;VALUE=DATE:20261013` and `DUE;VALUE=DATE:20261017`
- **THEN** the task is due 2026-10-13 with the deadline 2026-10-17, written as operations, and devices show both after their next sync

#### Scenario: Timed DUE with a start keeps the day
- **WHEN** a client PUTs `DTSTART:20261013T090000` and `DUE:20261017T170000`
- **THEN** the task is due 2026-10-13 at 09:00 with the deadline 2026-10-17, and the resource is served back with `DUE;VALUE=DATE:20261017`

#### Scenario: Recurring anchor unchanged
- **WHEN** a recurring task without a deadline is fetched
- **THEN** its DTSTART equals its DUE as before, and a client sending that pair back leaves the task without a deadline
