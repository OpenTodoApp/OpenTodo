# Spec Delta

## Purpose

Defines sections as ordered containers inside a project, the task-to-section reference, how the list view groups by section, and the board view that shows sections as columns tasks move between.

## ADDED Requirements

### Requirement: Section entity
A section SHALL have a name, the id of the project it belongs to, a sort position, creation time and optional deletion time. Sections SHALL be created, edited and deleted as operations in the log, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins like tasks and projects. A section's project reference SHALL not change after creation.

#### Scenario: Create a section offline
- **WHEN** the device is offline and the user adds a section "Doing" to a project
- **THEN** the section appears immediately in that project, survives a reload, and reaches other devices after the network returns

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same section offline and both sync
- **THEN** every device shows the name written with the greater timestamp

### Requirement: Task section reference
A task SHALL have an optional `section_id` naming a section of its project; it SHALL default to none and SHALL be stored and synced as an additive task field. Changing a task's project SHALL clear its section. A task whose section is deleted, belongs to a different project than the task, or has not yet been received SHALL be shown as having no section without any data being written.

#### Scenario: Default
- **WHEN** a task is created without choosing a section
- **THEN** it has no section and is listed under "No section" in its project

#### Scenario: Move to another project clears the section
- **WHEN** a task in section "Doing" of project "A" is moved to project "B"
- **THEN** the task has no section and is listed under "No section" in "B"

#### Scenario: Concurrent move and section deletion
- **WHEN** device A moves a task into section "Doing" offline while device B deletes "Doing" offline, and both sync
- **THEN** the section is deleted on both devices, the task keeps its reference to the deleted section in the data, is displayed under "No section", and is not lost

### Requirement: Sections in the list view
A project's list view SHALL group open tasks under section headings ordered by section position, with tasks that have no section listed first under a "No section" heading shown only when sections exist. Each heading SHALL show the count of open tasks beneath it and SHALL offer a quick-add input that creates tasks in that section. Sections SHALL be collapsible per device.

#### Scenario: Grouped list
- **WHEN** a project has sections "Backlog" and "Doing" with 3 and 1 open tasks, and 2 tasks without a section
- **THEN** the view shows "No section 2", then "Backlog 3", then "Doing 1", each followed by its tasks

#### Scenario: Quick add under a heading
- **WHEN** the user types a title in the quick-add input under "Doing" and presses Enter
- **THEN** a task with that title appears under "Doing" immediately, with no network round trip

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column, each listing the section's open tasks ordered by position with a per-column count and quick-add. The list/board choice SHALL be remembered per project per device and SHALL not be synced. The board SHALL render from local data, scroll horizontally on narrow screens, and SHALL be navigable by keyboard.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column

### Requirement: Move tasks between sections
The user SHALL be able to move a task to another section by dragging it onto a column or heading, by pressing Shift+Left or Shift+Right on the selected task in the board, and by choosing a section in the task detail panel. A move SHALL set the task's section and place it last in the target column, SHALL apply locally at once and work offline, and SHALL converge so two devices moving the same task resolve to the newer move.

#### Scenario: Drag between columns
- **WHEN** the user drags a task from "Backlog" and drops it on "Doing"
- **THEN** the task appears at the bottom of "Doing" immediately and other devices show the same after sync

#### Scenario: Keyboard move
- **WHEN** a task in "Backlog" is selected on the board and the user presses Shift+Right
- **THEN** the task moves to the next column and stays selected

#### Scenario: Concurrent moves of one task
- **WHEN** device A moves a task to "Doing" offline while device B moves it to "Done" offline, and both sync
- **THEN** every device shows the task in the column chosen by the move with the greater timestamp

### Requirement: Section lifecycle
Sections SHALL be renamable, reorderable among the sections of their project, and deletable from the heading or column menu and from the keyboard. Deleting a section SHALL set its deletion time and SHALL move its open tasks to "No section" by clearing their section reference, one operation per task. Deleted sections SHALL be hidden from all views and list endpoints and included in the export. These actions work offline and converge.

#### Scenario: Reorder
- **WHEN** the user moves "Doing" before "Backlog"
- **THEN** both the list headings and the board columns show "Doing" first on this device now and on other devices after sync

#### Scenario: Delete with tasks
- **WHEN** the user confirms deletion of "Doing", which holds two open tasks
- **THEN** the section disappears and the two tasks are listed under "No section"

### Requirement: Sections API
The API SHALL expose a `sections` collection under `/api/v1/sections` with list, get, create, patch and delete, following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and an existing, non-deleted `project_id`. Tasks SHALL accept `section_id` in create and patch.

#### Scenario: Create a section via the API
- **WHEN** a script POSTs `{"name":"Doing","project_id":"<project>"}` to `/api/v1/sections` with a bearer token
- **THEN** the response is 201 with the section including `id`, `position` and `created_at`, and devices receive it on their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates sections
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid project
- **WHEN** a create body names a `project_id` that does not exist or is deleted
- **THEN** the response is 400 with code `invalid_input` and no section is created

### Requirement: Export includes sections
The JSON export SHALL include every section of the user, including soft-deleted ones, under a `sections` key alongside projects and tasks, and tasks SHALL carry their `section_id`.

#### Scenario: Export after creating sections
- **WHEN** the user downloads the export after creating two sections and deleting one
- **THEN** the document contains both sections, one with `deleted_at` set, and keeps `"format":"opentodo-export"` and `"version":1`
