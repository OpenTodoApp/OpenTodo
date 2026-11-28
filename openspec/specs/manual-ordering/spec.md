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
Items in a manually ordered list SHALL be draggable with a mouse and with touch (after a short press), showing a drop indicator between items while dragging. Dropping SHALL place the item at the indicated place; pressing Escape or dropping outside any list SHALL cancel without changes. In a list that shows subtasks under their parents, a drop between two rows SHALL take a level: the dragged task's own level while the pointer moves only up or down, one level deeper for each indent the pointer has moved to the right since the drag began and one shallower for each indent to the left, never shallower than the row below the line and never deeper than one level under the row above. At the level of the row above or shallower the task SHALL land after that row's ancestor at that level; one level deeper it SHALL become a subtask of the row above. Dropping on the middle of a row SHALL make the task that row's last subtask. The move SHALL be one local operation, so it works offline and converges like every move.

#### Scenario: Drag to a new place
- **WHEN** the user drags the third task and drops it above the first
- **THEN** it becomes the first task and the others keep their relative order

#### Scenario: Cancel a drag
- **WHEN** the user starts dragging a task and presses Escape
- **THEN** the list is unchanged and no operation is queued

#### Scenario: Keep the level below a deep subtree
- **WHEN** a project lists D, then A with its subtask B and B's subtask C, then E, and the user drags D straight down to just below C
- **THEN** the line starts at the top level's indent, and dropping makes D a top-level task between A and E

#### Scenario: Move right to nest
- **WHEN** in the same project the user drags D below C and moves the pointer two indents to the right
- **THEN** the line starts at C's indent, and dropping makes D a subtask of B right after C

#### Scenario: Offline
- **WHEN** the device is offline and the user drops a task at a new level
- **THEN** the list shows it there at once, and its parent and position are uploaded when the network returns

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
Manual ordering SHALL apply to project views (list and board), the Inbox, the project tree in the sidebar, label pages and saved list views. A project list or the Inbox shown in another order (OpenSpec `list-display-options`, `builtin-view-options`) SHALL stay draggable and movable by keyboard, and a move SHALL switch it back to manual order first; label pages and saved list views SHALL behave the same way (see "Manual order of a label page or saved view"). Today, under every grouping, and Upcoming SHALL support the user's own day order (see "Project-group drops in Today" and OpenSpec `builtin-view-options` "Manual order of the day"); shown in another order they SHALL stay draggable and movable by keyboard, and a move SHALL switch them to Manual order first, as a project does. Anytime, Someday, Assigned to me, Completed and place lists SHALL keep their own sort rules, offer no Manual order and use position only to break ties; dragging among rows and keyboard moves SHALL be unavailable there. The unsaved New view page SHALL not offer Manual order.

#### Scenario: Not draggable in Today
- **WHEN** Today is under Manual order and the user tries to reorder a task inside Earlier or Blocked, or presses Alt+Up there
- **THEN** nothing moves and no drop line is shown, because those groups keep Today's default order

#### Scenario: Reordering in Today by time of day
- **WHEN** Today is grouped by Time of day and ordered by due date, and the user presses Alt+Up on the second task under Morning
- **THEN** Order by switches to Manual order, the task is first under Morning, and the other groups keep their order

#### Scenario: No reordering within a day of Upcoming
- **WHEN** Start with Today is on and the user drags a task over a row of Upcoming's Earlier group
- **THEN** no drop line shows, and releasing changes nothing

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

### Requirement: Add a task below another
In a project the user can edit and in the Inbox, the row menu of a task that can move SHALL offer Add task below. It SHALL open an inline line after the task and its visible subtasks, at the task's level, focused. Each title entered SHALL become a task in the same project, parent and section, placed right after the last task the line added (the first time, right after the task); the line SHALL then show under the new task and keep the focus. Escape, or leaving the line empty, SHALL close it. Each task SHALL be created and placed by local operations, so it works offline and converges like a quick add followed by a move. The item SHALL not be offered for a completed task, for a viewer of a shared project, on a board, or in a list without subtasks under their parents.

#### Scenario: Between a subtree and the next task
- **WHEN** a project lists A with its subtask B and B's subtask C, then E, and the user chooses Add task below on A, types "Prepare", sends it, then types "Buy paint" and sends it
- **THEN** the project lists A (with B and C), Prepare, Buy paint, E, and the line shows under Buy paint

