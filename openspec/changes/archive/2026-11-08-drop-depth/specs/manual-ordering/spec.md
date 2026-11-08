## MODIFIED Requirements

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
