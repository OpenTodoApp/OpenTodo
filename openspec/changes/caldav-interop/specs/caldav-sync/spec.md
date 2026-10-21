## MODIFIED Requirements

### Requirement: Property mapping
Each task SHALL be one VTODO resource, by default `<task-id>.ics` with UID equal to the task id; a client-chosen resource name or a UID that is not a usable task id SHALL be kept. The mapping SHALL be: SUMMARY↔title, DESCRIPTION↔description, DUE and DTSTART↔due and deadline (see "Deadline mapping" and "Inbound date shapes"), ESTIMATED-DURATION↔estimate_minutes (see "Estimate mapping"), VALARM↔reminders (see "Alarms as reminders"), PRIORITY↔priority (1→1, 2→5, 3→9, 4→0; inbound 1–3→1, 4–6→2, 7–9→3, 0→4), STATUS/COMPLETED↔completed_at, CATEGORIES↔labels by name, RELATED-TO (parent)↔parent_id, CREATED↔created_at.

#### Scenario: Due date with time
- **WHEN** a task due `2026-10-11` at `09:30` and without a deadline is fetched
- **THEN** the VTODO carries `DUE:20261011T093000` with no time zone and no DTSTART, and a client in any time zone shows 09:30 on that date

#### Scenario: Priority round trip
- **WHEN** a client sets PRIORITY 5 on a task
- **THEN** the task has priority 2 in the app and is served back with PRIORITY 5

#### Scenario: Estimate and reminder in the mapping
- **WHEN** a task with a 45-minute estimate and a "30 minutes before" reminder is fetched
- **THEN** the VTODO carries `ESTIMATED-DURATION:PT45M` and one VALARM with `TRIGGER:-PT30M`, and neither appears a second time as preserved client data

### Requirement: Due forms and recurrence
A task without a deadline SHALL be served with DUE = its due date: DATE for a due without time, floating DATE-TIME for a floating due with time, and DATE-TIME with TZID (served with a VTIMEZONE) for a zoned due. Inbound, a VTODO with only DUE SHALL set the due date of a task without a deadline, and a VTODO with DTSTART and a duration (`ESTIMATED-DURATION` or `DURATION`) and no DUE SHALL set the due date from DTSTART (see "Inbound date shapes"). RRULE SHALL map to the task's recurrence rule where the recurrence grammar expresses it, and completing a recurring task through CalDAV SHALL behave as completing it in the app. A recurring task SHALL keep its due date when a client sends back the served DTSTART without the DUE.

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
- **THEN** the task is due 2026-10-20 at 14:00 with a 30-minute estimate, written as operations, and is served back with `DUE:20261020T140000` and `ESTIMATED-DURATION:PT30M`

### Requirement: Deadline mapping
A task with a deadline SHALL be served with DUE = the deadline as a DATE and, when it has a due date, DTSTART = the due date in the forms above. Inbound, DTSTART and DUE that differ SHALL set the due date from DTSTART and the deadline from the date of DUE; equal ones SHALL set the due date only. A DUE without DTSTART on a task that has a deadline SHALL set the deadline and clear the due date. A VTODO without DUE SHALL never clear the deadline: on a task that has one, DTSTART with a duration sets the due date and keeps the deadline, and a VTODO with neither DUE nor DTSTART keeps both dates as they are (see "Inbound date shapes").

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

#### Scenario: Deadline-only task edited in a client
- **WHEN** a task with the deadline `2026-11-20` and no due date is edited in a client that sends back only its `DUE;VALUE=DATE:20261120` with a new SUMMARY
- **THEN** the task keeps the deadline `2026-11-20`, has no due date and has the new title

#### Scenario: Deadline task moved by a client that writes no DUE
- **WHEN** a task due 2026-10-13 with the deadline 2026-10-17 was served with `DTSTART` and `DUE` and a client sends it back with `DTSTART;VALUE=DATE:20261015`, `ESTIMATED-DURATION:PT2H` and no `DUE`
- **THEN** the task is due 2026-10-15, keeps the deadline 2026-10-17, gains a 2-hour estimate, and is served back with `DTSTART;VALUE=DATE:20261015` and `DUE;VALUE=DATE:20261017`

### Requirement: Unmapped properties preserved
Properties not in the mapping, including X- properties, RRULEs the recurrence grammar cannot express, a DTSTART that sets nothing (see "Inbound date shapes") and alarms the alarm mapping cannot express, SHALL be stored in the task's `ical_extra` field and returned unchanged. A property the mapping consumes (ESTIMATED-DURATION, a mapped VALARM) SHALL NOT also be stored there.

