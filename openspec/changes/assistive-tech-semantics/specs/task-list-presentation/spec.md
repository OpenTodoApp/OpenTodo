## ADDED Requirements

### Requirement: Lists for assistive technology

The keyboard cursor of a task list SHALL be real focus: when the cursor moves to a row, that row's open control SHALL take focus, unless focus is outside the list (the task panel, a dialog, the quick add, a text field, the sidebar), which keeps focus. The cursor row SHALL be marked as current. Rows of the project and Inbox trees SHALL expose their level and their position among their visible siblings. Each row's complete control SHALL be named after its task ("Complete Buy milk", "Reopen Buy milk"), and a title that cannot be decrypted SHALL NOT be read out as ciphertext. Cursor moves SHALL still re-render only the row left and the row reached. This is presentation only and behaves the same offline.

#### Scenario: Moving the cursor

- **WHEN** a list is shown and the user presses `j`
- **THEN** focus is on the first row's open control and the row is marked as current

#### Scenario: Focus stays in the panel

- **WHEN** focus is in the task panel and the cursor moves
- **THEN** focus stays in the panel

#### Scenario: Subtasks

- **WHEN** a project shows a task with two subtasks
- **THEN** the subtask rows are level 2 and positions 1 and 2 of 2

#### Scenario: Complete button

- **WHEN** a row shows the task "Pack"
- **THEN** its complete button is named "Complete Pack"
