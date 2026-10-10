# Spec Delta

## ADDED Requirements

### Requirement: Duration estimate
A task SHALL have an optional duration estimate `estimate_minutes`, a positive integer number of minutes or null (default). It SHALL be stored, validated, exported and synced as a field under the same last-writer-wins rule as every other task field, SHALL be settable offline, and SHALL be shown on the task row when present.

#### Scenario: Estimate from quick add
- **WHEN** a task is created from the line `Write report +45m`
- **THEN** the task has `estimate_minutes` 45 and the row shows `45m`

#### Scenario: Invalid estimate rejected
- **WHEN** a client submits `estimate_minutes` of 0, a negative number, a non-integer or a string
- **THEN** the write is rejected as invalid and no field changes

#### Scenario: Older client ignores the field
- **WHEN** a device running a client without estimate support receives an operation for `estimate_minutes`
- **THEN** the operation is stored and forwarded unchanged and the device otherwise behaves normally

## MODIFIED Requirements

### Requirement: Quick capture
The client SHALL offer a single-line quick-add input in every task view that creates a task on Enter and stays focused for the next entry. The line SHALL be parsed for natural-language attributes (due date and time, project, labels, priority, estimate) as defined by the natural-language-capture capability. The new task SHALL inherit the context of the view (the current project in a project view, today's date in Today, tomorrow's date in Upcoming) for every attribute the line does not set explicitly.

#### Scenario: Capture in a project
- **WHEN** the user types a title in a project view and presses Enter
- **THEN** a task with that title appears in that project immediately, with no network round trip

#### Scenario: Capture in Today
- **WHEN** the user adds a task from the Today view
- **THEN** the task is due today

#### Scenario: Explicit token overrides the view
- **WHEN** the user is in the Today view and enters `Plan trip next Monday #travel`
- **THEN** the task is due next Monday and filed in "Travel", not today in the Inbox

#### Scenario: Input stays ready
- **WHEN** a parsed task is created
- **THEN** the input is cleared, all chips are gone and focus remains in the input
