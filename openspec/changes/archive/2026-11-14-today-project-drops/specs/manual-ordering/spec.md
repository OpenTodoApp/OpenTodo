## ADDED Requirements

### Requirement: Project-group drops in Today

In Today under Project grouping, tasks in the editable project groups and the displayed Inbox group SHALL support the rules in "Drops across project groups in a view". A drop line between rows SHALL position the task before or after that row in the destination group's own Today order. A first positional drop or keyboard reorder SHALL switch Today to Manual order and preserve the displayed relative order of the other top-level tasks in the project groups, subject to the existing 500-ID bound. A drop onto a group heading or empty space in a displayed group SHALL transfer the task at the top level, keep the current sort and preserve any personal order rank. With Nest subtasks enabled, a drop onto the middle of a row SHALL nest it as the last subtask of that row under the sharing-scope and permission rules in that requirement. A transfer to Inbox SHALL clear the task's project while preserving dates. The move SHALL preserve the existing Today membership rules and keep Earlier, Blocked, Waiting for a slot and Done today outside these gestures.

Today SHALL store manual order in synced personal preferences. A reorder SHALL update that order only. A transfer or hierarchy change SHALL update the task and any affected Today placement in one undoable batch, carrying any retained rank to the replacement task ID if a transfer crosses sharing scopes. The batch SHALL apply offline and converge per field by last writer wins.

#### Scenario: Place a task in a different project group

- **WHEN** a user drops B from Home between X and Y in the Work group while Today is ordered by title
- **THEN** B and its subtree move to Work, B appears between X and Y in Today's Manual order, other tasks keep their relative order, and Undo restores the previous project, placement and sort

#### Scenario: Drop without choosing a position

- **WHEN** a user drops a task on the Work heading while Today is ordered by due date
- **THEN** the task moves to Work without changing its date or Today sort and appears where the destination sort puts it

#### Scenario: Nest under a parent in the destination project

- **WHEN** Nest subtasks is enabled and a user drops a task in the middle of a row in an editable project in the same sharing scope
- **THEN** the task moves with its subtree as the last subtask of that row and one Undo reverses the structural change and any Today order update

#### Scenario: Nest under an existing subtask

- **WHEN** the user drops onto an existing visible subtask in another editable project in the same sharing scope with Nest subtasks enabled
- **THEN** the task becomes its child, and a drop between rows with a nested depth places it at the sibling position indicated by the indented line

#### Scenario: Keep a position after sync

- **WHEN** a user places a task in Today while offline, then reconnects
- **THEN** the placement is visible immediately on that device and syncs as personal Today order

## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list or the Inbox shown in another order (OpenSpec `list-display-options`, `builtin-view-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today under Project grouping SHALL support its own manual order (see "Project-group drops in Today"). Today under other groupings, Upcoming, Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, or on Today and Upcoming the order chosen in their display options, offer no Manual order and use position only to break ties; dragging among rows and keyboard moves SHALL be unavailable there, except that Upcoming SHALL take a dragged task onto another day (see "Drag a task to another day in Upcoming"). The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to reorder a task in Today grouped by Time of day or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable

#### Scenario: No reordering within a day of Upcoming
- **WHEN** the user drags a task in Upcoming over another task of the same day
- **THEN** no drop line shows, and releasing changes nothing

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming
- **THEN** they are listed in the order given by their positions

#### Scenario: Project shown in another order
- **WHEN** a project is ordered by due date and the user presses Alt+Up on a task
- **THEN** the project's order becomes Manual order and the task moves one place up in it

#### Scenario: Inbox shown in another order
- **WHEN** the Inbox is ordered by title and the user presses Alt+Down on its first task
- **THEN** the Inbox's order becomes Manual order and the task moves one place down in it

#### Scenario: No Manual order before saving
- **WHEN** the user opens Display options on the New view page
- **THEN** Order by offers Due date, Priority, Created, Deadline and Title, and not Manual order

### Requirement: Drops across project groups in a view
In the List layout of a saved view or label page grouped by Project, a drop of a task into another project's group SHALL move the task and its subtasks in one undoable batch named "Moved to <project>". A top-level transfer SHALL clear its section and use the view's own order. In a saved list view with Nest subtasks on, a drop onto a row SHALL append to that row's subtasks. A drop between rows in that tree SHALL choose its depth with the same sideways gesture as a project list, show the line at that depth, and honor the indicated parent and sibling position. Nesting SHALL require an editable destination in the same sharing scope as the source and SHALL prevent cycles. A project the person may not edit SHALL take no drop. Other groupings and layouts SHALL keep drops within a group.

#### Scenario: Move by dropping into another group
- **WHEN** a task from Home is dropped at the top level between two Work rows
- **THEN** the task moves to Work at that position in the view's order, and Undo restores its old project and order

#### Scenario: Nest onto a task
- **WHEN** Nest subtasks is on and a task is dropped onto a row in another editable project in the same sharing scope
- **THEN** it moves there as that row's last subtask

#### Scenario: Place at a nested gap
- **WHEN** the pointer moves sideways over a gap in a saved view with Nest subtasks on
- **THEN** the drop line shows the eligible depth and releasing places the task at that sibling position

#### Scenario: Viewer's project
- **WHEN** the pointer is over the group of a project shared with the person as a viewer
- **THEN** no drop line shows and releasing changes nothing

#### Scenario: Grouped by label
- **WHEN** a view is grouped by Label
- **THEN** a drop stays within the row's group
