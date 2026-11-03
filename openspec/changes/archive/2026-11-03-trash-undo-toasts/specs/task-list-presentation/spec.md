## MODIFIED Requirements

### Requirement: Single-action undo
Deleting a task from any surface, moving it to another project, changing its date or parking it SHALL offer the same Undo toast as bulk actions, replacing the previous offer. Every delete path SHALL write through the same undoable trash, whether it comes from the row menu, the command palette, Vim's `dd`, the Filter view or a saved view, so all of them restore the task and its subtasks the same way.

#### Scenario: Delete then undo
- **WHEN** the user deletes a task from its row menu and activates Undo
- **THEN** the task returns to its place with its subtasks and no tombstone remains after sync

#### Scenario: Delete from the command palette
- **WHEN** the user runs "Move Write the report to the Trash" in the command palette
- **THEN** the task goes to the Trash and the toast offers Undo, exactly as its row menu does

#### Scenario: Delete with Vim
- **WHEN** the user selects one task and presses `dd` with Vim keybindings on
- **THEN** the task goes to the Trash and the toast offers Undo

#### Scenario: Delete from a Filter or saved view
- **WHEN** the user presses Delete on a row of the Filter view or a saved view
- **THEN** the task goes to the Trash and the toast offers Undo
