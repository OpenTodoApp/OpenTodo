## ADDED Requirements

### Requirement: Outline of a note
A task note, project note or standalone note with 3 or more top-level headings SHALL show its outline: the headings of levels 1 to 3 in document order, indented by level, with the heading currently at the top of the reading area marked and announced as the current location. Choosing a heading SHALL scroll the note to it and, in a note the user may edit, put the caret at its start. When the note's column is at least 52 rem wide the outline SHALL be a column beside the note that stays in view while the note scrolls, inside the existing scroller and never as a scroll region of its own; otherwise, and always in the docked task panel and in project notes, it SHALL be an **Outline** button in the note's top corner opening a menu of the headings. Notes with fewer than 3 headings SHALL show neither. The outline SHALL follow local and remote edits at once, SHALL work offline and on encrypted accounts from the local, decrypted document, and SHALL not be stored or synced, so offline behaviour and convergence of notes are unchanged.

#### Scenario: Jump to a section
- **WHEN** a standalone note on a 1440 px screen has the headings "Flights", "Hotels" and "Days" and the user chooses "Days" in the outline column
- **THEN** the note scrolls so that "Days" is at the top, the caret is at its start, and "Days" is marked as current

#### Scenario: Docked panel
- **WHEN** a task note in the docked panel has four headings
- **THEN** the note shows an Outline button, and its menu lists the four headings

#### Scenario: Short note
- **WHEN** a note has two headings
- **THEN** no outline column and no Outline button are shown

#### Scenario: Remote heading
- **WHEN** another device adds a heading "Budget" to a note open on this device with an outline, and this device syncs
- **THEN** "Budget" appears in the outline at its place without a reload

#### Scenario: Read-only
- **WHEN** a viewer of a shared project chooses a heading in a project note's outline
- **THEN** the note scrolls to the heading and focus moves to it, and the note stays read-only

### Requirement: Outline from the keyboard
While a note with an outline has focus, `Ctrl+Shift+O` (`⌘+Shift+O` on a Mac) SHALL move focus to the outline column or open the outline menu; ↑ and ↓ SHALL move between headings, Home and End to the first and last, Enter SHALL go to the focused heading and Esc SHALL return focus to the note where it was. The shortcut SHALL be registered in the keyboard registry's editing section without a conflict and listed in the cheat sheet.

#### Scenario: Keyboard only
- **WHEN** the user presses `Ctrl+Shift+O` in a note with five headings, presses ↓ twice and Enter
- **THEN** the note scrolls to the third heading with the caret at its start

#### Scenario: Esc returns
- **WHEN** the user opens the outline with the keyboard and presses Esc
- **THEN** focus is back in the note at the same caret position
