## ADDED Requirements

### Requirement: Changing a deadline is a step
Setting or removing one task's deadline in the task panel's When editor SHALL record one step in the undo history and offer the Undo toast, like the due date beside it, named "Deadline {date}" or "Deadline removed". Undoing it SHALL restore the previous deadline, and the task's deadline reminders SHALL follow the restored deadline; redoing it SHALL apply it again. Setting the deadline a task already has SHALL record nothing. A repeating task's deadline SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a deadline picked by mistake
- **WHEN** a person changes a task's deadline from 15 April to 30 April in the When editor and activates Undo on the toast
- **THEN** the deadline is 15 April again, and a deadline reminder fires for 15 April

#### Scenario: Remove and undo
- **WHEN** a person removes a task's deadline and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the deadline is back

#### Scenario: A repeating task
- **WHEN** a person sets a deadline on a monthly task
- **THEN** the series gets it as before and no step is added
