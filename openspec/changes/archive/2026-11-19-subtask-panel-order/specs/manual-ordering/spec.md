## ADDED Requirements

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
