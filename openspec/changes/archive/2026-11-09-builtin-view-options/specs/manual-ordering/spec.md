## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list or the Inbox shown in another order (OpenSpec `list-display-options`, `builtin-view-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today, Upcoming, Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, or on Today and Upcoming the order chosen in their display options, offer no Manual order and use position only to break ties; dragging among rows and keyboard moves SHALL be unavailable there, except that Upcoming SHALL take a dragged task onto another day (see "Drag a task to another day in Upcoming"). The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to drag a task in Today or presses Alt+Up there
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
