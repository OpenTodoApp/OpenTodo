## MODIFIED Requirements

### Requirement: Writes become operations
A PUT that creates or changes a VTODO, or a VEVENT read as a task, SHALL be applied as operations with server time and a device id `caldav:<app-password-id>`, one per property whose mapped value differs from the current value, and nothing SHALL be written outside the operation log. Devices receive the result on their next sync and are woken like after any REST write; offline devices apply it later under last-writer-wins.

#### Scenario: Create from a calendar client
- **WHEN** a client PUTs a new VTODO with a summary and a due date into a project calendar
- **THEN** a task with that id, title, due date and project exists, the response is 201 with an ETag, and other devices show the task after their next sync

#### Scenario: Concurrent edits of different fields converge
- **WHEN** a client changes a task's due date through CalDAV while a device changes its priority offline, and the device then syncs
- **THEN** the app, the device and the CalDAV client all end with the new due date and the new priority

#### Scenario: Invalid calendar data
- **WHEN** a PUT body is not parseable iCalendar, holds a VJOURNAL or VFREEBUSY instead of a VTODO or VEVENT, or holds both a VTODO and a VEVENT
- **THEN** the response is 415 or 403 with a precondition error element and no operation is written

## ADDED Requirements

### Requirement: Events become tasks
A VEVENT a client PUTs into a calendar SHALL be read as a task, not refused: its summary, description, alarms and categories map as a VTODO's do, its start is the due date (with the time when timed), a timed event's positive length up to one week is the estimate, a repeat rule maps as a VTODO's does, and a cancelled event is completed. The task SHALL be served back as a VTODO under the same name and UID. It converges like any CalDAV write.

#### Scenario: Timed event from a phone's calendar
- **WHEN** a client PUTs a VEVENT "Dentist" from 09:30 to 10:30 Europe/Berlin on 3 November with a 30-minute alarm into the Inbox calendar
- **THEN** the response is 201, a task "Dentist" is due on 3 November at 09:30 Europe/Berlin with a 60-minute estimate and one reminder, the next fetch of that resource returns a VTODO with the same UID and no VEVENT, and other devices show the task after their next sync

#### Scenario: All-day event
- **WHEN** a client PUTs an all-day VEVENT from 24 to 27 December
- **THEN** the task is due on 24 December without a time and without an estimate

#### Scenario: Event moved from another calendar
- **WHEN** a client moves an event from a calendar on another server into an OpenTodo calendar, which it does with a PUT there and a DELETE at the other server
- **THEN** the event exists as a task in that OpenTodo calendar and nothing is lost

#### Scenario: Recurring event
- **WHEN** a client PUTs a VEVENT that repeats every Monday
- **THEN** the task repeats every Monday; a rule the task grammar cannot express is kept as client data and the task is created without a repeat

#### Scenario: Journal still refused
- **WHEN** a client PUTs a VJOURNAL
- **THEN** the response is 403 with the supported-calendar-component precondition and no operation is written