#### Scenario: Alarm survives a round trip
- **WHEN** a client adds a VALARM with `ACTION:AUDIO` and `REPEAT:3` (one the alarm mapping cannot express) to a task and another device later edits the title
- **THEN** the next fetch of the task still contains that VALARM unchanged and the new title, and the task has no reminder from it

#### Scenario: Mapped alarm is not duplicated
- **WHEN** a client adds a VALARM with `TRIGGER:-PT15M` and `ACTION:DISPLAY` to a task
- **THEN** the task gets one reminder, the next fetch carries exactly one VALARM for it, and `ical_extra` holds no VALARM

## ADDED Requirements

### Requirement: Estimate mapping
A task with a duration estimate SHALL be served with `ESTIMATED-DURATION` as an iCalendar duration in hours and minutes (`PT45M`, `PT1H30M`, `P1DT2H` is never produced: the value is expressed in hours and minutes only), and SHALL carry none when it has no estimate. Inbound, an `ESTIMATED-DURATION` SHALL set `estimate_minutes` to its length in whole minutes, rounded up for a value with seconds, and SHALL be refused as invalid calendar data (403 `valid-calendar-data`) when it is negative, zero, not a duration, or longer than the field's limit of 10080 minutes. A VTODO without `ESTIMATED-DURATION` SHALL leave the estimate as it is. The write is an ordinary operation: offline devices receive it on their next sync and the field converges by last-writer-wins like every other field.

#### Scenario: Estimate served
- **WHEN** a task with `estimate_minutes` 90 is fetched
- **THEN** the VTODO carries `ESTIMATED-DURATION:PT1H30M`

#### Scenario: Estimate set by a client
- **WHEN** a client PUTs a VTODO with `ESTIMATED-DURATION:PT2H` on a task without an estimate
- **THEN** the task's estimate is 120 minutes, written as an operation with the CalDAV device id, and devices show it on the row and in the Day view after their next sync

#### Scenario: Client without the property
- **WHEN** a client that never sends `ESTIMATED-DURATION` edits the summary of a task with a 45-minute estimate
- **THEN** the task keeps its estimate, because absence is not removal

#### Scenario: Seconds rounded up
- **WHEN** a client sends `ESTIMATED-DURATION:PT20M30S`
- **THEN** the task's estimate is 21 minutes and the next fetch serves `PT21M`

#### Scenario: Invalid estimate
- **WHEN** a client sends `ESTIMATED-DURATION:P2W` or `ESTIMATED-DURATION:-PT1H` or `ESTIMATED-DURATION:soon`
- **THEN** the response is 403 with the `valid-calendar-data` precondition and no operation is written

#### Scenario: Concurrent estimate edits converge
- **WHEN** a calendar client sets `ESTIMATED-DURATION:PT1H` while a device offline sets the estimate to 30 minutes with a later timestamp, and the device syncs
- **THEN** every device, the app and the next CalDAV fetch show 30 minutes

### Requirement: Inbound date shapes
The server SHALL decide what an inbound VTODO does to `due` and `deadline` from the shape of its date properties alone, as follows, and SHALL never clear a date the shape does not name. "Duration" means `ESTIMATED-DURATION` or `DURATION`.

| Shape | `due` | `deadline` |
| --- | --- | --- |
| `DUE` only, task without a deadline | set from `DUE` | unchanged (none) |
| `DUE` only, task with a deadline | cleared | set from the date of `DUE` |
| `DTSTART` and `DUE`, equal | set from `DUE` | unchanged |
| `DTSTART` and `DUE`, different | set from `DTSTART` | set from the date of `DUE` |
| `DTSTART` and a duration, no `DUE` | set from `DTSTART` | unchanged |
| `DTSTART` alone, no `DUE`, no duration | unchanged | unchanged |
| neither `DTSTART` nor `DUE`, no duration | cleared | unchanged |

A `DTSTART` that sets nothing SHALL be kept as client data as before. The row "neither" is the only shape that clears the due date and SHALL NOT clear the deadline. The shapes SHALL be decided the same way on a create and on an update, and the resulting writes SHALL be ordinary operations that converge by last-writer-wins with devices that edit the same fields offline.

