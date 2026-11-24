## MODIFIED Requirements

### Requirement: Sub-projects inside a project view
A project's view SHALL show a collapsible "Sub-projects" group at the top of its list, using the shared group header, naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project; the group SHALL be hidden when the project has no sub-projects. A sub-project row SHALL keep the columns of a task row: its project mark in the column of a task's checkbox and its name where a top-level task's title starts, so the project's own top-level tasks line up with the sub-projects and only subtasks are indented. The project's own open tasks follow the group. In the list layout without sections or a grouping, they SHALL follow under a "Tasks" group header with their open count, which folds per project on this device like the Sub-projects group, so they do not read as part of the Sub-projects group; where sections or a grouping are on, the first section or group header follows the group and no "Tasks" header is added. A project without sub-projects SHALL show no "Tasks" header. The board layout SHALL show no Sub-projects group, since its columns are the project's sections; the timeline layout SHALL show the group above its bars. Quick add in a project view SHALL add to that project only, not to its sub-projects. The group and the header SHALL be derived from local data, so they are correct offline and follow projects and tasks created, moved or archived on other devices after sync.

In the list layout, a sub-project row with open tasks or sub-projects SHALL offer an arrow in its fold slot that opens the sub-project in place, while clicking its name still opens the sub-project. An open sub-project SHALL show its own open tasks, with their subtasks, in its section order without section headers (in the view's sort when one is chosen), then its own sub-projects as the same rows one step further in, so the rows add up to its count. Open or folded SHALL be a per-device preference, folded by default, never synced. Its tasks SHALL be rows of the list: the cursor keys, completion, Enter, the actions menu and inline editing SHALL work on them with Undo, and completing or editing one SHALL follow the person's role in the task's own project, so a viewer of that project sees read-only rows. A task SHALL be reordered only among the tasks of its own project; dropping a task on a sub-project row SHALL move it to that sub-project, and dropping it on the "Tasks" header or on one of the parent's section headers SHALL move it to the parent (at that section), each with Undo; the "Tasks" header SHALL stay while a sub-project is open, also when the parent has no open tasks. Ticked tasks of several projects SHALL not be placed among rows, and the app SHALL say why, and neither when the person may not edit tasks there. The view's sort, query filter and duration filter SHALL apply inside each open sub-project. With a grouping or the columns layout on, and in the timeline layout, no arrow SHALL be offered. Opened tasks SHALL be derived from local data, so they work offline and follow writes from other devices after sync.

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

#### Scenario: Open a sub-project in place
- **WHEN** "Garden" (under "Home") has the open tasks "Mow" and "Weed", and its sub-project "Beds" has "Mulch", and the user presses Garden's arrow, then Beds' arrow
- **THEN** "Mow" and "Weed" appear under Garden's row, then the row "Beds" one step further in, then "Mulch", Home stays on screen, and Garden is open again on this device after a reload and folded on other devices

#### Scenario: The name still opens
- **WHEN** the user clicks the name "Garden" in Home's Sub-projects group
- **THEN** the "Garden" project opens

#### Scenario: Keys and Undo on an opened task
- **WHEN** Garden is open in Home, the user moves the cursor to "Mow" with `j` and presses `x`, then Undo
- **THEN** "Mow" is completed and leaves the list, and Undo puts it back open under Garden

#### Scenario: Viewer of the sub-project
- **WHEN** the user edits "Home" but is a viewer of the shared sub-project "Garden", and opens Garden in place
- **THEN** Garden's tasks are shown read-only: no completion, inline editing or drag

#### Scenario: Drop on a sub-project or the Tasks header
- **WHEN** the user drags Home's task "Paint" onto Garden's row, and later drags Garden's task "Mow" onto the "Tasks" header
- **THEN** "Paint" moves to Garden and "Mow" to Home, each with a toast and Undo, and a drag over a row of another project shows no drop line

#### Scenario: The view's filters apply inside
- **WHEN** Home's query filter is "p1" and Garden is open
- **THEN** only Garden's priority 1 tasks are shown under its row

#### Scenario: No arrow with a grouping or on the timeline
- **WHEN** Home is grouped by priority, or shown as a timeline
- **THEN** its sub-project rows have no arrow and no sub-project's tasks are shown in Home

#### Scenario: A change from another device
- **WHEN** Garden is open in Home and another device adds a task to Garden, which syncs
- **THEN** the task appears under Garden's row without a reload
