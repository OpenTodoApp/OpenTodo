## MODIFIED Requirements

### Requirement: Due forms and recurrence
A task without a deadline SHALL be served with DUE = its due date: DATE for a due without time, floating DATE-TIME for a floating due with time, and for a zoned due the same instant as a UTC DATE-TIME (`…Z`, no VTIMEZONE) when the task does not repeat, or DATE-TIME with TZID when it repeats, so its occurrences follow the zone's daylight saving time. A TZID SHALL be served with a VTIMEZONE placed before the VTODO whose TZID equals the IANA name and which defines the zone by its current yearly rules (one STANDARD and one DAYLIGHT observance with a yearly RRULE and a DTSTART in 1970, or one STANDARD observance for a zone without daylight saving time), or, for a zone whose transitions follow no yearly weekday rule, by one-off observances from the year of the due through the following four. Inbound, a UTC DATE-TIME on a task whose due is fixed to another zone SHALL be read in the task's zone: the instant the server served SHALL leave the due exactly as it is and write no operation, and another instant SHALL set the wall date and time it falls on in that zone, keeping the zone; a DATE-TIME with a TZID SHALL set that zone as before. Nothing is stored for this: the zone stays the task's own field, every device converges on the written value by the usual last-writer-wins rule, and a device offline in the meantime receives it on its next sync. A due with a time SHALL also be served with DTSTART equal to DUE, so clients that schedule by DTSTART show it as scheduled; a due without time SHALL be served without DTSTART. Inbound, a VTODO with only DUE SHALL set the due date of a task without a deadline, and a VTODO with DTSTART and a duration (`ESTIMATED-DURATION` or `DURATION`) and no DUE SHALL set the due date from DTSTART (see "Inbound date shapes"). RRULE SHALL map to the task's recurrence rule where the recurrence grammar expresses it, and completing a recurring task through CalDAV SHALL behave as completing it in the app. A rule with `for N times` SHALL be served with `UNTIL` set to the date of its last remaining occurrence instead of `COUNT`, and an inbound RRULE equal to the one served SHALL leave the rule unchanged. A recurring task SHALL be served with one `EXDATE` listing every exception date of the series (OpenSpec `recurring-tasks`, "Exceptions come from the records") on or after its due date, in the form of its DTSTART, and each open occurrence record SHALL be served as its own VTODO. A recurring task SHALL keep its due date when a client sends back the served DTSTART without the DUE. A client that completes one occurrence as an override (a VTODO with RECURRENCE-ID and STATUS:COMPLETED next to the unchanged series) SHALL complete that occurrence as completing it in the app does: when the override's date is the task's due date, the current occurrence and the series moves on; when it is a later occurrence date, that occurrence alone. An override with `STATUS:CANCELLED`, and a date added to the series' `EXDATE`, SHALL skip that occurrence; a date removed from `EXDATE` SHALL turn its skipped record into an open occurrence. An override that changes `DUE`, `DTSTART`, `SUMMARY` or `PRIORITY` SHALL move or edit that occurrence alone. An override of a date that is not an occurrence date of the series, or is before its due date, SHALL change nothing. Overrides SHALL NOT be stored; the next fetch serves the series with the EXDATE and any open record as its own object.

#### Scenario: Zoned due
- **WHEN** a client sends `DUE;TZID=Europe/Berlin:20261011T093000` and no DTSTART
- **THEN** the task's due is 09:30 on 2026-10-11 fixed to `Europe/Berlin`, it has no deadline, and it is served back with `DUE:20261011T073000Z` and `DTSTART:20261011T073000Z`, without a VTIMEZONE

#### Scenario: Zoned due echoed in UTC
- **WHEN** a task due 2026-07-10 at 09:00 fixed to `Europe/Berlin` is fetched by Apple Reminders and sent back unchanged with `DUE:20260710T070000Z`
- **THEN** no operation is written and the task stays due at 09:00 fixed to `Europe/Berlin`

#### Scenario: Zoned due moved in UTC
- **WHEN** the client sends the same task back with `DUE:20260711T083000Z` and `DTSTART:20260711T083000Z`
- **THEN** the task is due 2026-07-11 at 10:30 fixed to `Europe/Berlin`, written as one operation with the CalDAV device id

#### Scenario: Zoned repeating task
- **WHEN** a task due 2026-07-10 at 09:00 fixed to `Europe/Berlin` that repeats every week is fetched
- **THEN** the VTODO carries `DUE;TZID=Europe/Berlin:20260710T090000`, and a VTIMEZONE before it with `TZID:Europe/Berlin`, a DAYLIGHT observance with `RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU` and a STANDARD observance with `RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU`

#### Scenario: Recurring task
- **WHEN** a client sends `RRULE:FREQ=WEEKLY` on a task and later marks it completed
- **THEN** the task's rule is `every week`, and the completion records an occurrence and moves the task to its next due date as in the app

#### Scenario: Recurring task moved by a client that writes no DUE
- **WHEN** a recurring task due 2026-10-13 at 09:00 was served with `DTSTART` = `DUE` and a client sends it back with `DTSTART:20261014T090000`, `ESTIMATED-DURATION:PT1H` and no `DUE`
- **THEN** the task is due 2026-10-14 at 09:00, keeps its rule, and every device shows the new date after sync; nothing is cleared

#### Scenario: Scheduled from an undated task
- **WHEN** a task with no dates is sent back by a client with `DTSTART:20261020T140000` and `ESTIMATED-DURATION:PT30M` and no `DUE`
- **THEN** the task is due 2026-10-20 at 14:00 with a 30-minute estimate, written as operations, and is served back with `DUE:20261020T140000` and `ESTIMATED-DURATION:PT30M`

#### Scenario: Occurrence completed as an override
- **WHEN** a task due 2 November repeats every day and a client sends the series unchanged with an override `RECURRENCE-ID;VALUE=DATE:20261102` that has `STATUS:COMPLETED`
- **THEN** an occurrence record for 2 November is added to Completed, the task stays open and is due 3 November, and it is served back without the override

#### Scenario: Override of another day
- **WHEN** the same client sends a completed override for 5 November while the task is due 2 November
- **THEN** the occurrence of 5 November is added to Completed, the task stays due 2 November, and it is served back with `EXDATE;VALUE=DATE:20261105` and without the override

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` and `DTSTART:20261011T093000` with no time zone, and a client in any time zone shows 09:30 on that date

#### Scenario: Due date without time
- **WHEN** a task due `2026-10-11` without a time and without a deadline is fetched
- **THEN** the VTODO carries `DUE;VALUE=DATE:20261011` and no DTSTART

#### Scenario: Exceptions served
- **WHEN** a task with `every monday` due 2026-10-12 at 09:00 has a skipped record for the 19th and an open record of the 26th moved to the 27th
- **THEN** it is served with `EXDATE:20261019T090000,20261026T090000`, and the moved occurrence is served as its own VTODO due 2026-10-27

#### Scenario: Client deletes one occurrence
- **WHEN** a client adds `20261019T090000` to the series' `EXDATE`
- **THEN** the occurrence of the 19th is skipped, every device stops showing it, and the series keeps its due date

#### Scenario: Counted rule served with an end date
- **WHEN** a task with `every day for 5 times` and two done records is due 2026-10-12 and is fetched
- **THEN** its RRULE is `FREQ=DAILY;UNTIL=20261014`, and sending that RRULE back leaves the rule `every day for 5 times`

#### Scenario: Override for a date that is not an occurrence
- **WHEN** a client sends a completed override for a Tuesday of a series with `every monday`
- **THEN** nothing is completed and the series is unchanged