#### Scenario: Due date cleared on purpose
- **WHEN** a client removes the due date of a plain task and sends the VTODO back with no `DUE`, no `DTSTART` and no duration
- **THEN** the task has no due date and its deadline, if any, is unchanged

#### Scenario: Bare DTSTART leaves dates alone
- **WHEN** a client sends a VTODO with `DTSTART;VALUE=DATE:20261013` and nothing else about dates on a task due 2026-10-20 with the deadline 2026-10-24
- **THEN** the task is still due 2026-10-20 with the deadline 2026-10-24, and the `DTSTART` line is served back as client data

#### Scenario: Deferred task scheduled by a client
- **WHEN** a parked task (served with `X-OPENTODO-START:SOMEDAY`, no dates) is sent back by a client with `DTSTART:20261020T100000`, `ESTIMATED-DURATION:PT1H`, no `DUE` and the `X-OPENTODO-START` line unchanged
- **THEN** the task is due 2026-10-20 at 10:00 and stays parked, exactly as if the due date had been set through the API on a parked task

#### Scenario: Shape table on create
- **WHEN** a client creates a new VTODO with `DTSTART:20261020T140000` and `DURATION:PT30M` and no `DUE`
- **THEN** a task due 2026-10-20 at 14:00 is created with no deadline, and the response is 201

#### Scenario: Concurrent due edits converge
- **WHEN** a client sets the due date through the `DTSTART` + duration shape while a device moves the same task's deadline offline, and the device syncs
- **THEN** the task has the client's due date and the device's deadline on every device, because the shapes write only the fields they name

### Requirement: Alarms as reminders
The server SHALL serve each live reminder of a task (not deleted, not on a deleted task) as one `VALARM` with `ACTION:DISPLAY`, a `DESCRIPTION` equal to the task title, a `UID` and `X-WR-ALARMUID` derived from the reminder id (stable across fetches), and a `TRIGGER` as follows: a relative reminder as `TRIGGER;RELATED=END:<signed duration>` (the offset from the due time; `-PT30M` for 30 minutes before), a deadline reminder as `TRIGGER;RELATED=END:<signed duration>` with `X-OPENTODO-KIND:DEADLINE`, an absolute reminder as `TRIGGER;VALUE=DATE-TIME:<UTC instant>`. A reminder without a firing time (a relative reminder on a task without a due date) SHALL still be served with its relative trigger.

Inbound, each `VALARM` of a VTODO SHALL become a reminder: `ACTION:DISPLAY` (or no `ACTION`) with a relative `TRIGGER` becomes a relative reminder with that offset in minutes (`RELATED=END` and the default alike; `RELATED=START` on a VTODO served with a `DTSTART` that is the due date is the same offset, and on a VTODO whose `DTSTART` is not the due date it stays client data), one carrying `X-OPENTODO-KIND:DEADLINE` becomes a deadline reminder, and `TRIGGER;VALUE=DATE-TIME` becomes an absolute reminder at that instant. A `VALARM` whose `UID` or `X-WR-ALARMUID` matches a served reminder SHALL update that reminder; one without a match SHALL create a reminder; a served reminder whose `VALARM` is absent from a VTODO that carries at least one `VALARM` or that was served with at least one SHALL be deleted (tombstoned). A VTODO from a client that never sent or received a `VALARM` SHALL leave the task's reminders alone. An inbound `VALARM` with `ACTION:AUDIO`, `ACTION:EMAIL`, `ACTION:PROCEDURE`, `REPEAT`, `DURATION`, a trigger that does not parse, a `RELATED=START` the rule above cannot place, or a `TRIGGER` beyond the reminder offset limit SHALL be kept as client data and SHALL create no reminder. At most 20 alarms per VTODO SHALL map; further ones stay client data.

