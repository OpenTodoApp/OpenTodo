# undo-history Specification

## Purpose
Multi-step undo and redo on the client, free of the undo toast's deadline: the device's local log of the last 20 action batches (each with its inverse and the field clock every change got) is walked as real undo and redo stacks, reached by keyboard and from the command palette, with named steps, field-level skip when something changed again, and descriptive feedback.

## Requirements

### Requirement: Undo and redo stacks free of the toast
The client SHALL keep a local undo stack and redo stack over its stored action batches (the last 20, as today), so a person can undo recorded actions in reverse order and redo them in original order regardless of whether the undo toast has expired, been dismissed, or the view has changed. A bulk action SHALL remain one step. Undo SHALL act on the most recent not-yet-undone batch; redo SHALL act on the most recently undone batch. Recording a new action SHALL clear the redo stack. The stacks SHALL survive reloads and SHALL be cleared on sign-out. History SHALL be this device's own and SHALL NOT include other devices' or other users' actions.

#### Scenario: Undo walks back past the toast
- **WHEN** a person completes a task, renames another, and the undo toast for the rename has gone, then presses undo twice
- **THEN** the rename is undone first and the completion second, each as its own step

#### Scenario: Redo in original order
- **WHEN** the person then presses redo twice
- **THEN** the completion is redone first and the rename second, back to where they started

#### Scenario: A new action clears redo
- **WHEN** the person undoes an action and then records a new one
- **THEN** redo is no longer available and the undone action is not reachable forward

#### Scenario: Cleared on sign-out
- **WHEN** the person signs out and back in
- **THEN** the undo and redo stacks are empty

### Requirement: Undo and redo shortcuts and controls
Ctrl/Cmd-Z SHALL undo and Ctrl/Cmd-Shift-Z SHALL redo whenever that direction has history, and Ctrl-Y SHALL also redo on Windows and Linux. These SHALL NOT fire while focus is in a text field, text area, editable area, or an editor that owns its own undo and redo, where the platform's text undo SHALL stand instead. The client SHALL also offer Undo and Redo as commands in the command palette — which is reachable on desktop (the shortcut) and on a phone (the tab bar's Search), so a person can still undo after the toast is gone — each offered while that direction has history and naming the next step and its task or count, for example "Undo: complete 'Pay rent'" or "Undo: 3 tasks completed". The undo toast's button SHALL use the same history.

#### Scenario: Shortcut leaves text editing alone
- **WHEN** the person is typing in a task's title field and presses Ctrl/Cmd-Z
- **THEN** the field's own text is undone and no task action is undone

#### Scenario: A command names the next step
- **WHEN** the most recent action completed the task "Pay rent" and nothing is being edited
- **THEN** the command palette offers "Undo: complete 'Pay rent'", and with nothing left to undo it offers no Undo command

### Requirement: Descriptive feedback without a deadline
After an undo or redo the client SHALL show a descriptive message of what it did, for example "Undid completion of 'Pay rent'", and SHALL name anything it skipped, without starting a new timed deadline for further action.

#### Scenario: Feedback after an undo
- **WHEN** the person undoes the completion of "Pay rent"
- **THEN** a message says the completion was undone, and it does not impose a new countdown

### Requirement: Conflict checks across undo and redo
Undo SHALL skip a field that was changed again after the batch, detected by the field's clock no longer matching the batch's, and SHALL name the affected item as skipped; it SHALL still undo the fields that were not changed again. Redo SHALL apply the equivalent check against the values the undo overwrote and SHALL replay only the fields that were actually undone. After undo rewrites a field, the client SHALL update its bookkeeping so that undoing an earlier batch that also changed that field is still permitted. Undoing the creation of an item SHALL move it to the Trash, without field-level checks.

#### Scenario: A field changed since is skipped
- **WHEN** a batch set a task's due date and priority, the due date was then changed again by hand, and the person undoes the batch
- **THEN** the priority is restored, the due date keeps its newer value, and the task is named as skipped

