## ADDED Requirements

### Requirement: Spans as all-day events
A task of the user's task feed selection that is drawn as a span (OpenSpec `multi-day-tasks`) SHALL be written to the target calendar as one all-day event from its start date to its do-on date (`DTEND` the day after), whatever **Include tasks without a time** says. When such an event is changed in the calendar and stays all-day, its first day SHALL become the task's start and its last day the task's do-on date (time and zone kept), written as ops through the op log with device `calsync:<connection-id>`; an event changed to a timed event SHALL set the due as for any task and SHALL leave the start and the flag alone. The conflict rule of this capability SHALL apply to the start and the due together.

#### Scenario: Trip written as an all-day event
- **WHEN** a task is a span from 2026-11-03 to 2026-11-05 and the option for tasks without a time is off
- **THEN** within a cycle the target calendar holds an all-day event from 3 November to 5 November inclusive titled like the task

#### Scenario: Event moved in the calendar app
- **WHEN** the user drags that event to start on 10 November in their calendar app
- **THEN** after the next cycle the task is a span from the 10th to the 12th, and its history names calendar sync

#### Scenario: Viewer's span edited in the calendar
- **WHEN** the task belongs to a shared project the user only views and the user lengthens its event
- **THEN** the next cycle writes the task's own range back over the event and the task is unchanged
