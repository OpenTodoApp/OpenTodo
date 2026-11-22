## ADDED Requirements

### Requirement: Adding a task with quick add is a step
Adding one task with quick add (a list's quick add line, the quick add sheet, or the command bar's add) SHALL record one step in the undo history, named like a pasted batch ("1 task added"), without showing an undo toast. Undoing that step SHALL move the task and the reminders and time entry quick add created with it to the Trash; redoing it SHALL bring them back. The task SHALL be written as before: locally first, offline too, as one batch of ops that converges through sync like any other creation.

#### Scenario: Undo a task added by mistake
- **WHEN** a person adds "Call the bank" in Today's quick add and presses Ctrl/Cmd-Z with no field focused
- **THEN** "Call the bank" moves to the Trash and the feedback says the add was undone

#### Scenario: Its reminders go with it
- **WHEN** a person adds "Dentist tomorrow 10:00 !30m" with quick add and undoes it from the command palette
- **THEN** the task and its 30-minute reminder are both in the Trash

#### Scenario: Offline
- **WHEN** the device is offline, the person adds a task and undoes it, then the device reconnects
- **THEN** the server ends with the task in the Trash, as on the device
