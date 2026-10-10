# project-organization Specification

## Purpose
Defines projects as the containers tasks live in, the Inbox as the default container, and the views that organise tasks by project.

## Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time and optional deletion time. A project whose parent is unset SHALL be a top-level project; a project whose parent is set SHALL be a sub-project of that parent, to any depth. The parent reference SHALL be stored and synced as the existing `parent_id` field, so edits made offline are applied locally at once and converge under per-field last-writer-wins.

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately as a top-level project with an assigned colour and opens as the current view

#### Scenario: Create a sub-project
- **WHEN** the user creates a project from within an existing project's view or chooses a parent in the create form
- **THEN** the new project appears nested under that parent in the sidebar, with the parent expanded so it is visible

#### Scenario: Parent referencing a missing project
- **WHEN** a project's parent refers to a project this device has not received, or that is deleted
- **THEN** the project is shown at the top level until the parent arrives or is restored, and no data is changed

### Requirement: Inbox is the default container
A task without a project SHALL belong to the Inbox. The Inbox SHALL always exist and SHALL not be deletable or renamable.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox

### Requirement: Rename and recolour
The user SHALL be able to rename a project and choose its colour from a palette.

#### Scenario: Rename
- **WHEN** the user edits the project title and confirms
- **THEN** the new name is shown everywhere the project is referenced, including task rows in other views

### Requirement: Archive a project
Archiving SHALL hide a project from the sidebar without deleting it or its tasks. Its tasks SHALL keep their project reference. Archiving a project SHALL also archive every descendant project, recorded as one archive operation per project so the result converges on every device. Unarchiving a project SHALL unarchive it alone; its descendants SHALL stay archived until unarchived individually. Archiving works offline.

#### Scenario: Archive
- **WHEN** the user archives a project
- **THEN** the project leaves the sidebar, the view returns to the Inbox, and the project's tasks are no longer shown in open views

#### Scenario: Archive cascades to sub-projects
- **WHEN** the user archives a project that has two sub-projects, one of which has its own sub-project
- **THEN** all four projects are archived and leave the sidebar together

#### Scenario: Concurrent archive and move
- **WHEN** device A archives a parent offline while device B moves one of its sub-projects to the top level offline, and both sync
- **THEN** every device shows the moved project archived at the top level if A's archive operation for it is newer, and unarchived at the top level otherwise, with identical results on all devices

### Requirement: Delete a project
Deleting a project SHALL soft-delete it. Its tasks SHALL keep their project reference and stay hidden from every view except the Trash until the project is restored. Its direct sub-projects SHALL move to the deleted project's parent, or to the top level when it had none. No task or project is lost. Deletion works offline and converges on every device.

#### Scenario: Delete with open tasks
- **WHEN** the user confirms deletion of a project with three open tasks
- **THEN** the project and its tasks disappear from Inbox, Today, Upcoming, project views and counts, the project is listed in the Trash, and the three tasks are not shown in the Inbox

#### Scenario: Delete with sub-projects
- **WHEN** the user confirms deletion of a sub-project "Garden" (under "Home") that has sub-projects "Lawn" and "Beds"
- **THEN** "Garden" is listed in the Trash and "Lawn" and "Beds" appear under "Home"

#### Scenario: Restore brings the tasks back
- **WHEN** the user restores the project from the Trash
- **THEN** the project and its three open tasks are visible again exactly as before deletion

### Requirement: Open task counts
The sidebar SHALL show the number of open tasks for the Inbox, for Today and for each project. For a collapsed project the count SHALL include the open tasks of all its non-archived, non-deleted descendants; for an expanded project it SHALL count only the project's own tasks. Counts SHALL be computed from local data so they are correct offline.

#### Scenario: Counts update live
- **WHEN** a task in a project is completed
- **THEN** that project's count decreases without a page reload

#### Scenario: Rolled-up count when collapsed
- **WHEN** "Home" has 2 open tasks and its sub-project "Garden" has 3, and "Home" is collapsed
- **THEN** the sidebar shows 5 next to "Home"; expanding it shows 2 next to "Home" and 3 next to "Garden"

