# Spec Delta

## MODIFIED Requirements

### Requirement: Project tree in the sidebar
The sidebar SHALL render non-archived projects as a tree ordered by position within each level, indenting each level 12 px beneath its parent, inside the sidebar's single scroller. Deeply nested levels SHALL stay readable on a 360 px wide screen by capping the visual indentation while keeping the nesting order, and a row's tooltip SHALL show its full path. Each project SHALL show its icon in its colour, or a coloured dot when it has no icon. The tree SHALL be rendered from local data and SHALL reflect remote moves after sync without a reload.

#### Scenario: Three levels
- **WHEN** "Work" contains "Client A", which contains "Q4 launch"
- **THEN** the sidebar lists "Work", then "Client A" indented beneath it, then "Q4 launch" indented beneath that

#### Scenario: Remote move appears
- **WHEN** another device moves "Q4 launch" directly under "Work" and this device syncs
- **THEN** the sidebar shows "Q4 launch" as a sibling of "Client A" without a page reload

#### Scenario: Full path on hover
- **WHEN** the user hovers or focuses "Q4 launch" at the capped indentation
- **THEN** a tooltip reads "Work › Client A › Q4 launch"

### Requirement: Sub-projects inside a project view
A project's view SHALL show a collapsible "Sub-projects" group at the top of its list, using the shared group header, naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project; the group SHALL be hidden when the project has no sub-projects. The project's own open tasks follow. Quick add in a project view SHALL add to that project only, not to its sub-projects.

#### Scenario: Sub-project list
- **WHEN** the user opens "Home", which has sub-projects "Garden" (3 open tasks, with a sub-project holding 1) and "Kitchen" (0)
- **THEN** above Home's tasks a "Sub-projects" group lists "Garden 4" and "Kitchen 0", and it stays collapsed on this device once collapsed

#### Scenario: Quick add stays in the parent
- **WHEN** the user quick-adds a task while viewing "Home"
- **THEN** the task belongs to "Home" and is not shown inside "Garden"

## ADDED Requirements

### Requirement: Project icon
A project MAY carry an icon from the app's icon set, stored as an additive `icon` field on the project and changed as an ordinary project operation (applied locally first, converging by last-writer-wins). The sidebar, the page header and the project chip SHALL show it in the project's colour; without one they show a coloured dot.

#### Scenario: Pick an icon offline
- **WHEN** the device is offline and the user picks the "briefcase" icon for "Work" from the project menu
- **THEN** the sidebar shows it at once, and other devices show it after sync

#### Scenario: Clients that know no icon
- **WHEN** an older client or the CLI reads a project with an icon
- **THEN** the field is ignored and the project renders with its dot as before
