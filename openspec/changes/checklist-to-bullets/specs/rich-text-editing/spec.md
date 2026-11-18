## ADDED Requirements

### Requirement: A checklist becomes a bullet list again
Bullet list (the formatting row, the `/` menu and `Ctrl+Shift+8`) run with the caret or the selection in a checklist SHALL remove the checkbox of every item of that list, checked or not, and keep each item's text, its order and its nested lists. Outside a checklist it SHALL wrap the selection in a bullet list as before.

#### Scenario: Back to bullets
- **WHEN** a note holds the checklist "buy milk" (checked) and "bread", and the user taps Bullet list with the caret in "buy milk"
- **THEN** the note reads `- buy milk` and `- bread`

#### Scenario: A plain line
- **WHEN** the caret is in the paragraph "eggs" and the user taps Bullet list
- **THEN** the note reads `- eggs`
