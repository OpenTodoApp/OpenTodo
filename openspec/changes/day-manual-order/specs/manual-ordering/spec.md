## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list or the Inbox shown in another order (OpenSpec `list-display-options`, `builtin-view-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today, under any grouping, and Upcoming SHALL support the user's own day order (see "Project-group drops in Today" and OpenSpec `builtin-view-options` "Manual order of the day"). Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, offer no Manual order and use position only to break ties; dragging among rows and keyboard moves SHALL be unavailable there. Today and Upcoming shown in another order SHALL stay draggable and movable by keyboard, and a move SHALL switch them to Manual order first, as a project does; Upcoming SHALL keep taking a dragged task onto another day (see "Drag a task to another day in Upcoming"). The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** Today is under Manual order and the user tries to reorder a task inside Earlier or Blocked, or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable, because those groups keep Today's default order

#### Scenario: Reordering in Today by time of day
- **WHEN** Today is grouped by Time of day and ordered by due date, and the user presses Alt+Up on the second task under Morning
- **THEN** Order by switches to Manual order, the task is first under Morning, and the other groups keep their order

#### Scenario: No reordering within a day of Upcoming
- **WHEN** a later day of Upcoming is a closed Summarised bar and the user drags a task onto it
- **THEN** the task moves to that day and is placed after the day's placed tasks; no drop line is shown among the bar's hidden tasks until the day is opened

#### Scenario: Reordering within a day of Upcoming
- **WHEN** the user drags a task in Upcoming above another task of the same day
- **THEN** a drop line shows, the task is listed there after the drop, its date is unchanged, and Undo puts it back

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming ordered by priority
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
