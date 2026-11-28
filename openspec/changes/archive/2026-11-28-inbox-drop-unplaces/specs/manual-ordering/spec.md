## MODIFIED Requirements

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
