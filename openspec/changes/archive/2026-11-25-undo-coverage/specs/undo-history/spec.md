## ADDED Requirements

### Requirement: Ticking a task is a step everywhere
Completing or reopening one task with its checkbox or the complete key SHALL record one step in the undo history and show the Undo toast, as in the main list, in every list that offers it: task lists, the Filter view, saved views, the dashboard, the weekly review, the Daily check, the monthly look and the method lists. The step SHALL be named "Task completed" or "Task reopened". Undoing it SHALL reopen the task (or, for a repeating task, put the series back on the completed occurrence) and redoing it SHALL complete it again. Completing a task whose time entry runs SHALL end that entry in the same step, and Undo SHALL let it run again, unless the person runs another entry by then: it SHALL then stay closed at the completion, so one entry runs per person. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a tick in a saved view
- **WHEN** a person ticks "Pay rent" in a saved view and then chooses Undo on the toast
- **THEN** "Pay rent" is open again

#### Scenario: A tick in the Daily check
- **WHEN** a person ticks a task in the Daily check and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is open again

#### Scenario: Completing stops tracking
- **WHEN** a person completes from the dashboard the task whose entry has run for 12 minutes
- **THEN** the entry closes with 12 minutes in the same step, and undoing it reopens the task with its entry running

#### Scenario: Another timer started since
- **WHEN** a person completes a task whose entry runs, starts tracking another task, and then undoes the completion
- **THEN** the task is open again, its entry stays closed at the completion, and only the other entry runs

### Requirement: Moving one row is a step
Dragging one row among the rows of a project, the Inbox or a task's subtasks SHALL record one step named "1 task moved", as a drag of several ticked rows does. Moving one row with the keyboard (Alt and the arrows, the row menu's Move items, Vim's moves, the task panel's subtask handles) SHALL record one step per move named "Order changed", as a view's own order does. Dropping a row on a section heading, moving a task to another board column (by drag or Shift and an arrow) or choosing another section in the task panel SHALL record one step named "Moved to {section}"; choosing the section it already has SHALL record nothing. Each SHALL show the Undo toast. Undoing a step SHALL put the task back at its previous place, parent and section, and redoing it SHALL move it again. A move that changes nothing, or that is refused (a viewer, a completed task, the edge of the list), SHALL record nothing. The change SHALL be written locally first, offline too, as one batch of ordinary ops that converges through sync.

#### Scenario: Undo a drag
- **WHEN** a person drags "Hotel" above "Flights" in a project and then chooses Undo on the toast
- **THEN** "Hotel" is below "Flights" again

#### Scenario: Undo a board column move
- **WHEN** a person moves a card from To do to Doing with Shift and the Right arrow and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the card is in To do again, where it was

#### Scenario: The edge of the list
- **WHEN** a person presses Alt and the Up arrow on the first task of a list
- **THEN** nothing moves and no step is added

### Requirement: Deleting a section, a label or a custom field is a step
Deleting a section (which takes its open tasks out of it), deleting a label (which takes it off every task), merging a label into another (which gives its tasks the other label) and deleting a custom field (whose values stay in the tasks, hidden) SHALL each be written as one batch, after the same confirmation as before, and SHALL record one step named "Section deleted", "Label deleted", "Merged into {label}" or "Field deleted", with the Undo toast. Undoing the step SHALL bring the section, label or field back and restore what the batch changed on each task: its section, its labels, or its field's values shown again. Redoing it SHALL delete or merge again. A task changed again since SHALL keep its newer value and be named as skipped. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo deleting a section
- **WHEN** a person deletes the section "Kitchen" holding two open tasks and chooses Undo on the toast
- **THEN** "Kitchen" is back with both tasks in it

#### Scenario: Undo a label merge
- **WHEN** a person merges "phone" into "call" and then undoes it from the command palette
- **THEN** "phone" is back on the tasks that carried it, and a task that carried both labels has both again

#### Scenario: Undo deleting a custom field
- **WHEN** a person deletes the field "Cost" and then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Cost" is back in the project with every task's value
