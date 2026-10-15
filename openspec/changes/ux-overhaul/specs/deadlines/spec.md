# Spec Delta

## MODIFIED Requirements

### Requirement: Deadline entry
The detail panel SHALL set the deadline inside the unified When control opened from the Do on chip, in a Deadline segment that reads the date in the user's date format and is edited with the same date field and calendar as the due date, including typed dates and relative words, and SHALL be clearable. A task with a deadline SHALL show a Deadline chip with its countdown beside the Do on chip. Pressing `d` on a selected task in a list SHALL open the same date field inline, so the deadline can be set without opening the panel. Every change SHALL apply locally at once.

#### Scenario: Set from the panel
- **WHEN** the user opens a task, opens the When control, switches to Deadline, types `fri` and confirms
- **THEN** the deadline is the next Friday, a Deadline chip shows it in the user's date format with its countdown, and the due date is unchanged

#### Scenario: Set from the list
- **WHEN** a task is selected in a list, focus is not in a text field, and the user presses `d`, types `2026-11-06` and presses Enter
- **THEN** the task's deadline is `2026-11-06` and the row shows its countdown

#### Scenario: Viewer of a shared project
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the Deadline chip reads as text and cannot be changed

#### Scenario: No deadline, no chip
- **WHEN** a task has no deadline
- **THEN** the panel shows no Deadline chip, and Deadline is offered in the Add menu and inside the When control
