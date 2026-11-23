## ADDED Requirements

### Requirement: Indent, outdent and the Parent task field are steps
Making one task a subtask of another, or a top-level task, with Tab or Shift-Tab in a list or with the task panel's Parent task field, SHALL record one step in the undo history, named "Subtask of “{task}”" with the new parent's title, or "Task updated" when the task becomes top-level. It SHALL NOT show the Undo toast, like the panel's other single edits. Undoing the step SHALL put the task back under its previous parent at its previous place, and redoing it SHALL apply the change again. Choosing the parent a task already has SHALL record nothing; a parent that is the task, one of its subtasks or in another project SHALL be refused as before and SHALL record nothing. A repeating task SHALL record its step too, since its parent is not carried to its series. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo an indent
- **WHEN** a person selects "Book the hotel" below "Book flights" in a project, presses Tab, and then presses Ctrl/Cmd-Z with no field focused
- **THEN** "Book the hotel" is a top-level task again, where it was

#### Scenario: Undo clearing the Parent task
- **WHEN** a person clears a subtask's Parent task in the task panel and then undoes it
- **THEN** the task is a subtask of its parent again