#### Scenario: Below a subtask
- **WHEN** the user chooses Add task below on the subtask B and adds "Buy supplies"
- **THEN** "Buy supplies" is a subtask of A right after B

#### Scenario: Offline
- **WHEN** the device is offline and the user adds a task below another
- **THEN** it shows in place at once, survives a reload, and is uploaded with its position when the network returns

#### Scenario: Not for a viewer
- **WHEN** a viewer of a shared project opens a task's row menu
- **THEN** Add task below and Add subtask are not offered

### Requirement: Drag a task to another day in Upcoming
In Upcoming, a task dragged with a mouse or pen, or on touch after the same press and hold as reordering, and released on another day's group SHALL move to that day as a drop on a day of the calendar does: its due date SHALL become that day and keep its time and time zone; a task that spans several days SHALL move whole, its start and due by the same number of days; a deadline SHALL never move, so a task listed by its deadline gets that day as its due date; a task listed by its start date (deferred, without a project or a due date) SHALL stay deferred to that day, and on today SHALL become due today; a repeating task SHALL change only its date. While the pointer is over a day, that day's group SHALL show the drop ring. Over a row of a day from Tomorrow on, a drop line SHALL show too, and the release SHALL also place the task at the line in the day order, in the same batch (see OpenSpec `builtin-view-options` "Manual order of the day"); over the day's heading, a closed summarised day or a day listed only for its calendar events, the task SHALL keep its place in the day order. A day listed only for its calendar events SHALL take the drop too. With Start with Today on, Today's day groups (Today, Morning, Afternoon, This Evening) SHALL take a drop for today; Earlier, Blocked and Waiting for a slot SHALL take none. When the dragged task is part of the bulk selection, every selected task SHALL move, each by these rules, without a line. The move SHALL be one batch of operations with a toast offering Undo ("Date changed", or how many tasks moved), applied locally first so it works offline, uploaded when the network returns and converging per field by last-writer-wins like any date edit. Dropping on the task's own day without a line, outside any day, on a task the user may not change, or pressing Escape SHALL change nothing.

#### Scenario: Drop on another day
- **WHEN** "Dentist" is due tomorrow at 09:30 and the user drags it under Saturday's heading in Upcoming
- **THEN** it is due Saturday at 09:30, listed under Saturday, and the toast reads "Date changed" with Undo, which puts it back on tomorrow

#### Scenario: Touch
- **WHEN** on a phone the user presses and holds "Call Ada", then moves it onto Friday's group and lifts the finger
- **THEN** "Call Ada" is due Friday

#### Scenario: Deadline stays
- **WHEN** "File taxes" has no due date and the deadline 20 October, is listed under 20 October, and the user drops it on 16 October
- **THEN** it is due 16 October and its deadline is still 20 October

#### Scenario: A span moves whole
- **WHEN** a trip spans 16 to 18 October and the user drops it on 20 October
- **THEN** it spans 20 to 22 October

#### Scenario: A closed summarised day
- **WHEN** a later day of Upcoming is a closed Summarised bar and the user drags a task onto it
- **THEN** the task moves to that day, no drop line is shown among the bar's hidden tasks, and its place in the day order is kept

#### Scenario: Earlier takes no drop
- **WHEN** Start with Today is on and the user releases a task over the Earlier group
- **THEN** nothing changes and no operation is queued

#### Scenario: Offline
- **WHEN** the device is offline and the user drops a task on another day
- **THEN** the list shows it under that day at once, and its due date is uploaded when the network returns

#### Scenario: Escape
- **WHEN** the user drags a task over another day and presses Escape
- **THEN** the task keeps its date and no operation is queued

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

### Requirement: Project-group drops in Today

In Today under Project grouping, tasks in the editable project groups and the displayed group of tasks without a project (headed "No project", OpenSpec `project-organization` "Move to the Inbox") SHALL support the rules in "Drops across project groups in a view". A drop line between rows SHALL position the task before or after that row in the destination group's own Today order. A first positional drop or keyboard reorder SHALL switch Today to Manual order and preserve the displayed relative order of the other top-level tasks in the project groups, subject to the existing 500-ID bound. A drop onto a group heading or empty space in a displayed group SHALL transfer the task at the top level, keep the current sort and preserve any personal order rank. With Nest subtasks enabled, a drop onto the middle of a row SHALL nest it as the last subtask of that row under the sharing-scope and permission rules in that requirement. A transfer to that group SHALL clear the task's project while preserving dates, so the task stays in Today; it is not a move to the Inbox. The move SHALL preserve the existing Today membership rules and keep Earlier, Blocked, Waiting for a slot and Done today outside these gestures.

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

