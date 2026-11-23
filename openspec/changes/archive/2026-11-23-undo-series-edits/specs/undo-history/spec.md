## ADDED Requirements

### Requirement: Repeating tasks' edits are steps
An edit of a repeating task that applies to all its occurrences (the default when the task panel's scope is not chosen) SHALL record one step in the undo history, named as the same edit of a plain task, and SHALL show the Undo toast where that edit does. The step SHALL hold the series and the open occurrence records the edit carries to (those still holding the previous value); Undo SHALL restore their previous values and SHALL leave every other record, done, skipped or changed, as it is. Changing a repeating task's rule or stopping it, in the task panel's repeat field or its presets, SHALL record one step named "Task updated", whose Undo restores the previous rule and leaves the records the old rule made as they are. An edit under This and following, which splits the series, SHALL NOT record a step and SHALL have no Undo; an edit under Also past ones SHALL record its own step as before ("Changed past occurrences too"). The change SHALL be written locally first, offline too, as ordinary ops that converge through sync; a field another device changed since SHALL be left as it is by Undo.

#### Scenario: Undo a rename of a repeating task
- **WHEN** a person renames the daily task "Water" to "Water the plants" while one of its days is moved to the evening, and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task and that moved day are called "Water" again

#### Scenario: Undo a rule change
- **WHEN** a person changes a daily task to repeat weekly and then undoes it
- **THEN** it repeats daily again and its done days are as they were

#### Scenario: This and following
- **WHEN** a person renames a repeating task with This and following chosen
- **THEN** the series is split as before and no step is added

## MODIFIED Requirements

### Requirement: Changing an estimate is a step
Setting or removing one task's estimate (the task panel's Estimate field or its remove button, or a calendar block's lower edge) SHALL record one step in the undo history, named "Estimate {minutes} min" or "Estimate removed". The calendar edit SHALL also offer the Undo toast, like the block's other edits; the task panel SHALL NOT show one. Undoing it SHALL restore the previous estimate and redoing it SHALL apply it again. Setting the estimate a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo an estimate typed by mistake
- **WHEN** a person types 90 in the Estimate field of a task estimated at 30 minutes and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the estimate is 30 minutes again

#### Scenario: Calendar resize
- **WHEN** a person drags the lower edge of a one-hour block in the week to make it 90 minutes
- **THEN** the toast offers Undo, and undoing it gives the block its hour back

#### Scenario: A repeating task
- **WHEN** a person sets the estimate of a weekly task
- **THEN** the series gets that estimate as before, and one step is added that Undo takes back

### Requirement: Setting a priority is a step
Setting one task's priority (a list's or the task panel's priority keys, the row menus and the row edit bar, the task panel's priority, the command palette, Vim) SHALL record one step in the undo history, named like the bulk action for one task (for example "Priority 1 set on 1 task"), without showing an undo toast. Undoing it SHALL restore the previous priority and redoing it SHALL set it again. Setting the priority a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a wrong key
- **WHEN** a person selects "Pay rent" at priority 3 in a list, presses 1, then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Pay rent" is back at priority 3

#### Scenario: Same priority again
- **WHEN** a person sets priority 2 on a task that already has priority 2
- **THEN** no step is added to the undo history

#### Scenario: A repeating task
- **WHEN** a person sets priority 1 on a task that repeats every week
- **THEN** the series gets priority 1 as before, and one step is added that Undo takes back

### Requirement: Changing a deadline is a step
Setting or removing one task's deadline in the task panel's When editor SHALL record one step in the undo history and offer the Undo toast, like the due date beside it, named "Deadline {date}" or "Deadline removed". Undoing it SHALL restore the previous deadline, and the task's deadline reminders SHALL follow the restored deadline; redoing it SHALL apply it again. Setting the deadline a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a deadline picked by mistake
- **WHEN** a person changes a task's deadline from 15 April to 30 April in the When editor and activates Undo on the toast
- **THEN** the deadline is 15 April again, and a deadline reminder fires for 15 April

#### Scenario: Remove and undo
- **WHEN** a person removes a task's deadline and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the deadline is back

#### Scenario: A repeating task
- **WHEN** a person sets a deadline on a monthly task
- **THEN** the series gets it as before, and one step is added that Undo takes back

### Requirement: Changing an assignee is a step
Assigning one task to a member, to the person or to nobody in the task panel or with the list's Assign picker SHALL record one step in the undo history and offer the Undo toast, named "Assigned to {name}", "Assigned to you" or "Unassigned". Undoing it SHALL restore the previous assignee; redoing it SHALL apply it again. Assigning the person a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a member picked by mistake
- **WHEN** a person assigns a task to Ana instead of Ben and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is assigned to Ben again

#### Scenario: Unassign and undo
- **WHEN** a person removes a task's assignee and then undoes it from the history
- **THEN** the task has its assignee back

#### Scenario: A repeating task
- **WHEN** a person assigns a weekly task
- **THEN** the series gets the assignee as before, and one step is added that Undo takes back

