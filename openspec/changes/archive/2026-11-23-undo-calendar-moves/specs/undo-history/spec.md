## ADDED Requirements

### Requirement: A calendar move from the keyboard or in the timeline is a step
Moving one task's dates with the keyboard in Month, Plan, Day or Week (including a span's ends), or with the timeline's keys, SHALL record one step in the undo history per key press, named "Rescheduled", and SHALL NOT show the Undo toast. A drag in the timeline (a bar, one of its edges, or an unscheduled row) SHALL record one step named "Rescheduled" and SHALL show the Undo toast, as a drop on a calendar day does. Undoing a step SHALL restore the dates the task had before it, and redoing it SHALL apply them again. A move to the dates a task already has SHALL record nothing. A date given to a task parked in Someday SHALL take it out of Someday in the same step. A repeating task SHALL be written as before, carried to its series, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo arrow presses in the month
- **WHEN** a person selects a task on 26 November in the month, presses Down, and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is on 26 November again, at the same time, and Redo moves it to 3 December

#### Scenario: Each press is a step
- **WHEN** a person moves a timeline bar three days with three presses of the Right arrow
- **THEN** three steps are added, and each Undo moves it back one day

#### Scenario: A timeline drag
- **WHEN** a person drags a timeline bar's right edge to set a deadline
- **THEN** the Undo toast offers to take it back, and Undo removes the deadline

#### Scenario: A repeating task
- **WHEN** a person moves a weekly task a day with the keyboard
- **THEN** the series moves as before and no step is added