### Requirement: Reorder subtasks where a task lists them
Where a task lists its subtasks with their add line (the task panel and the task page), each open subtask SHALL have a move handle when two or more subtasks are open and the user can edit the task. Dragging the handle with a mouse, a pen or touch SHALL show the new order while dragging and SHALL write it on release; Alt+Up and Alt+Down on the handle SHALL move the subtask one place, Alt+Shift+Up and Alt+Shift+Down to the top or bottom, and activating the handle SHALL offer Move up and Move down. The move SHALL write positions only, among the parent's open subtasks, in one operation batch, as a move in a project list does, and SHALL be announced to assistive technology. Completed subtasks SHALL have no handle and keep their place. At the edge of the list a key SHALL do nothing and queue no operation.

#### Scenario: Move with the keyboard
- **WHEN** a task lists the open subtasks Paint, Sand and Prime and the user presses Alt+Down on Paint's handle
- **THEN** the list reads Sand, Paint, Prime, "Paint moved to position 2 of 3" is announced, only position fields are queued and focus stays on Paint's handle

#### Scenario: Single pointer
- **WHEN** the user clicks the handle of the first subtask
- **THEN** a menu offers Move up, unavailable, and Move down, which moves it one place

#### Scenario: Viewer and completed subtasks
- **WHEN** a viewer opens the task, or a subtask is completed, or only one subtask is open
- **THEN** no handle is shown for those rows and their places do not change

### Requirement: Drag several ticked tasks within a list
In a manually ordered project list or the Inbox, dragging a row that is ticked while other rows of that list are ticked SHALL move every ticked task, not only the dragged one, to the place the drop line shows, in the order the list showed them. The moved tasks SHALL land next to each other under the drop line's parent, in the section of the row they land beside, and the others SHALL keep their relative order. A ticked task SHALL carry its subtasks that are not ticked, keeping their structure; a ticked subtask of a ticked task SHALL leave its parent and land as a sibling right after it, in display order, with its own untouched subtasks. Dropping onto a ticked row, or into the line just above or below one, SHALL act as a drop right after that row at its level: the selection gathers there, nothing is refused. Rows inside the subtree a ticked task carries SHALL take no drop, as a dragged task's own subtree takes none today. The drag preview SHALL read how many tasks move ("3 tasks"). The move SHALL be one batch of ordinary position, parent and section operations with one Undo in the bulk toast ("4 tasks moved"), applied locally first, offline included, converging like every move; the ticks SHALL stay on the moved tasks. A list the user may not edit SHALL take no drop, as today. Dragging a row that is not ticked SHALL move only that row, as today. Drops on the sidebar, a section heading or another column keep their current behaviour.

#### Scenario: Reorder three at once
- **WHEN** a project lists A, B, C, D, E, the user ticks B and D and drags D above A
- **THEN** the list reads B, D, A, C, E, and one Undo restores A, B, C, D, E

#### Scenario: Nest several under a task
- **WHEN** the user ticks C and E and drops them on the middle of A
- **THEN** C and E are A's last subtasks, in that order

#### Scenario: A parent carries its subtree
- **WHEN** B has the subtasks B1 and B2, B and D are ticked, and they are dropped below E
- **THEN** the list reads A, C, E, B (with B1 and B2 under it), D

#### Scenario: A ticked subtask pops out
- **WHEN** B with the subtasks B1 and B2 and its subtask B1 are both ticked and dropped below E
- **THEN** the list reads A, C, D, E, B (with B2 under it), B1, and B1 is a top-level task

#### Scenario: Dropped onto one of the ticked
- **WHEN** B, C and E are ticked and the user drops them on the middle of C
- **THEN** the list reads A, B, C, E, D: the three gather right after the row they were dropped on, in their order

#### Scenario: Not into a carried subtree
- **WHEN** B with the subtasks B1 and B2 is ticked with D, and the user drags over B1
- **THEN** no drop line shows there, and releasing changes nothing

#### Scenario: Offline
- **WHEN** the device is offline and the user drags three ticked tasks to a new place
- **THEN** the list shows them there at once and the positions are uploaded when the network returns
