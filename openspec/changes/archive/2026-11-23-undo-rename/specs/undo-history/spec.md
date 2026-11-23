## ADDED Requirements

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