#### Scenario: Undo our later change, then the earlier one
- **WHEN** two recorded batches each changed the same task's priority, and the person undoes the later batch and then the earlier batch
- **THEN** the later change is undone first and the earlier change is undone next, neither wrongly skipped as changed-since

#### Scenario: Undoing a creation trashes it
- **WHEN** the person creates a task and then undoes that action
- **THEN** the task moves to the Trash and can be restored, with no field-level conflict check

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

### Requirement: Changing an assignee is a step
Assigning one task to a member, to the person or to nobody in the task panel or with the list's Assign picker SHALL record one step in the undo history and offer the Undo toast, named "Assigned to {name}", "Assigned to you" or "Unassigned". Undoing it SHALL restore the previous assignee; redoing it SHALL apply it again. Assigning the person a task already has SHALL record nothing. A repeating task's assignee SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a member picked by mistake
- **WHEN** a person assigns a task to Ana instead of Ben and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is assigned to Ben again

#### Scenario: Unassign and undo
- **WHEN** a person removes a task's assignee and then undoes it from the history
- **THEN** the task has its assignee back

#### Scenario: A repeating task
- **WHEN** a person assigns a weekly task
- **THEN** the series gets the assignee as before and no step is added

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

### Requirement: Renaming a task is a step
Changing only one task's title (the list's inline editor, the task panel's title or Triage) SHALL record one step in the undo history, named "Renamed “{old title}” → “{new title}”". It SHALL NOT show the Undo toast, like the panel's other single edits; a title edit that also sets attributes keeps its own step and toast. Undoing it SHALL restore the previous title and redoing it SHALL apply the new one again. Committing the title a task already has SHALL record nothing. A repeating task's title SHALL be written as before, carried to its series and following the task panel's scope, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a rename
- **WHEN** a person renames "Milk" to "Oat milk" in the list and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is called "Milk" again, and Redo calls it "Oat milk"

#### Scenario: The same title
- **WHEN** a person opens a task's title and leaves it unchanged
- **THEN** no step is added

#### Scenario: A repeating task
- **WHEN** a person renames a weekly task
- **THEN** the series gets the new title as before and no step is added

### Requirement: A calendar move from the keyboard or in the timeline is a step
Moving one task's dates with the keyboard in Month, Plan, Day or Week (including a span's ends), or with the timeline's keys, SHALL record one step in the undo history per key press, named "Rescheduled" (a Day or Week length key that changes only the estimate is named "Estimate {minutes} min", as the task panel's estimate step), and SHALL NOT show the Undo toast. A drag in the timeline (a bar, one of its edges, or an unscheduled row) SHALL record one step named "Rescheduled" and SHALL show the Undo toast, as a drop on a calendar day does. Undoing a step SHALL restore the dates the task had before it, and redoing it SHALL apply them again. A move to the dates a task already has SHALL record nothing. A date given to a task parked in Someday SHALL take it out of Someday in the same step. A repeating task SHALL be written as before, carried to its series, and SHALL NOT record a step. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

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

### Requirement: Moving an Inbox task to another workspace is a step
Moving one task without a project to another workspace's Inbox, from the command palette's "Move to workspace" command or from the "Move to …" action of the toast shown after quick add, SHALL record one step in the undo history named "Moved to {workspace}" and SHALL show the Undo toast, as the task panel's move does. The toast SHALL offer the move only while the task has no project and no parent. Undoing it SHALL bring the task back to the workspace it was in, and redoing it SHALL move it again. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a palette move
- **WHEN** a person moves an Inbox task of Work to Personal with the command palette and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is in Work's Inbox again

#### Scenario: The toast after quick add
- **WHEN** a person adds a task with quick add, chooses "Move to Personal" on the toast, and then chooses Undo
- **THEN** the task is back in the workspace it was added to

#### Scenario: A task with a project
- **WHEN** a person adds a task with quick add into a project
- **THEN** the toast offers no move to another workspace

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
