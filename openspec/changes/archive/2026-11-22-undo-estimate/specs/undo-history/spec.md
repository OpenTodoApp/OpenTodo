## ADDED Requirements

### Requirement: Changing an estimate is a step
Setting or removing one task's estimate (the task panel's Estimate field or its remove button, or a calendar block's lower edge) SHALL record one step in the undo history, named "Estimate {minutes} min" or "Estimate removed". The calendar edit SHALL also offer the Undo toast, like the block's other edits; the task panel SHALL NOT show one. Undoing it SHALL restore the previous estimate and redoing it SHALL apply it again. Setting the estimate a task already has SHALL record nothing. A repeating task's estimate SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo an estimate typed by mistake
- **WHEN** a person types 90 in the Estimate field of a task estimated at 30 minutes and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the estimate is 30 minutes again

#### Scenario: Calendar resize
- **WHEN** a person drags the lower edge of a one-hour block in the week to make it 90 minutes
- **THEN** the toast offers Undo, and undoing it gives the block its hour back

#### Scenario: A repeating task
- **WHEN** a person sets the estimate of a weekly task
- **THEN** the series gets that estimate as before and no step is added
