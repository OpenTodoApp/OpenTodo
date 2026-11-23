## ADDED Requirements

### Requirement: The panel's Start date, Multi-day switch and time zone are steps
Setting or clearing one task's start date in the task panel, turning its Multi-day switch on or off, and fixing its time to a time zone or releasing it SHALL each record one step in the undo history named "Rescheduled", and SHALL NOT show the Undo toast, like the panel's other single edits. Undoing the step SHALL restore the values the task had before it, and redoing it SHALL apply them again. A change to the values a task already has SHALL record nothing. A repeating task SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a start date
- **WHEN** a person gives a task without a start the start date 16 October in the task panel and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task has no start date again

#### Scenario: Undo releasing a zone
- **WHEN** a person releases a 09:00 meeting fixed to Berlin and then undoes it
- **THEN** the meeting is fixed to Berlin again

#### Scenario: A repeating task
- **WHEN** a person gives a weekly task a start date
- **THEN** the series gets it as before and no step is added
