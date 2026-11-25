## ADDED Requirements

### Requirement: Keys in a text field wait for the input method
While an input method is composing in a text field of the web app, Enter, Escape, Tab, the arrow keys, Home and End SHALL belong to the input method: neither the field nor anything around it SHALL save, cancel, close, pick or move focus or a highlight on them. Once composition has ended they SHALL act as already specified. This SHALL hold in every interface language and offline, and it SHALL store nothing of its own.

#### Scenario: Renaming while composing
- **WHEN** an input method is composing in a project or section name being renamed and the user presses Enter or Escape
- **THEN** the name is neither saved nor discarded, the field stays open with what was being composed, and Escape after composition still discards the rename

#### Scenario: A suggestion list while composing
- **WHEN** an input method is composing in a picker's search field and the user presses ↓ or Enter
- **THEN** the highlight does not move and nothing is picked, and Enter after composition picks the highlighted option

#### Scenario: A form or panel around the field
- **WHEN** an input method is composing in a field inside a form, editor or panel that closes on Escape or applies on Enter, and the user presses one of them
- **THEN** the form, editor or panel stays open and nothing is applied, and the same key after composition acts as before

#### Scenario: A composing key reported as key code 229
- **WHEN** the browser reports a composing Escape as key code 229 without marking it as composing
- **THEN** it counts as composing: no overlay closes, no shortcut runs and the field keeps its text

#### Scenario: The inline title editor while composing
- **WHEN** an input method is composing in a task's inline title editor and the user presses Escape or Shift+Enter
- **THEN** the editor stays open, the title is not changed and no task page opens
