## MODIFIED Requirements

### Requirement: Checklist items become subtasks
On a check-list line, or a selection holding check-list lines, in a task's notes the editor SHALL offer Make subtask (slash menu, context menu and a key combination registered in the shortcut registry); it SHALL create one subtask of the task per check-list line with the line's text as title, the task's project, and the line's checked state as completion. In a project's note and in a standalone note the same command, the same key and the same menus SHALL offer Make tasks: one task per check-list line, its line read with quick-add syntax (a date, a priority, labels), in the project of the note (a standalone note without a project: the Inbox of the note's workspace), with the line's checked state as completion. Either command SHALL replace each line with a paragraph holding a link to its task, and SHALL be one change that Undo reverts in one step, the tasks and the note together. Lines of the selection that are not check-list lines, and lines that already hold only a link to a task, SHALL be left as they are; one command SHALL turn at most 50 lines and say so when the selection holds more. The link SHALL show the task's current title and done state when the task is on the device, and the stored text otherwise, so the note's Linked references and the task's Linked references connect the two. The tasks and the note change SHALL be written as local operations in one batch, offline included, and SHALL converge like any task creation and note edit: a concurrent edit of the same note on another device merges with the replaced lines. Viewers of a shared project SHALL not be offered either command. The commands SHALL not be offered in comments.

#### Scenario: Make subtask offline
- **WHEN** the device is offline and the user chooses Make subtask on the line "Book hotel"
- **THEN** "Book hotel" appears as a subtask under the task at once, the line reads as a link to it, and both reach other devices on the next sync

#### Scenario: Undo
- **WHEN** the user presses Undo right after Make subtask
- **THEN** the subtask is gone and the checklist line is back with its text and state

#### Scenario: Subtask retitled
- **WHEN** the subtask is renamed on another device and this one syncs
- **THEN** the link in the note shows the new title without a write to the note

#### Scenario: Meeting note to tasks
- **WHEN** the user selects three lines of the standalone note "Planning meeting" in Work, "[ ] book room friday", "notes from Anna" and "[ ] send agenda p1", and presses Ctrl+Shift+Enter
- **THEN** two tasks are created in Work, "book room" due Friday and "send agenda" with priority 1, the two lines read as links to them, "notes from Anna" is unchanged, and the note's Linked references list nothing new while each task's Linked references list the note

#### Scenario: Several subtasks at once
- **WHEN** the user selects four check-list lines in the note of the task "Move house" and chooses Make subtask
- **THEN** four subtasks of "Move house" are created and Undo removes all four and restores the lines

#### Scenario: Concurrent edit
- **WHEN** the user makes tasks from two lines of a project note offline while another member adds a paragraph to the same note, and both sync
- **THEN** every device shows the two links and the new paragraph, and the two tasks exist once

#### Scenario: Viewer
- **WHEN** a viewer of a shared project selects check-list lines in its project note
- **THEN** neither Make tasks nor Make subtask is offered

#### Scenario: Too many lines
- **WHEN** the user selects 70 check-list lines and chooses Make tasks
- **THEN** the first 50 become tasks and the editor says 20 lines were left