### Requirement: Project tree in the sidebar
The sidebar SHALL render non-archived projects as a tree ordered by position within each level, indenting each level beneath its parent. Deeply nested levels SHALL stay readable on a 360 px wide screen by capping the visual indentation while keeping the nesting order. The tree SHALL be rendered from local data and SHALL reflect remote moves after sync without a reload.

#### Scenario: Three levels
- **WHEN** "Work" contains "Client A", which contains "Q4 launch"
- **THEN** the sidebar lists "Work", then "Client A" indented beneath it, then "Q4 launch" indented beneath that

#### Scenario: Remote move appears
- **WHEN** another device moves "Q4 launch" directly under "Work" and this device syncs
- **THEN** the sidebar shows "Q4 launch" as a sibling of "Client A" without a page reload

### Requirement: Collapse and expand
Each project with sub-projects SHALL be collapsible in the sidebar. Collapse state SHALL be a per-device preference that persists across reloads and is not synced. It SHALL be toggled by pointer and by keyboard (Left collapses, Right expands, when a project row is focused). Navigating to a sub-project SHALL expand its ancestors so the current project is visible.

#### Scenario: Collapse persists locally
- **WHEN** the user collapses "Work" and reloads the app
- **THEN** "Work" is still collapsed on that device and remains expanded on other devices

#### Scenario: Keyboard toggle
- **WHEN** a project row with sub-projects has focus and the user presses Left, then Right
- **THEN** its sub-projects are hidden and then shown again

### Requirement: Move a project
The user SHALL be able to move a project under another project or to the top level from the project header's "Move to" action, reachable by keyboard. The picker SHALL exclude the project itself, its descendants and archived or deleted projects. A move SHALL set the parent field, place the project last among its new siblings, and SHALL apply locally at once, work offline, and converge on other devices through the operation log.

#### Scenario: Move under another project
- **WHEN** the user opens "Move to" on "Q4 launch" and picks "Marketing"
- **THEN** "Q4 launch" appears as the last sub-project of "Marketing" and its tasks keep their project reference

#### Scenario: Descendants are not offered
- **WHEN** the user opens "Move to" on "Work", which contains "Client A"
- **THEN** "Client A" and "Work" are absent from the list of possible parents and "Top level" is offered

#### Scenario: Move offline
- **WHEN** the device is offline and the user moves a project
- **THEN** the sidebar reflects the move immediately and the move is uploaded when the network returns

### Requirement: Cycle prevention
The system SHALL never present a project as its own ancestor. The client SHALL refuse a move whose target is the project itself or one of its descendants. The REST API SHALL reject such a patch. When concurrent moves on different devices nevertheless form a cycle after sync, every device SHALL break the cycle identically: the member whose parent field carries the newest last-writer-wins clock is displayed as a top-level project, no automatic operation is written, and the user may move it again.

#### Scenario: API rejects a cycle
- **WHEN** an authenticated client patches project "Work" with `parent_id` equal to its descendant "Client A"
- **THEN** the response is 400 with code `invalid_input` and the project's parent is unchanged

#### Scenario: API requires authentication
- **WHEN** a request without credentials patches a project's `parent_id`
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Concurrent moves form a cycle
- **WHEN** device A moves "X" under "Y" offline while device B moves "Y" under "X" offline, and both sync
- **THEN** both devices show the project whose parent change has the newer clock at the top level and the other nested beneath it, both projects and all their tasks remain reachable, and no device shows a project nested inside itself

### Requirement: Sub-projects inside a project view
A project's view SHALL list its own open tasks followed by a "Sub-projects" section naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project. Quick add in a project view SHALL add to that project only, not to its sub-projects.

#### Scenario: Sub-project list
- **WHEN** the user opens "Home", which has sub-projects "Garden" (3 open tasks, with a sub-project holding 1) and "Kitchen" (0)
- **THEN** below Home's tasks a "Sub-projects" section lists "Garden 4" and "Kitchen 0"

#### Scenario: Quick add stays in the parent
- **WHEN** the user quick-adds a task while viewing "Home"
- **THEN** the task belongs to "Home" and is not shown inside "Garden"
