# Spec Delta

## MODIFIED Requirements

### Requirement: Deadline entry
The detail panel SHALL set the deadline inside the When popover, in a Deadline segment that reads the date in the user's date format and is edited with the same date field and calendar as the due date, including typed dates and relative words, and SHALL be clearable from the popover's footer. A task with a deadline SHALL show it as a part of the When line reading "deadline" followed by the date and its countdown. Every change SHALL apply locally at once.

#### Scenario: Set from the panel
- **WHEN** the user opens a task, opens the When popover, switches to Deadline, types `fri` and confirms
- **THEN** the deadline is the next Friday, the When line gains "deadline" with the date in the user's format and its countdown, and the due date is unchanged

#### Scenario: Viewer of a shared project
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the deadline part reads as text and cannot be changed

#### Scenario: No deadline, no chip
- **WHEN** a task has no deadline
- **THEN** the When line has no deadline part, and Deadline is offered in the Add menu under When and as a segment of the When popover

#### Scenario: Overdue deadline tone
- **WHEN** a task's deadline was three days ago
- **THEN** the deadline part reads "deadline" with the date and "3 days over" in the danger tone, as the row does
