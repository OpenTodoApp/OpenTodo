# Spec Delta

## MODIFIED Requirements

### Requirement: Day and Week calendar views
The client SHALL provide Day and Week views, reachable by `g d` and `g w`, showing a 15-minute grid from a configurable start to end hour (default 06:00 to 22:00, scrollable beyond). An open task with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. The Week view SHALL start on the user's preferred first day of the week (OpenSpec `date-time-preferences`), and grid hours and block times SHALL follow the user's time format. The views SHALL render from the local store and work offline.

#### Scenario: Open the week offline
- **WHEN** the device is offline and the user presses `g w`
- **THEN** the current week renders with every timed task as a block and date-only tasks in each day's lane

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed outline and no duration label

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed
- **THEN** it leaves the grid and the day's planned total decreases accordingly

#### Scenario: Week starts on the preferred day
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14 and the user presses `g w`
- **THEN** the week shown runs from Sunday 2026-10-11 to Saturday 2026-10-17

#### Scenario: Grid hours in 12-hour format
- **WHEN** the time format is `12h`
- **THEN** the grid's hour labels read `9 AM`, `10 AM` and so on, and moving a block still sets the same stored `HH:MM` due time