### Requirement: This Evening is a step
Marking one task for This Evening or taking it out (a list's This Evening key, the task panel's This Evening, the command palette) SHALL record one step in the undo history, named with the day-part words (for example "Moved to This Evening"), without showing an undo toast. Undoing it SHALL restore the task's previous part of the day and redoing it SHALL apply it again. A task already in that state SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo This Evening
- **WHEN** a person presses the This Evening key on "Call mum" in Today and then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Call mum" is no longer marked for This Evening

#### Scenario: Already there
- **WHEN** a person marks a task for This Evening that is already marked
- **THEN** no step is added to the undo history

#### Scenario: A repeating task
- **WHEN** a person marks a daily task for This Evening
- **THEN** the series is marked as before, and one step is added that Undo takes back

### Requirement: Renaming a task is a step
Changing only one task's title (the list's inline editor, the task panel's title or Triage) SHALL record one step in the undo history, named "Renamed “{old title}” → “{new title}”". It SHALL NOT show the Undo toast, like the panel's other single edits; a title edit that also sets attributes keeps its own step and toast. Undoing it SHALL restore the previous title and redoing it SHALL apply the new one again. Committing the title a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a rename
- **WHEN** a person renames "Milk" to "Oat milk" in the list and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is called "Milk" again, and Redo calls it "Oat milk"

#### Scenario: The same title
- **WHEN** a person opens a task's title and leaves it unchanged
- **THEN** no step is added

#### Scenario: A repeating task
- **WHEN** a person renames a weekly task
- **THEN** the series gets the new title as before, and one step is added that Undo takes back

### Requirement: A calendar move from the keyboard or in the timeline is a step
Moving one task's dates with the keyboard in Month, Plan, Day or Week (including a span's ends), or with the timeline's keys, SHALL record one step in the undo history per key press, named "Rescheduled" (a Day or Week length key that changes only the estimate is named "Estimate {minutes} min", as the task panel's estimate step), and SHALL NOT show the Undo toast. A drag in the timeline (a bar, one of its edges, or an unscheduled row) SHALL record one step named "Rescheduled" and SHALL show the Undo toast, as a drop on a calendar day does. Undoing a step SHALL restore the dates the task had before it, and redoing it SHALL apply them again. A move to the dates a task already has SHALL record nothing. A date given to a task parked in Someday SHALL take it out of Someday in the same step. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

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
- **THEN** the series moves as before, and one step is added that Undo takes back

### Requirement: The Schedule sheet and Park in Someday are steps
Choosing Today, Tomorrow, Next week or a picked day in the phone's Schedule sheet (from a left swipe on a row or Schedule… in the touch menu) SHALL record one step in the undo history named "Rescheduled" and SHALL show the Undo toast; a task parked in Someday SHALL come back in the same step. Choosing Someday in that sheet, the command palette's "Park … in Someday", and the park key in every list (task lists, saved views, the Daily check, the reviews and the method lists) SHALL record one step named "Moved to Someday" and SHALL show the Undo toast. Undoing a step SHALL restore the task's previous date, start and This Evening, and redoing it SHALL apply the change again. A repeating task's new date SHALL follow "Repeating tasks' edits are steps"; parking a repeating task SHALL end its repetition as before, without a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a swipe to Tomorrow
- **WHEN** a person swipes a task without a date left on a phone, chooses Tomorrow, and then chooses Undo on the toast
- **THEN** the task has no date again

#### Scenario: Park from the palette
- **WHEN** a person parks a task in Someday from the command palette and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is back in its list with its date

#### Scenario: A repeating task
- **WHEN** a person parks a weekly task in Someday
- **THEN** it is parked and stops repeating, as before, and no step is added

### Requirement: The panel's Start date, Multi-day switch and time zone are steps
Setting or clearing one task's start date in the task panel, turning its Multi-day switch on or off, and fixing its time to a time zone or releasing it SHALL each record one step in the undo history named "Rescheduled", and SHALL NOT show the Undo toast, like the panel's other single edits. Undoing the step SHALL restore the values the task had before it, and redoing it SHALL apply them again. A change to the values a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a start date
- **WHEN** a person gives a task without a start the start date 16 October in the task panel and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task has no start date again

#### Scenario: Undo releasing a zone
- **WHEN** a person releases a 09:00 meeting fixed to Berlin and then undoes it
- **THEN** the meeting is fixed to Berlin again

#### Scenario: A repeating task
- **WHEN** a person gives a weekly task a start date
- **THEN** the series gets it as before, and one step is added that Undo takes back

### Requirement: A task's location and Remove origin are steps
Setting or clearing one task's location SHALL record one step in the undo history, named "Location removed" when the location is cleared and "Task updated" when one is set. Removing a task's origin from the task actions menu SHALL record one step named "Task updated". Neither SHALL show the Undo toast, like the panel's other single edits. Undoing the step SHALL restore the previous value, and redoing it SHALL apply the change again. Setting the value a task already has SHALL record nothing. A repeating task SHALL follow "Repeating tasks' edits are steps". The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo clearing a location
- **WHEN** a person removes "Post office" from a task's location and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is at the post office again

#### Scenario: Undo Remove origin
- **WHEN** a person chooses Remove origin on a task saved from an article and then undoes it
- **THEN** the task links to the article again

#### Scenario: A repeating task
- **WHEN** a person gives a weekly task a location
- **THEN** the series gets it as before, and one step is added that Undo takes back

