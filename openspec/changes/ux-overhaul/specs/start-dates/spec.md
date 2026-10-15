# Spec Delta

## MODIFIED Requirements

### Requirement: Setting when from the panel and the keyboard
The detail panel SHALL set the start inside the unified When control opened from the Do on chip: a Start segment offering Anytime (no start), a start date through the same date field and calendar as the due date, and Someday, plus an Evening toggle; a task with a start or Someday SHALL show it as part of the Do on chip's text ("Starts 21 Oct", "Someday"). Viewers SHALL see the values as text. In a list, `n` SHALL park or un-park the selected task, `Shift+N` SHALL open the inline start date field and `Shift+E` SHALL toggle This Evening. The date field SHALL refuse a start after the due date with a message and leave the task unchanged.

#### Scenario: Defer from the list
- **WHEN** a task is selected, focus is not in a text field, and the user presses `Shift+N`, types `21/10` (with a day-month date format) and Enter
- **THEN** the task's start is `2026-10-21` and the row shows `Starts 21 Oct`

#### Scenario: Start after due refused
- **WHEN** a task is due 2026-10-16 and the user types `2026-10-21` into its start date field
- **THEN** the field says the start must be on or before the due date and the task's start is unchanged

#### Scenario: Park with the keyboard
- **WHEN** a task is selected in a project view and the user presses `n`
- **THEN** the task moves to the Later group as parked, and pressing `n` again returns it to the active list with no due date

#### Scenario: Start from the When control
- **WHEN** the user opens the Do on chip of a task, switches to Start and picks a date
- **THEN** the control closes on confirm, the chip reads the due date and "Starts" with the start date, and no separate When row exists in the panel
