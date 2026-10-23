## MODIFIED Requirements

### Requirement: Edit task fields
The user SHALL be able to change a task's title, description, project, priority, due date and due time from the task page (see `web-app` "Task page"). Each change SHALL be applied locally at once and recorded as an operation for sync.

#### Scenario: Change priority with the keyboard
- **WHEN** a task is selected in a list and the user presses `1`, `2`, `3` or `4`
- **THEN** the task's priority becomes that value

#### Scenario: Clear a due date
- **WHEN** the user clears the due date of a scheduled task
- **THEN** the task has no due date and leaves the Today and Upcoming views
