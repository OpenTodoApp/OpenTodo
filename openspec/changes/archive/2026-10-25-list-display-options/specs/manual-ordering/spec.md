## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, and the project tree in the sidebar. A project list shown in another order (OpenSpec `list-display-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first. Today, Upcoming, Completed, label and filter views SHALL keep their own sort rules and use position only to break ties; dragging and keyboard moves SHALL be unavailable there and the shortcut help SHALL say so.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to drag a task in Today or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming
- **THEN** they are listed in the order given by their positions

#### Scenario: Project shown in another order
- **WHEN** a project is ordered by due date and the user presses Alt+Up on a task
- **THEN** the project's order becomes Manual order and the task moves one place up in it
