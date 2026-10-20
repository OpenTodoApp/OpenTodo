# Spec Delta

## MODIFIED Requirements

### Requirement: Open task counts
The sidebar SHALL show the number of open tasks for the Inbox and for Today at all times, and for each project while its row is hovered or focused; on a coarse pointer, where there is no hover, a project's count SHALL be visible at all times. A project row's accessible name SHALL always carry its count ("Website launch, 5 open tasks"), so the number is read whether or not it is visible, and revealing it SHALL not change the row's height or move its label. For a collapsed project the count SHALL include the open tasks of all its non-archived, non-deleted descendants; for an expanded project it SHALL count only the project's own tasks. Counts SHALL be computed from local data so they are correct offline, and SHALL follow changes from other devices after sync; nothing is written for them.

#### Scenario: Counts update live
- **WHEN** a task in a project is completed while the project's row is hovered
- **THEN** that project's visible count decreases without a page reload, and the row's accessible name follows

#### Scenario: Rolled-up count when collapsed
- **WHEN** "Home" has 2 open tasks and its sub-project "Garden" has 3, "Home" is collapsed, and the user hovers "Home"
- **THEN** the sidebar shows 5 next to "Home" with "Open tasks including sub-projects" as its description; expanding it and hovering each row shows 2 next to "Home" and 3 next to "Garden"

#### Scenario: Nothing visible at rest
- **WHEN** no project row is hovered or focused on a desktop with a mouse
- **THEN** no project row shows a number, and a screen reader moving down the tree still reads each project's count

#### Scenario: Touch screen
- **WHEN** the sidebar is shown on a tablet without a mouse
- **THEN** every project with open tasks shows its count at all times, as before this change
