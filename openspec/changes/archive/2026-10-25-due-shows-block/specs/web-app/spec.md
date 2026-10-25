## ADDED Requirements

### Requirement: A timed due with an estimate reads as its block
Where the task page, the task panel's facet line and the phone's facts card show a task's due (the Do row), a due with a time and an estimate SHALL read as the block the calendar draws: the day, the start time and the end time ("Today 12:00–13:30"), in the user's time format, followed by the zone's city when the time is fixed to a zone. The end SHALL stay on the due's day (23:59 at the latest), as on the calendar. A due with a time and no estimate SHALL read as the day and the time only; a due without a time, as the day only. The Start row stays the date from which the task is available and is not the block's start.

#### Scenario: Placed on the calendar
- **WHEN** the user drags a task with a 90-minute estimate to today at 12:00 in the Week and opens the task from its project
- **THEN** the Do row reads "Today 12:00–13:30", and the Start row is unchanged

#### Scenario: No estimate
- **WHEN** a task is due tomorrow at 15:00 with no estimate
- **THEN** the Do row reads "Tomorrow 15:00"

#### Scenario: Fixed to a zone
- **WHEN** a task is due tomorrow at 15:00 fixed to New York with a one-hour estimate, for a viewer in New York
- **THEN** the Do row reads "Tomorrow 15:00–16:00 New York"
