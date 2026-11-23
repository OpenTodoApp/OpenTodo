## ADDED Requirements

### Requirement: The Schedule sheet and Park in Someday are steps
Choosing Today, Tomorrow, Next week or a picked day in the phone's Schedule sheet (from a left swipe on a row or Schedule… in the touch menu) SHALL record one step in the undo history named "Rescheduled" and SHALL show the Undo toast; a task parked in Someday SHALL come back in the same step. Choosing Someday in that sheet, the command palette's "Park … in Someday", and the park key in every list (task lists, saved views, the Daily check, the reviews and the method lists) SHALL record one step named "Moved to Someday" and SHALL show the Undo toast. Undoing a step SHALL restore the task's previous date, start and This Evening, and redoing it SHALL apply the change again. A repeating task SHALL be written as before, without a step: a new date is carried to its series, and parking it ends its repetition. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a swipe to Tomorrow
- **WHEN** a person swipes a task without a date left on a phone, chooses Tomorrow, and then chooses Undo on the toast
- **THEN** the task has no date again

#### Scenario: Park from the palette
- **WHEN** a person parks a task in Someday from the command palette and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is back in its list with its date

#### Scenario: A repeating task
- **WHEN** a person parks a weekly task in Someday
- **THEN** it is parked and stops repeating, as before, and no step is added
