## MODIFIED Requirements

### Requirement: Sub-projects inside a project view
A project's view SHALL show a collapsible "Sub-projects" group at the top of its list, using the shared group header, naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project; the group SHALL be hidden when the project has no sub-projects. A sub-project row SHALL keep the columns of a task row: its project mark in the column of a task's checkbox and its name where a top-level task's title starts, so the project's own top-level tasks line up with the sub-projects and only subtasks are indented. The project's own open tasks follow the group. In the list layout without sections or a grouping, they SHALL follow under a "Tasks" group header with their open count, which folds per project on this device like the Sub-projects group, so they do not read as part of the Sub-projects group; where sections or a grouping are on, the first section or group header follows the group and no "Tasks" header is added. A project without sub-projects SHALL show no "Tasks" header. The board layout SHALL show no Sub-projects group, since its columns are the project's sections; the timeline layout SHALL show the group above its bars. Quick add in a project view SHALL add to that project only, not to its sub-projects. The group and the header SHALL be derived from local data, so they are correct offline and follow projects and tasks created, moved or archived on other devices after sync.

#### Scenario: Sub-project list
- **WHEN** the user opens "Home", which has sub-projects "Garden" (3 open tasks, with a sub-project holding 1) and "Kitchen" (0)
- **THEN** above Home's tasks a "Sub-projects" group lists "Garden 4" and "Kitchen 0", and it stays collapsed on this device once collapsed

#### Scenario: Tasks apart from sub-projects
- **WHEN** "Home" has the sub-project "Garden" and no sections, and its own tasks "Paint", with the subtask "Buy brushes", and "Tiles"
- **THEN** the "Sub-projects" group lists "Garden", a "Tasks" header reading 3 follows it, "Paint" and "Tiles" start in the same column as "Garden", with their checkboxes under Garden's mark, and only "Buy brushes" is indented

#### Scenario: Sections head the tasks
- **WHEN** "Home" has the sub-project "Garden", the section "Kitchen" and a task with no section
- **THEN** the "Sub-projects" group is followed by the "No section" header and then "Kitchen", and there is no "Tasks" header

#### Scenario: No sub-projects
- **WHEN** the user opens "Errands", which has no sub-projects
- **THEN** there is neither a "Sub-projects" group nor a "Tasks" header

#### Scenario: Board
- **WHEN** the user opens "Home" with sub-projects in the board layout
- **THEN** the board shows its section columns and no Sub-projects group

#### Scenario: Quick add stays in the parent
- **WHEN** the user quick-adds a task while viewing "Home"
- **THEN** the task belongs to "Home" and is not shown inside "Garden"
