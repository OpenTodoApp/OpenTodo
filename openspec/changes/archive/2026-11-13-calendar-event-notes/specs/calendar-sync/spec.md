## MODIFIED Requirements

### Requirement: Tasks written to the calendar
For a connection with a target calendar, the server SHALL write each task of the user's task feed selection (open, visible to the user, with a due date from 30 days back to 365 days ahead) as one event `<task-id>.ics` with the task id as UID: a timed task as an event of its estimate (30 minutes without one) in its zone, or floating; a date-only task as an all-day event only when **Include tasks without a time** is on. A recurring task SHALL be written as its next occurrence. The event SHALL carry the task's notes as its description (none for an encrypted account) and a link to the task's page, `<base URL>/task/<id>`, as its URL (a Microsoft event, which has no URL, ends its text with the link); a change of the notes SHALL rewrite the event, while reading the calendar back SHALL compare only its times and title. Creation SHALL use `If-None-Match: *`, changes and deletions `If-Match` with the stored ETag. Completed, deleted, undated and out-of-window tasks SHALL have their event removed. Offline edits reach the calendar after the device syncs and the next cycle runs.

#### Scenario: A timed task
- **WHEN** a task is due 2026-11-03 at 09:00 in Europe/Berlin with an estimate of 45 minutes
- **THEN** within a cycle the target calendar holds an event from 09:00 to 09:45 Europe/Berlin titled like the task

#### Scenario: Notes added later
- **WHEN** a multi-day task's event exists and the user then adds notes to the task
- **THEN** the next cycle rewrites the event with the notes as its description and its URL pointing at the task, and the cycle after writes nothing

#### Scenario: A date-only task with the option off
- **WHEN** a task is due 2026-11-03 without a time and the option is off
- **THEN** no event is written for it

#### Scenario: Task completed
- **WHEN** the user completes a task whose event exists
- **THEN** the next cycle deletes the event
