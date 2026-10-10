# task-management Specification

## Purpose
Defines the task entity and its lifecycle: capture, editing of its fields, prioritisation, scheduling with floating dates, completion and deletion.

## Requirements

### Requirement: Task fields
A task SHALL have a title, a description, an optional project, a priority from 1 (highest) to 4 (lowest, default), an optional due date, labels, a sort position, creation time, optional completion time and optional deletion time. Fields reserved for later changes (`parent_id`, `labels`) SHALL be stored and synced even before the client offers an interface for them.

#### Scenario: Default values on creation
- **WHEN** a task is created with only a title
- **THEN** it has priority 4, no project (Inbox), no due date, empty description and labels, and is neither completed nor deleted

#### Scenario: Invalid field values
- **WHEN** a client submits a priority outside 1 to 4, a non-string title, or a due date that is not `YYYY-MM-DD` with an optional `HH:MM` time
- **THEN** the write is rejected as invalid and no field changes

### Requirement: Quick capture
The client SHALL offer a single-line quick-add input in every task view that creates a task on Enter and stays focused for the next entry. The line SHALL be parsed for attributes as defined by the natural-language-capture capability. The new task SHALL inherit the view's context (project, Today's date, Upcoming's tomorrow) for every attribute the line does not set.

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

### Requirement: Edit task fields
The user SHALL be able to change a task's title, description, project, priority, due date and due time from a detail panel. Each change SHALL be applied locally at once and recorded as an operation for sync.

#### Scenario: Change priority with the keyboard
- **WHEN** a task is selected in a list and the user presses `1`, `2`, `3` or `4`
- **THEN** the task's priority becomes that value

#### Scenario: Clear a due date
- **WHEN** the user clears the due date of a scheduled task
- **THEN** the task has no due date and leaves the Today and Upcoming views

### Requirement: Floating due dates
Due dates SHALL be floating calendar dates with an optional wall-clock time, with no time zone attached. "Today" SHALL be evaluated in the viewer's local time zone.

#### Scenario: Same date on every device
- **WHEN** a task is due on `2026-10-11` and is viewed from devices in different time zones
- **THEN** every device shows it due on the 11th of October

### Requirement: Complete and reopen
A task SHALL be completable and reopenable from the list, the detail panel and the keyboard. Completing a task without a recurrence rule SHALL record the completion time and remove the task from open views without deleting it. Completing a task with a recurrence rule SHALL record a completed occurrence and move the task to its next occurrence, unless the rule's end condition is reached, in which case it completes like any other task. All of this SHALL work offline and converge across devices.

#### Scenario: Complete from the list
- **WHEN** the user clicks the circle of an open task or presses `c` with it selected
- **THEN** the task gains a completion time, disappears from the current open view and appears in Completed

#### Scenario: Reopen
- **WHEN** the user reopens a completed task
- **THEN** the completion time is cleared and the task returns to its project or Inbox

#### Scenario: Complete a recurring task
- **WHEN** the user completes a task with `every day` due today
- **THEN** a completed entry for today appears in Completed and the task stays open, due tomorrow, keeping its rule

#### Scenario: Reopen a completed occurrence
- **WHEN** the user reopens a completed occurrence of a series
- **THEN** that occurrence becomes a standalone open task with its original due date, and the series is not moved back

#### Scenario: Complete the same occurrence on two devices offline
- **WHEN** two devices complete the same occurrence without a network and later sync
- **THEN** Completed shows that occurrence once and the series is due on the same next occurrence on both devices

### Requirement: Soft delete
Deleting a task SHALL set a deletion time rather than removing data. Deleted tasks SHALL be hidden from all views and list endpoints, SHALL remain in the export, and SHALL stay deleted on every device after sync.

#### Scenario: Delete syncs as a tombstone
- **WHEN** a task is deleted on one device while another device edits its title offline
- **THEN** after both devices sync, the task is deleted on both and the title edit does not resurrect it

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
