## MODIFIED Requirements

### Requirement: Sub-projects inside a project view
A project's view SHALL show a collapsible "Sub-projects" group under its header, using the shared group header, naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project; the group SHALL be hidden when the project has no sub-projects. In List layout the project's own open tasks follow it; in Board layout the board's columns follow it, on a phone too. The group's collapsed state is kept per project on the device and is the same in both layouts. Quick add in a project view SHALL add to that project only, not to its sub-projects.

#### Scenario: Sub-project list
- **WHEN** the user opens "Home", which has sub-projects "Garden" (3 open tasks, with a sub-project holding 1) and "Kitchen" (0)
- **THEN** above Home's tasks a "Sub-projects" group lists "Garden 4" and "Kitchen 0", and it stays collapsed on this device once collapsed

#### Scenario: Board layout
- **WHEN** the user switches "Home" to Board layout
- **THEN** the "Sub-projects" group is still shown, above the columns, and choosing "Garden" opens Garden

#### Scenario: Quick add stays in the parent
- **WHEN** the user quick-adds a task while viewing "Home"
- **THEN** the task belongs to "Home" and is not shown inside "Garden"

## ADDED Requirements

### Requirement: New sub-project from a project
A project's menu SHALL offer "New sub-project…" to the project's owner and admins. Choosing it SHALL open the sidebar's new-project form (the one its Projects "+" opens) with that project already chosen as the parent, bringing the sidebar on screen first: the icon rail expands and, below 768 px, the drawer opens. Create SHALL make the project under that parent and open it, as the form does; the parent stays changeable in the form. The project is created as an operation, offline too, and converges like any project. The command palette's commands for the open project SHALL include it.

#### Scenario: From the parent
- **WHEN** the owner of "Home" chooses "New sub-project…" in its menu, types "Garden" and chooses Create
- **THEN** "Garden" opens, it is nested under "Home" in the sidebar, and "Home"'s Sub-projects group lists it

#### Scenario: Editor of a shared project
- **WHEN** an editor of a shared project opens its menu
- **THEN** the menu has no "New sub-project…" item
