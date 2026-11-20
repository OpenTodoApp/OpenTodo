## ADDED Requirements

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
