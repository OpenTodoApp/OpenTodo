## ADDED Requirements

### Requirement: Keys in a text field wait for the input method
While an input method is composing in a text field of the web app (an input, a textarea or an editable region, including a suggestion list or picker that reads its keys), Enter, Escape, Tab, the arrow keys, Home and End SHALL belong to the input method: the field SHALL NOT save, cancel, close, pick a suggestion or move focus or a highlight on them. A key whose event reports composition, or key code 229, counts as pressed while composing. Once composition has ended the same keys SHALL act as the field already specifies. This SHALL hold in every interface language and offline, and it SHALL store nothing of its own.

#### Scenario: Renaming while composing
- **WHEN** an input method is composing in a project or section name being renamed and the user presses Enter or Escape
- **THEN** the name is neither saved nor discarded, the field stays open with what was being composed, and Escape after composition still discards the rename

#### Scenario: A suggestion list while composing
- **WHEN** an input method is composing in a picker's search field and the user presses ↓ or Enter
- **THEN** the highlight does not move and nothing is picked, and Enter after composition picks the highlighted option

#### Scenario: The inline title editor while composing
- **WHEN** an input method is composing in a task's inline title editor and the user presses Escape or Shift+Enter
- **THEN** the editor stays open, the title is not changed and no task page opens
