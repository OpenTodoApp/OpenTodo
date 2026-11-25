# Spec Delta

## MODIFIED Requirements

### Requirement: Tasks written to the calendar
For a connection with a target calendar, the server SHALL write each task of the user's task feed selection (open, visible to the user, with a due date from 30 days back to 365 days ahead) as one event `<task-id>.ics` with the task id as UID: a timed task as an event of its estimate (30 minutes without one) in its zone; a floating timed task at its wall-clock time in the calendar's time zone, with that zone's TZID and VTIMEZONE, when the calendar names one, and floating otherwise, so every calendar app shows the same time (a client may read a floating time as UTC); reading it back SHALL keep the task floating at the event's wall time in its zone; a date-only task as an all-day event only when **Include tasks without a time** is on. A recurring task SHALL be written as its next occurrence. The event SHALL carry the task's notes as its description (none for an encrypted account) and a link to the task's page, `<base URL>/task/<id>`, as its URL (a Microsoft event, which has no URL, ends its text with the link); a change of the notes, or of the time zone a floating task is written in, SHALL rewrite the event, while reading the calendar back SHALL compare only its times and title. Creation SHALL use `If-None-Match: *`; when the calendar refuses the task id as UID with 409 (Google keeps a deleted event's UID in its Bin for 30 days), the event SHALL be created once more with the UID `<task-id>-<8 hex digits>` as `<that UID>.ics`, and every later change of it SHALL keep that UID. Changes and deletions `If-Match` with the stored ETag. Completed, deleted, undated and out-of-window tasks SHALL have their event removed. Offline edits reach the calendar after the device syncs and the next cycle runs.

#### Scenario: A timed task
- **WHEN** a task is due 2026-11-03 at 09:00 in Europe/Berlin with an estimate of 45 minutes
- **THEN** within a cycle the target calendar holds an event from 09:00 to 09:45 Europe/Berlin titled like the task

#### Scenario: A floating task in a calendar with a time zone
- **WHEN** the target calendar's time zone is Europe/Amsterdam and a floating task is due 2026-11-26 at 13:00, another 2027-07-01 at 10:00
- **THEN** the events start at `DTSTART;TZID=Europe/Amsterdam:20261126T130000` (12:00 UTC) and `DTSTART;TZID=Europe/Amsterdam:20270701T100000` (08:00 UTC), the calendar object carries the Europe/Amsterdam VTIMEZONE, and the next cycle changes and writes nothing

#### Scenario: An event written floating before
- **WHEN** a floating task's event was written as a floating time and discovery now reports the calendar's time zone
- **THEN** the next cycle writes the event once more in that zone and the cycle after writes nothing

#### Scenario: Notes added later
- **WHEN** a multi-day task's event exists and the user then adds notes to the task
- **THEN** the next cycle rewrites the event with the notes as its description and its URL pointing at the task, and the cycle after writes nothing

#### Scenario: A date-only task with the option off
- **WHEN** a task is due 2026-11-03 without a time and the option is off
- **THEN** no event is written for it

#### Scenario: Task completed
- **WHEN** the user completes a task whose event exists
- **THEN** the next cycle deletes the event

#### Scenario: A task written again after its event went to Google's Bin
- **WHEN** a task's event was removed because the task was completed, and the task is reopened
- **THEN** the next cycle creates its event as `<task-id>-<8 hex digits>.ics` with that UID instead of failing with `http_409`, and a later rename of the task rewrites that event