Reminders written this way SHALL be ordinary reminder operations with the CalDAV device id, applied in the same batch as the task's other fields: a relative reminder gets its firing time computed from the task's due date in that batch (09:00 for a date-only due, in the user's last reported zone), a deadline reminder from the deadline, and the existing rules apply afterwards (recomputed when a device moves the due date, dismissed by the server when the task completes, the Trash rule). Delivered and dismissed times are never exchanged with the client. A reminder's ETag contribution: the resource's ETag SHALL change when any live reminder of the task is added, changed or deleted on any device.

#### Scenario: Reminder served as an alarm
- **WHEN** a task due 2026-10-13 at 09:30 with a reminder "30 minutes before" and an absolute reminder at 2026-10-12 18:00 UTC is fetched
- **THEN** the VTODO carries two VALARMs: one with `TRIGGER;RELATED=END:-PT30M` and one with `TRIGGER;VALUE=DATE-TIME:20261012T180000Z`, each with `ACTION:DISPLAY` and a UID that is the same on the next fetch

#### Scenario: Alarm from a client becomes a reminder
- **WHEN** a client PUTs a VTODO due 2026-10-13 at 09:30 with a VALARM `TRIGGER:-PT15M` and `ACTION:DISPLAY`
- **THEN** the task has a relative reminder with offset −15 firing at 09:15 on 2026-10-13 in the user's zone, the write is one batch with the CalDAV device id, the response is 201 or 204, and devices show the reminder in the task panel after their next sync

#### Scenario: Absolute alarm
- **WHEN** a client PUTs a VALARM with `TRIGGER;VALUE=DATE-TIME:20261011T073000Z` (the Apple Reminders fixture)
- **THEN** the task has an absolute reminder firing at that instant, and the next fetch serves the same trigger with the reminder's UID

#### Scenario: Alarm on a task without a due date
- **WHEN** a client PUTs a VTODO with no dates and a VALARM `TRIGGER:-PT1H`
- **THEN** a relative reminder with offset −60 and no firing time is created, it does not fire, and it is served back with `TRIGGER;RELATED=END:-PT1H`

#### Scenario: Deadline reminder round trip
- **WHEN** a task with the deadline 2026-11-06 and a reminder "1 day before the deadline" is fetched and sent back unchanged by a client
- **THEN** the served VALARM carries `TRIGGER;RELATED=END:-P1D` and `X-OPENTODO-KIND:DEADLINE`, and the write changes nothing because the alarm matches the reminder

#### Scenario: Alarm edited in the client
- **WHEN** a client changes a served alarm's trigger from `-PT30M` to `-PT1H`, keeping its UID
- **THEN** the same reminder's offset becomes −60 and its firing time moves one hour earlier on every device after sync; no second reminder is created

#### Scenario: Alarm removed in the client
- **WHEN** a client fetched a task with two served alarms and PUTs it back with one of them removed
- **THEN** the matching reminder is deleted (tombstoned) and the other is unchanged

#### Scenario: Client that knows nothing about alarms
- **WHEN** a client that never fetched or sent a VALARM for a task (a VTODO it created without alarms, before the task got a reminder from a device) edits the task's summary
- **THEN** the task's reminders are unchanged, because the client neither sent nor had received an alarm for the task

#### Scenario: Dismissal stays local
- **WHEN** a device dismisses a reminder that a calendar client sees as an alarm
- **THEN** the alarm is still served unchanged and the reminder keeps its dismissed time; nothing is written from the next CalDAV fetch

#### Scenario: Too many alarms
- **WHEN** a client PUTs a VTODO with 25 display alarms
- **THEN** the first 20 become reminders and the other five are kept as client data and served back unchanged

#### Scenario: Reminder change moves the ETag
- **WHEN** a device adds a reminder to a task a calendar client holds
- **THEN** the client's next sync-collection report lists the resource with a new ETag and the fetched VTODO carries the new VALARM

#### Scenario: Concurrent alarm edits converge
- **WHEN** a client changes an alarm's trigger while a device deletes the same reminder offline with a later timestamp, and the device syncs
- **THEN** every device shows the reminder deleted and the next CalDAV fetch carries no VALARM for it

#### Scenario: Unauthenticated alarm write
- **WHEN** a PUT with a VALARM arrives without valid app-password credentials
- **THEN** the response is 401 and no reminder is written

### Requirement: Real-client verification
The CalDAV documentation SHALL carry a verification table with one row per client (Apple Reminders on iOS and macOS, Thunderbird, DAVx⁵ with Tasks.org and jtx Board, Mitra) and one column per behaviour of this capability (due forms, deadline mapping, inbound date shapes, estimates, alarms both ways, recurrence completion, moves, deletion, incremental sync), each cell stating the client version, the date and the result or "not verified". A behaviour a client cannot support SHALL say so in its cell rather than be left blank.

#### Scenario: Table present
- **WHEN** a reader opens the CalDAV guide
- **THEN** they find the verification table with every client and every behaviour, and no cell is blank

#### Scenario: Unverified behaviour is honest
- **WHEN** a behaviour has not been exercised against a client
- **THEN** its cell says "not verified" with the date of the last attempt, and the guide does not claim it works there
