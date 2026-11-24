## ADDED Requirements

### Requirement: Sort projects by name
A project's menu SHALL offer "Sort sub-projects by name" when the project has two or more sub-projects and the user may move them (its owner or an admin), and the sidebar's Projects header menu SHALL offer "Sort by name" for the top-level projects. Each SHALL order the projects of that level once, A to Z in the app's language, with numbers compared by value and case ignored, by writing their positions in one operation batch with one Undo. The projects SHALL take the positions the level already holds, so a project the user may not move keeps its place and is not written. The order SHALL stay manual afterwards. The sort SHALL work offline, applied locally first, and converge under per-field last-writer-wins like any move.

#### Scenario: Numbered sub-projects
- **WHEN** "Clients" has the sub-projects "0010 Lee", "0002 Kim" and "0001 Ito" in that order and the user chooses "Sort sub-projects by name"
- **THEN** they read "0001 Ito", "0002 Kim", "0010 Lee", the top-level projects keep their order, and Undo restores the previous order

#### Scenario: Numbers by value
- **WHEN** the top-level projects are "10 Lee", "beta" and "2 Kim" and the user chooses "Sort by name"
- **THEN** they read "2 Kim", "10 Lee", "beta"

#### Scenario: The order stays manual
- **WHEN** the user creates a project after sorting
- **THEN** it goes last, and Move up, Move down and drag still move projects

#### Scenario: A project the user may not move
- **WHEN** the top level holds a shared project the user only edits tasks in
- **THEN** the sort leaves it in its place and queues no operation for it

### Requirement: Project moves follow the shown projects
Moving a project up or down, dragging it and sorting by name SHALL count only the projects of the current workspace as its neighbours. On the All projects page, Alt+Up and Alt+Down SHALL move the focused row among its siblings, and Alt+Shift+Up and Alt+Shift+Down to the top or bottom, keeping focus on it; while a column header sorts the table, rows SHALL not be movable.

#### Scenario: Another workspace
- **WHEN** the account has two workspaces and the user moves the first top-level project of the current one down
- **THEN** it swaps with the next project shown, never with a project of the other workspace

#### Scenario: Repeated keyboard moves on the All projects page
- **WHEN** the user presses Alt+Down twice on the first row of "A", "B", "C"
- **THEN** the rows read "B", "C", "A" and the moved row keeps focus

#### Scenario: Sorted by a column
- **WHEN** the table is sorted by Name and the user presses Alt+Down on a row
- **THEN** nothing moves and no operation is queued
