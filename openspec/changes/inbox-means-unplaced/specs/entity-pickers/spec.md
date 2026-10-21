## MODIFIED Requirements

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
