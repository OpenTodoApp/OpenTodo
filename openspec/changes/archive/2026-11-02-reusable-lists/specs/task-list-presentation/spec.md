## MODIFIED Requirements

### Requirement: Completed group in a project
Outside a reusable list (OpenSpec `reusable-lists`), a project's Project menu SHALL offer "Show completed tasks" in the list layout, a preference of the device per project that is off by default and never synced. While it is on, the project's list SHALL end with a "Completed" group holding every completed (not skipped) task of the project, most recently completed first. The group SHALL be closed by default with its count on the heading, and its open or closed state SHALL be remembered on the device. Completing a task SHALL move it into the group; unticking a task in the group SHALL reopen it and return it among the open tasks. While it is off and the project has completed tasks, a list with open tasks SHALL end with one line, "n completed tasks hidden by display options" and a Show link that turns the preference on. The board and the timeline SHALL be unchanged. In a reusable list the group SHALL always be shown, headed "Got it", whatever the device preference, the Project menu SHALL NOT offer the preference, and the hidden-tasks line SHALL NOT appear. A completed task's circle SHALL show the filled check without the priority ring.

#### Scenario: Groceries reused
- **WHEN** a user turns on "Show completed tasks" in a Groceries project where Milk and Eggs were ticked off, Eggs last, and opens the Completed group
- **THEN** the group's heading reads "Completed 2", Eggs is listed above Milk, both show a ticked circle, and unticking Milk puts it back among the open tasks

#### Scenario: Off by default
- **WHEN** a user opens a project they never changed the setting for
- **THEN** no Completed group is shown, completed tasks are only in the Completed view, and the list ends with "2 completed tasks hidden by display options · Show" when two were completed

#### Scenario: Board layout
- **WHEN** the project is shown as a board
- **THEN** the Project menu does not offer "Show completed tasks" and the board shows open tasks only

#### Scenario: Reusable list ignores the device preference
- **WHEN** a device with "Show completed tasks" off opens a reusable list where Milk was ticked off
- **THEN** the list ends with "Got it 1" holding Milk, and the Project menu has no "Show completed tasks" item
