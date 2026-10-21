## MODIFIED Requirements

### Requirement: Task panel comment composer
The comment composer SHALL be pinned to the bottom of the panel while Comments is shown, resting as a single line that expands to the full composer (the rich-text editor, attach, submit, the submit key hint) when focused, when it holds a draft or a reply target, or when `Shift+C` is pressed; `Shift+C` SHALL switch to Comments and focus the composer. The editor's own keys SHALL apply only while the composer has focus and SHALL never fire a page shortcut.

#### Scenario: Shortcut to the composer
- **WHEN** the History tab is open and the user presses `Shift+C` outside a text field
- **THEN** the Comments tab is shown, the composer is expanded with the editor and has focus

#### Scenario: Composer without scrolling
- **WHEN** a task with thirty comments is opened
- **THEN** the composer line is visible at the bottom of the panel before the user scrolls

#### Scenario: At rest
- **WHEN** a task without a draft is opened and nothing is focused
- **THEN** the composer is one line reading "Write a comment…" with no buttons under it, and the Comments list has the space the full composer used

#### Scenario: Editor keys stay in the editor
- **WHEN** the composer has focus and the user presses `c` or `1`
- **THEN** the character is typed into the comment and the task is neither completed nor reprioritised
