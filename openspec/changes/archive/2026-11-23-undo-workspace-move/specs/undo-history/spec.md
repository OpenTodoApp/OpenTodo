## ADDED Requirements

### Requirement: Moving an Inbox task to another workspace is a step
Moving one task without a project to another workspace's Inbox, from the command palette's "Move to workspace" command or from the "Move to …" action of the toast shown after quick add, SHALL record one step in the undo history named "Moved to {workspace}" and SHALL show the Undo toast, as the task panel's move does. Undoing it SHALL bring the task back to the workspace it was in, and redoing it SHALL move it again. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a palette move
- **WHEN** a person moves an Inbox task of Work to Personal with the command palette and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is in Work's Inbox again

#### Scenario: The toast after quick add
- **WHEN** a person adds a task with quick add, chooses "Move to Personal" on the toast, and then chooses Undo
- **THEN** the task is back in the workspace it was added to
