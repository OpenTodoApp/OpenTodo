## ADDED Requirements

### Requirement: Changing an assignee is a step
Assigning one task to a member, to the person or to nobody in the task panel or with the list's Assign picker SHALL record one step in the undo history and offer the Undo toast, named "Assigned to {name}", "Assigned to you" or "Unassigned". Undoing it SHALL restore the previous assignee; redoing it SHALL apply it again. Assigning the person a task already has SHALL record nothing. A repeating task's assignee SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a member picked by mistake
- **WHEN** a person assigns a task to Ana instead of Ben and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is assigned to Ben again

#### Scenario: Unassign and undo
- **WHEN** a person removes a task's assignee and then undoes it from the history
- **THEN** the task has its assignee back

#### Scenario: A repeating task
- **WHEN** a person assigns a weekly task
- **THEN** the series gets the assignee as before and no step is added
