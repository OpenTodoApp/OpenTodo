## ADDED Requirements

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
