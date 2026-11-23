## ADDED Requirements

### Requirement: The formatting row shows what is on
The formatting row's Bold, Italic, Link, Bullet list and Checklist controls SHALL show as pressed, and SHALL report it to assistive technology (`aria-pressed`), while their formatting applies at the selection: a mark when every selected character carries it, or, with nothing selected, when it is stored at the caret or carried by the text there; Bullet list when the caret's nearest list item is a bullet list's item without a checkbox, Checklist when it has one. The row SHALL read this again after every change of the editor, including a moved caret.

#### Scenario: The caret in bold text
- **WHEN** the row is shown and the caret moves from plain text into bold text
- **THEN** Bold shows as pressed, and no longer does when the caret moves back

#### Scenario: A checklist
- **WHEN** the caret is in an item with a checkbox
- **THEN** Checklist shows as pressed and Bullet list does not
