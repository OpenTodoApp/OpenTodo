# Spec Delta

## MODIFIED Requirements

### Requirement: Manual order by position
Lists that support manual ordering SHALL sort items by their `position` number ascending, breaking ties by id, so that every device derives the same order from the same data. New items SHALL be placed at the end of their list, except where the requirement "Where new tasks are added" places a new task at the top. A move SHALL change only the moved item's position as an operation applied locally first, so it works offline and converges under per-field last-writer-wins.

#### Scenario: Same order on every device
- **WHEN** two devices hold the same set of operations for a project's tasks
- **THEN** both show the tasks in the same order

#### Scenario: Offline move
- **WHEN** the device is offline and the user moves a task from fifth to second place
- **THEN** the list shows the new order immediately, it survives a reload, and the single position operation is uploaded when the network returns

## ADDED Requirements

### Requirement: Where new tasks are added
The account SHALL have one synced preference "Add new tasks" with the values "At the bottom of the list" (the default, also for an empty or unknown stored value, which is kept) and "At the top of the list", set in Settings → Capture → Quick add. With "top", a task added from a project's or the Inbox's quick add, from a section's add row in a list, from a board column's add row, or from the command bar or the phone's add sheet into such a list SHALL be created with a position below every existing task, so it is first in its list, section or column; several tasks created in one batch SHALL keep their order as a block at the top. With "bottom", those tasks SHALL be appended as before. Subtasks, the insert-after-the-selected-task shortcut, duplicates, templates, imports and tasks written by the server (REST, CLI, MCP, CalDAV, email, integrations) SHALL keep their own placement. In views not in manual order the position SHALL only break ties. The preference SHALL be written as an operation, work offline, reach the user's other devices and converge by last-writer-wins; a task's position is written in the same batch as the task, so a top insertion made offline converges like any create, and two tasks placed at the top concurrently on two devices SHALL appear in the same order on every device through the id tie-break.

#### Scenario: Add at the top of a long project
- **WHEN** "Add new tasks" is "At the top of the list" and the user adds "Call the plumber" from the quick add of a project with 80 tasks in manual order
- **THEN** "Call the plumber" is the first task of the project, visible under the quick add, on this device now and on other devices after sync

#### Scenario: Default stays at the bottom
- **WHEN** the preference was never set and the user adds a task to the Inbox
- **THEN** the task is the last task of the Inbox

#### Scenario: Top of a section
- **WHEN** the preference is "top" and the user adds a task from the add row of section "Doing"
- **THEN** the task is the first task of "Doing" and the other sections are unchanged

#### Scenario: Sorted list keeps its sort
- **WHEN** the preference is "top" and the user adds a task without a due date to a project shown by due date
- **THEN** the task appears where the due-date order puts it, and among tasks with the same sort value it comes first

#### Scenario: Preference on another device
- **WHEN** the user sets "top" on the laptop and later adds a task on the phone after sync
- **THEN** the phone places the task at the top

#### Scenario: Offline top insertion on two devices
- **WHEN** with "top" set, two devices each add a task to the same project offline and both sync
- **THEN** both tasks are above the earlier tasks, in the same order on every device

#### Scenario: API keeps appending
- **WHEN** a client creates a task with `POST /api/v1/tasks` without a position while the preference is "top"
- **THEN** the task is appended at the end of its list
