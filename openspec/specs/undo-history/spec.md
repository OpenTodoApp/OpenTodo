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
