## MODIFIED Requirements

### Requirement: Which views are manually ordered
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list shown in another order (OpenSpec `list-display-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today, Upcoming, Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, offer no Manual order and use position only to break ties; dragging and keyboard moves SHALL be unavailable there. The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to drag a task in Today or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming
- **THEN** they are listed in the order given by their positions

#### Scenario: Project shown in another order
- **WHEN** a project is ordered by due date and the user presses Alt+Up on a task
- **THEN** the project's order becomes Manual order and the task moves one place up in it

#### Scenario: No Manual order before saving
- **WHEN** the user opens Display options on the New view page
- **THEN** Order by offers Due date, Priority, Created, Deadline and Title, and not Manual order

## ADDED Requirements

### Requirement: Manual order of a label page or saved view
A label page and a saved list view SHALL each keep their own manual order, stored on the label or the view as the ordered list of the tasks placed by hand, separate from the tasks' positions in their projects: moving a task there SHALL never change any task's position, section or parent. Under Order by Manual order ascending the page SHALL list its placed tasks in the stored order, then every task never placed in the tasks' position order (what the page showed before any move); descending SHALL reverse that sequence. Dragging a task among the rows (mouse or pen, or touch after a short press), Alt+Up, Alt+Down, Alt+Shift+Up and Alt+Shift+Down, and Vim's Shift+J and Shift+K SHALL move it within its group (its column on a view's board), with the drop indicator shown only within that group; a page shown in another order SHALL first switch to Manual order ascending. Each move SHALL show "Order changed" with Undo, which restores the previous order unless it changed again since. A viewer of a shared project SHALL be able to order its tasks on their own label page or view. The stored list SHALL hold at most 500 task ids: the moved task and the tasks above it; tasks below the last placed one stay unplaced, new tasks appear after the placed ones, and ids of tasks deleted, completed (where completed tasks are not shown) or unknown SHALL be dropped at the next move, while ids of open tasks not shown right now keep their place. The order SHALL be written as one operation on the label or view, applied locally first so it works offline, reaching the user's other devices after sync; concurrent moves of the same page on two devices SHALL converge to the newer device's whole order, and another field of the label or view changed concurrently SHALL be kept.

#### Scenario: Reorder errands
- **WHEN** the label page "errand" is in Manual order and the user drags "Post office" above "Pharmacy"
- **THEN** "Post office" is listed above "Pharmacy" on this page, on the user's other devices after sync and after a reload, and the projects of both tasks keep their order

#### Scenario: Keyboard in a saved view
- **WHEN** the saved view "Waiting for" is grouped by project in Manual order and the user selects the second task of "Home" and presses Alt+Up
- **THEN** it becomes the first task of "Home", stays selected, and the other groups are unchanged

#### Scenario: Under another order
- **WHEN** a saved view is ordered by due date and the user presses Alt+Down on a task
- **THEN** the view's order becomes Manual order and the task moves one place down in it

#### Scenario: Undo
- **WHEN** the user drags a task on a label page and chooses Undo on the "Order changed" notice
- **THEN** the page shows the previous order

#### Scenario: Viewer of a shared project
- **WHEN** Ben, a viewer of Ana's project "Launch", opens his label page "follow-up" listing two tasks of "Launch" and moves the second above the first
- **THEN** his label page shows the new order and Ana's project "Launch" is unchanged

#### Scenario: New tasks fall to the end
- **WHEN** the user has placed three tasks on a label page and then adds a fourth task with that label
- **THEN** the new task is listed after the three placed tasks

#### Scenario: Offline and concurrent
- **WHEN** the phone, offline, moves a task to the top of the view "Urgent" while the laptop moves another task to its top, and the phone syncs later
- **THEN** both devices show the phone's order and no task is listed twice or lost
