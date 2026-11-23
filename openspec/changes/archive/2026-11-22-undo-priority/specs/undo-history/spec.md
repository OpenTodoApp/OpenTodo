## ADDED Requirements

### Requirement: Setting a priority is a step
Setting one task's priority (a list's or the task panel's priority keys, the row menus and the row edit bar, the task panel's priority, the command palette, Vim) SHALL record one step in the undo history, named like the bulk action for one task (for example "Priority 1 set on 1 task"), without showing an undo toast. Undoing it SHALL restore the previous priority and redoing it SHALL set it again. Setting the priority a task already has SHALL record nothing. A repeating task's priority SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a wrong key
- **WHEN** a person selects "Pay rent" at priority 3 in a list, presses 1, then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Pay rent" is back at priority 3

#### Scenario: Same priority again
- **WHEN** a person sets priority 2 on a task that already has priority 2
- **THEN** no step is added to the undo history

#### Scenario: A repeating task
- **WHEN** a person sets priority 1 on a task that repeats every week
- **THEN** the series gets priority 1 as before and no step is added
