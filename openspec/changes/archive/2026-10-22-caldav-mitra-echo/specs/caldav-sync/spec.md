## MODIFIED Requirements

### Requirement: Due forms and recurrence
A task without a deadline SHALL be served with DUE = its due date: DATE for a due without time, floating DATE-TIME for a floating due with time, and DATE-TIME with TZID (served with a VTIMEZONE) for a zoned due. A due with a time SHALL also be served with DTSTART equal to DUE, so clients that schedule by DTSTART show it as scheduled; a due without time SHALL be served without DTSTART. Inbound, a VTODO with only DUE SHALL set the due date of a task without a deadline, and a VTODO with DTSTART and a duration (`ESTIMATED-DURATION` or `DURATION`) and no DUE SHALL set the due date from DTSTART (see "Inbound date shapes"). RRULE SHALL map to the task's recurrence rule where the recurrence grammar expresses it, and completing a recurring task through CalDAV SHALL behave as completing it in the app. A recurring task SHALL keep its due date when a client sends back the served DTSTART without the DUE.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` and `DTSTART:20261011T093000` with no time zone, and a client in any time zone shows 09:30 on that date

#### Scenario: Due date without time
- **WHEN** a task due `2026-10-11` without a time and without a deadline is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261011` and no DTSTART

#### Scenario: Zoned due
- **WHEN** a client sends `DUE;TZID=Europe/Berlin:20261011T093000` and no DTSTART
- **THEN** the task's due is 09:30 on 2026-10-11 fixed to `Europe/Berlin`, it has no deadline, and it is served back with the same TZID and a VTIMEZONE

#### Scenario: Recurring task
- **WHEN** a client sends `RRULE:FREQ=WEEKLY` on a task and later marks it completed
- **THEN** the task's rule is `every week`, and the completion records an occurrence and moves the task to its next due date as in the app

#### Scenario: Recurring task moved by a client that writes no DUE
- **WHEN** a recurring task due 2026-10-13 at 09:00 was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261014T090000`, `ESTIMATED-DURATION:PT1H` and no `DUE`
- **THEN** the task is due 2026-10-14 at 09:00, keeps its rule, and every device shows the new date after sync; nothing is cleared

#### Scenario: Scheduled from an undated task
- **WHEN** a task with no dates is sent back by a client with `DTSTART:20261020T140000` and `ESTIMATED-DURATION:PT30M` and no `DUE`
- **THEN** the task is due 2026-10-20 at 14:00 with a 30-minute estimate, written as operations, and is served back with `DUE:20261020T140000`, `DTSTART:20261020T140000` and `ESTIMATED-DURATION:PT30M`

### Requirement: Deadline mapping
A task with a deadline SHALL be served with DUE = the deadline as a DATE and, when it has a due date, DTSTART = the due date in the forms above. Inbound, DTSTART and DUE that differ SHALL set the due date from DTSTART and the deadline from the date of DUE, except when the task has no deadline and the DUE is exactly its current due date, time and zone (the DUE this server served): then the client moved the task and the due date follows DTSTART with no deadline written. Equal DTSTART and DUE SHALL set the due date only. A DUE without DTSTART on a task that has a deadline SHALL set the deadline and clear the due date. A VTODO without DUE SHALL never clear the deadline: on a task that has one, DTSTART with a duration sets the due date and keeps the deadline, and a VTODO with neither DUE nor DTSTART keeps both dates as they are (see "Inbound date shapes").

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

#### Scenario: Timed task moved by a client that echoes the served DUE
- **WHEN** a task due 2026-10-22 at 14:00 without a deadline was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261023T100000`, `DUE:20261022T140000` and `ESTIMATED-DURATION:PT30M`
- **THEN** the task is due 2026-10-23 at 10:00 with a 30-minute estimate and still has no deadline

#### Scenario: Recurring task moved by a client that echoes the served DUE
- **WHEN** a recurring task due 2026-10-13 at 09:00 was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261014T090000`, `DUE:20261013T090000` and its `RRULE`
- **THEN** the task is due 2026-10-14 at 09:00, keeps its rule and has no deadline

#### Scenario: Due-date task scheduled by a client that echoes the served DUE
- **WHEN** a task due 2026-10-22 without a time and without a deadline is sent back with `DTSTART:20261021T150000` and `DUE;VALUE=DATE:20261022`
- **THEN** the task is due 2026-10-21 at 15:00 and has no deadline

#### Scenario: A changed DUE is a deadline
- **WHEN** a task due 2026-10-21 at 15:00 without a deadline is sent back with `DTSTART:20261021T150000` and `DUE;VALUE=DATE:20261031`
- **THEN** the task keeps its due date and gains the deadline 2026-10-31

#### Scenario: Recurring anchor unchanged
- **WHEN** a recurring task without a deadline is fetched
- **THEN** its DTSTART equals its DUE as before, and a client sending that pair back leaves the task without a deadline

#### Scenario: Deadline-only task edited in a client
- **WHEN** a task with the deadline `2026-11-20` and no due date is edited in a client that sends back only its `DUE;VALUE=DATE:20261120` with a new SUMMARY
- **THEN** the task keeps the deadline `2026-11-20`, has no due date and has the new title

#### Scenario: Deadline task moved by a client that writes no DUE
- **WHEN** a task due 2026-10-13 with the deadline 2026-10-17 was served with `DTSTART` and `DUE` and a client sends it back with `DTSTART;VALUE=DATE:20261015`, `ESTIMATED-DURATION:PT2H` and no `DUE`
- **THEN** the task is due 2026-10-15, keeps the deadline 2026-10-17, gains a 2-hour estimate, and is served back with `DTSTART;VALUE=DATE:20261015` and `DUE;VALUE=DATE:20261017`

### Requirement: Unmapped properties preserved
Properties not in the mapping, including X- properties, RRULEs the recurrence grammar cannot express, a DTSTART that sets nothing (see "Inbound date shapes") and alarms the alarm mapping cannot express, SHALL be stored in the task's `ical_extra` field and returned unchanged. A property the mapping consumes (ESTIMATED-DURATION, a mapped VALARM, a DTSTART equal to a DUE with a time, which this server serves itself) SHALL NOT also be stored there.

#### Scenario: Alarm survives a round trip
- **WHEN** a client adds a VALARM with `ACTION:AUDIO` and `REPEAT:3` (one the alarm mapping cannot express) to a task and another device later edits the title
- **THEN** the next fetch of the task still contains that VALARM unchanged and the new title, and the task has no reminder from it

#### Scenario: Served start echoed back
- **WHEN** a client sends back a timed task with the `DTSTART` equal to `DUE` it was served, and a device later moves the task to another time
- **THEN** the next fetch carries one `DTSTART`, equal to the new `DUE`
