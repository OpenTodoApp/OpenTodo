# Spec Delta

## Purpose

Defines how users reorder tasks and projects by hand, how positions are assigned so moves stay cheap, and how concurrent reorders on several devices converge to one order.

## ADDED Requirements

### Requirement: Manual order by position
Lists that support manual ordering SHALL sort items by their `position` number ascending, breaking ties by id, so that every device derives the same order from the same data. New items SHALL be appended at the end of their list. A move SHALL change only the moved item's position as an operation applied locally first, so it works offline and converges under per-field last-writer-wins.

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
Manual ordering SHALL apply to project views (list and board), the Inbox, and the project tree in the sidebar. Today, Upcoming, Completed, label and filter views SHALL keep their own sort rules and use position only to break ties; dragging and keyboard moves SHALL be unavailable there and the shortcut help SHALL say so.

#### Scenario: Not draggable in Today
- **WHEN** the user tries to drag a task in Today or presses Alt+Up there
- **THEN** nothing moves and the item is not shown as draggable

#### Scenario: Position as tie-breaker
- **WHEN** two tasks are due on the same day with the same priority in Upcoming
- **THEN** they are listed in the order given by their positions
