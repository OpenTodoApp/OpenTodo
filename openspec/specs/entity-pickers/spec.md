# entity-pickers Specification

## Purpose
Defines which screens choose a project, section, parent task, assignee or label with the design-system smart picker, what each entity's options show and allow, and how a choice is stored offline and converges, so picking works the same everywhere.

## Requirements

### Requirement: Entity choices use the smart picker
Choosing a project, section, parent task, assignee or label SHALL use the design-system smart picker, not a native select, on these screens: the task detail Project, Section, Parent, Assignee and Labels fields, the new-project parent in the sidebar, the share-capture project and the import target project, and the assign and label dialogs of list views. Fixed option lists (sort, group, role, format) SHALL stay native selects.

#### Scenario: Project field is searchable
- **WHEN** the user opens the Project field of a task
- **THEN** a picker opens with its search field focused and the projects ranked by the design-system picker rules, not a native select

#### Scenario: Plain option list unchanged
- **WHEN** the user changes the duplicate handling of an import
- **THEN** a native select is used, because it is a fixed option list

### Requirement: Project options
Project pickers SHALL list a "No project" option with the Inbox icon, also found by typing "inbox" (where a task may live without a project; a task there is an Inbox task only while it is not scheduled, OpenSpec `project-organization`), and every non-archived, non-deleted project in tree order with its colour, shared indicator and parent path, so projects with the same name are told apart. An archived current project SHALL be listed first, marked "archived". The task Project picker SHALL offer creating a project from the query.

#### Scenario: Two projects with the same name
- **WHEN** projects named "Ideas" exist under "Home" and under "Work"
- **THEN** the picker shows both, with the paths "Home" and "Work"

#### Scenario: Create a project offline
- **WHEN** the user, offline, types `Garden` in a task's Project picker and picks "Create “Garden”"
- **THEN** the project exists and the task is in it immediately, and both operations sync when the connection returns

#### Scenario: No project found by typing inbox
- **WHEN** the user types `inb` in a task's Project picker
- **THEN** the "No project" option is offered first

### Requirement: Parent task options
The Parent picker SHALL list "No parent" and the open, non-deleted tasks of the task's project except the task itself and its descendants, each with its section and its own parent path. A completed or deleted current parent SHALL be listed first, marked as such. Creation SHALL NOT be offered.

#### Scenario: Descendants excluded
- **WHEN** task A has subtask B and the user opens A's Parent picker
- **THEN** neither A nor B is listed

#### Scenario: Current parent is completed
- **WHEN** a task's parent is completed and the user opens the Parent picker
- **THEN** the parent is listed first, marked "completed", and other completed tasks are not listed

### Requirement: Section options
The Section picker SHALL list "No section" and the live sections of the task's project in board order. For a subtask whose parent is live the field SHALL be read-only and state that subtasks follow their parent's section.

#### Scenario: Subtask section
- **WHEN** the user opens the panel of a subtask whose parent is in section "Doing"
- **THEN** the Section row reads "Doing" and explains that it follows the parent

### Requirement: Picks are ordinary operations
Every pick SHALL be applied as the same operations the field already writes (moving a task, setting a section, parent, assignee or labels), locally first, so pickers list and pick offline from local data and concurrent picks converge by last-writer-wins. A move into another sharing scope SHALL keep its existing copy behaviour and the panel SHALL follow the copy.

#### Scenario: Offline section pick
- **WHEN** the user, offline, picks a new section for a task
- **THEN** the task shows the new section at once and the change syncs when the connection returns

#### Scenario: Concurrent picks
- **WHEN** two devices move the same task to different projects while offline and then sync
- **THEN** both devices end with the project written with the greater timestamp

#### Scenario: Move into a shared project
- **WHEN** the user picks a project in another sharing scope for a task
- **THEN** the task is copied into that project as today and the panel shows the copy
