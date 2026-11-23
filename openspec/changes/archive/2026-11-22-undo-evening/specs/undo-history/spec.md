## ADDED Requirements

### Requirement: This Evening is a step
Marking one task for This Evening or taking it out (a list's This Evening key, the task panel's This Evening, the command palette) SHALL record one step in the undo history, named with the day-part words (for example "Moved to This Evening"), without showing an undo toast. Undoing it SHALL restore the task's previous part of the day and redoing it SHALL apply it again. A task already in that state SHALL record nothing. A repeating task SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo This Evening
- **WHEN** a person presses the This Evening key on "Call mum" in Today and then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Call mum" is no longer marked for This Evening

#### Scenario: Already there
- **WHEN** a person marks a task for This Evening that is already marked
- **THEN** no step is added to the undo history

#### Scenario: A repeating task
- **WHEN** a person marks a daily task for This Evening
- **THEN** the series is marked as before and no step is added
