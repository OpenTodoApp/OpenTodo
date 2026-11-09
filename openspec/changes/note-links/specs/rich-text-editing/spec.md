## MODIFIED Requirements

### Requirement: Slash command menu
Typing `/` at the start of a line or after a space in the editor SHALL open a menu of commands (heading 1 to 3, bullet list, numbered list, checklist, table, quote, code block, link, image, date, mention, in notes Link to… (a note, task or project, see `note-links`), and in task notes Make subtask) filtered by the letters typed after the slash. Arrow keys SHALL move, Enter SHALL apply the command and remove the typed `/` text, Escape SHALL close the menu and keep the text, and the menu SHALL close when no command matches. The menu SHALL be announced as a listbox and SHALL fit a 360 px screen.

#### Scenario: Insert a table by keyboard
- **WHEN** the user types `/tab` and presses Enter
- **THEN** a two-column, two-row table with a header row is inserted at the caret, the `/tab` text is gone and the caret is in the first header cell

#### Scenario: No match
- **WHEN** the user types `/zzz`
- **THEN** the menu is closed and the text `/zzz` stays in the note

#### Scenario: Date
- **WHEN** the user types `/date`, chooses Date and presses Enter
- **THEN** today's date in the user's date format is inserted as text

#### Scenario: Link to a note
- **WHEN** the user types `/link to` in a standalone note and presses Enter
- **THEN** the `/link to` text is gone and the picker of notes, tasks and projects is open at the caret

#### Scenario: Not in comments
- **WHEN** the user opens the `/` menu in the comment composer
- **THEN** it offers no Link to… entry
