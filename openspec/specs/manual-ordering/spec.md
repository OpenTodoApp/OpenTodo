# manual-ordering Specification

## Purpose
Defines how users reorder tasks and projects by hand, how positions are assigned so moves stay cheap, and how concurrent reorders on several devices converge to one order.

## Requirements

### Requirement: Manual order by position
Lists that support manual ordering SHALL sort items by their `position` number ascending, breaking ties by id, so that every device derives the same order from the same data. New items SHALL be placed at the end of their list, except where the requirement "Where new tasks are added" places a new task at the top. A move SHALL change only the moved item's position as an operation applied locally first, so it works offline and converges under per-field last-writer-wins.

#### Scenario: Same order on every device
- **WHEN** two devices hold the same set of operations for a project's tasks
- **THEN** both show the tasks in the same order

#### Scenario: Offline move
- **WHEN** the device is offline and the user moves a task from fifth to second place
- **THEN** the list shows the new order immediately, it survives a reload, and the single position operation is uploaded when the network returns

### Requirement: Drag and drop within a list
Items in a manually ordered list SHALL be draggable with a mouse and with touch (after a short press), showing a drop indicator between items while dragging. Dropping SHALL place the item at the indicated place; pressing Escape or dropping outside any list SHALL cancel without changes.

#### Scenario: Drag to a new place
- **WHEN** the user drags the third task and drops it above the first
- **THEN** it becomes the first task and the others keep their relative order

#### Scenario: Cancel a drag
- **WHEN** the user starts dragging a task and presses Escape
- **THEN** the list is unchanged and no operation is queued

### Requirement: Keyboard moves
With an item selected, Alt+Up and Alt+Down SHALL move it one place up or down within its list, and Alt+Shift+Up and Alt+Shift+Down SHALL move it to the top or bottom. The selection SHALL stay on the moved item. At the edge of a list the key SHALL do nothing. The shortcuts SHALL not fire while typing in a field.

#### Scenario: Move up
- **WHEN** the second task is selected and the user presses Alt+Up
- **THEN** it becomes the first task and remains selected

#### Scenario: Edge of the list
- **WHEN** the first task is selected and the user presses Alt+Up
- **THEN** nothing changes and no operation is queued

### Requirement: Fractional insertion and renumbering
A move SHALL assign the midpoint between the positions of the new neighbours (or an offset beyond the first or last item) so that a single move writes one operation. When the neighbours are too close for a distinct value between them, the client SHALL renumber only the items of that list with even spacing and then place the moved item, writing one operation per renumbered item. Renumbering SHALL be invisible to the user and SHALL converge like any other batch.

#### Scenario: One operation per move
- **WHEN** the user moves a task between two tasks with positions 1000 and 2000
- **THEN** exactly one operation is queued, setting its position to 1500

#### Scenario: Exhausted gap
- **WHEN** the gap between the new neighbours can no longer be bisected
- **THEN** the list is renumbered with even spacing, the moved task sits where it was dropped, and the order of all other items is preserved

### Requirement: Ordering within sections and parents
In a project, ordering SHALL be independent within each section and within each parent task's subtasks. Dragging or moving a task into another section or under another parent SHALL set the container field and the new position in one operation batch so the task appears in exactly one place with a consistent position on every device. Project rows in the sidebar SHALL be orderable among their siblings in the same way.

#### Scenario: Reorder within a section
- **WHEN** the user drags a task to a new place inside section "Doing"
- **THEN** only "Doing" changes order and other sections are untouched

#### Scenario: Drop into another section at a place
- **WHEN** the user drags a task from "Backlog" and drops it between the first and second task of "Doing"
- **THEN** the task is in "Doing" in second place on this device now and on other devices after sync

#### Scenario: Reorder sidebar projects
- **WHEN** the user presses Alt+Down on the selected project "Home"
- **THEN** "Home" swaps places with the next project of the same level

### Requirement: Convergence under concurrent reordering
When two devices reorder the same list offline, every device SHALL end with the same order after sync, derived from the per-item positions under last-writer-wins and the id tie-break. No item SHALL be lost or duplicated, though the resulting order MAY interleave both devices' intentions. A renumbering on one device concurrent with a move on another SHALL still yield one identical order everywhere.

#### Scenario: Two devices move different tasks
- **WHEN** device A moves task X to the top and device B moves task Y to the bottom, both offline, then both sync
- **THEN** both devices show X first and Y last with the remaining tasks in their previous order

#### Scenario: Two devices move the same task
- **WHEN** device A moves task X to the top and device B moves X to the bottom, both offline, then both sync
- **THEN** both devices show X in the place written with the greater timestamp

#### Scenario: Renumber concurrent with a move
- **WHEN** device A renumbers a list offline while device B moves one of its tasks offline, and both sync
- **THEN** both devices show the same order and every task appears exactly once

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

### Requirement: Where new tasks are added
The account SHALL have one synced preference "Add new tasks" with the values "At the bottom of the list" (the default, also for an empty or unknown stored value, which is kept) and "At the top of the list", set in Settings → Capture → Quick add. With "top", a task added from a project's or the Inbox's quick add, from a section's add row in a list, from a board column's add row, or from the command bar or the phone's add sheet into such a list SHALL be created with a position below every existing task, so it is first in its list, section or column; several tasks created in one batch SHALL keep their order as a block at the top. With "bottom", those tasks SHALL be appended as before. Subtasks, the insert-after-the-selected-task shortcut, duplicates, templates, imports and tasks written by the server (REST, CLI, MCP, CalDAV, email, integrations) SHALL keep their own placement. In views not in manual order the position SHALL only break ties. The preference SHALL be written as an operation, work offline, reach the user's other devices and converge by last-writer-wins; a task's position is written in the same batch as the task, so a top insertion made offline converges like any create, and two tasks placed at the top concurrently on two devices SHALL appear in the same order on every device through the id tie-break.

#### Scenario: Add at the top of a long project
- **WHEN** "Add new tasks" is "At the top of the list" and the user adds "Call the plumber" from the quick add of a project with 80 tasks in manual order
- **THEN** "Call the plumber" is the first task of the project, visible under the quick add, on this device now and on other devices after sync

#### Scenario: Default stays at the bottom
- **WHEN** the preference was never set and the user adds a task to the Inbox
- **THEN** the task is the last task of the Inbox

#### Scenario: Top of a section
- **WHEN** the preference is "top" and the user adds a task from the add row of section "Doing"
- **THEN** the task is the first task of "Doing" and the other sections are unchanged

#### Scenario: Sorted list keeps its sort
- **WHEN** the preference is "top" and the user adds a task without a due date to a project shown by due date
- **THEN** the task appears where the due-date order puts it, and among tasks with the same sort value it comes first

#### Scenario: Preference on another device
- **WHEN** the user sets "top" on the laptop and later adds a task on the phone after sync
- **THEN** the phone places the task at the top

#### Scenario: Offline top insertion on two devices
- **WHEN** with "top" set, two devices each add a task to the same project offline and both sync
- **THEN** both tasks are above the earlier tasks, in the same order on every device

#### Scenario: API keeps appending
- **WHEN** a client creates a task with `POST /api/v1/tasks` without a position while the preference is "top"
- **THEN** the task is appended at the end of its list

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
