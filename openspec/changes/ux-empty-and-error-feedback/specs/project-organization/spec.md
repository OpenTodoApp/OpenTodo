## ADDED Requirements

### Requirement: Empty Projects view

When the Projects view has loaded and contains no projects, it SHALL show the shared empty state with the title "No projects yet", one line that distinguishes projects from labels, and a primary "New project" action. Activating the action SHALL open the existing project creation prompt.

#### Scenario: Empty state offers creation

- **WHEN** a user with no projects opens the Projects view
- **THEN** the view shows the title, the distinguishing line and a New project action

#### Scenario: The action starts creation

- **WHEN** the user activates New project from the empty state
- **THEN** the existing creation prompt opens with the first field focused

#### Scenario: A populated view is unchanged

- **WHEN** the user has at least one project
- **THEN** the empty state is absent and the projects table renders as before
