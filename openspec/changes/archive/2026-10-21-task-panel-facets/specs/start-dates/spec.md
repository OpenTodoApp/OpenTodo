# Spec Delta

## MODIFIED Requirements

### Requirement: Setting when from the panel and the keyboard
The detail panel SHALL set the start inside the When popover: a Start segment offering Anytime (no start), a start date through the same date field and calendar as the due date, and Someday, with the Evening toggle in the Do on segment; a task with a start SHALL show it as a part of the When line reading "from" with a future date, "since" with a past date, or "Someday". Viewers SHALL see the values as text. The date field SHALL refuse a start after the due date with a message and leave the task unchanged.

#### Scenario: Start after due refused
- **WHEN** a task is due 2026-10-16 and the user types `2026-10-21` into its start date field
- **THEN** the field says the start must be on or before the due date and the task's start is unchanged

#### Scenario: Start from the When control
- **WHEN** the user opens the Do on part of a task, switches to Start and picks a date next week
- **THEN** the popover closes on Done, the When line reads the due date and "from" with the start date, and no separate Start line exists in the panel

#### Scenario: Start in the past
- **WHEN** a task's start was two days ago
- **THEN** the When line reads "since" with that date

#### Scenario: Parked task
- **WHEN** a task is parked in Someday
- **THEN** the When line reads "Someday" and the Start segment shows Someday selected
