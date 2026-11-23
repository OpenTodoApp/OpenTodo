## ADDED Requirements

### Requirement: A task's location and Remove origin are steps
Setting or clearing one task's location SHALL record one step in the undo history, named "Location removed" when the location is cleared and "Task updated" when one is set. Removing a task's origin from the task actions menu SHALL record one step named "Task updated". Neither SHALL show the Undo toast, like the panel's other single edits. Undoing the step SHALL restore the previous value, and redoing it SHALL apply the change again. Setting the value a task already has SHALL record nothing. A repeating task SHALL be written as before, carried to its series, and SHALL NOT record a step. An edit of a field whose value this device cannot decrypt (end-to-end encryption) SHALL be written as before and SHALL NOT record a step, so an undo never writes the placeholder back; the same holds for every single-task step of this history (rename, estimate, deadline, assignee, calendar and panel date moves). The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo clearing a location
- **WHEN** a person removes "Post office" from a task's location and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is at the post office again

#### Scenario: Undo Remove origin
- **WHEN** a person chooses Remove origin on a task saved from an article and then undoes it
- **THEN** the task links to the article again

#### Scenario: A value this device cannot decrypt
- **WHEN** a person clears a location that shows "[Cannot decrypt]" on this device
- **THEN** the location is cleared as before and no step is added

#### Scenario: A repeating task
- **WHEN** a person gives a weekly task a location
- **THEN** the series gets it as before and no step is added
