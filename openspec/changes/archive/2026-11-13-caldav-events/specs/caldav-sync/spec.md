## ADDED Requirements

### Requirement: Event mode of an app password
An app password SHALL be created to show tasks as to-dos (the default) or as events, and the choice SHALL be shown in the app password list. In event mode, its calendars SHALL be served as event calendars (`supported-calendar-component-set` VEVENT) holding one event per open task with a due date in its calendar, written as Calendar sync writes it: a timed task for its estimate (30 minutes without one), a date-only task all-day, a multi-day task as one all-day event over its days, the notes as the description, the task's page as the URL, a recurring task as its next occurrence. Moving, resizing or renaming an event SHALL change the task's due, start, estimate or title; deleting an event SHALL clear the task's due date and never delete the task; a new event SHALL become a task. Writes go through operations with device `caldav:<app-password-id>`, and the password's scope applies.

#### Scenario: A multi-day task in Apple Calendar
- **WHEN** a person adds a CalDAV account with an event-mode app password and has a task from 3 to 5 November in the project Trip
- **THEN** the calendar Trip shows one all-day event from 3 to 5 November, not a reminder

#### Scenario: Moving the event
- **WHEN** the person drags a timed task's event from 09:00 to 11:00
- **THEN** the task is due at 11:00 and other devices show it after their next sync

#### Scenario: Deleting the event
- **WHEN** the person deletes the event
- **THEN** the task stays, without a due date

#### Scenario: To-do mode unchanged
- **WHEN** an app password created without a choice is used
- **THEN** its calendars hold VTODOs as before
