## ADDED Requirements

### Requirement: Formatting toggle on computers
On a fine pointer, every note the user may edit (task notes on the task page and in the docked panel, project notes, and every later note that uses the same editor) SHALL show a Formatting toggle at the note's top end corner, visible while the pointer is over the note or focus is within it and always while pressed, in the Tab order just before the note's text. Activating it SHALL show the formatting row above the note, at rest as well as while the note has focus, inside the panel's or page's own scroller; activating it again SHALL hide the row. Whether the row is shown SHALL be remembered on the device for notes, separately from the comment composer, and SHALL be the same in every note on that device. The toggle SHALL be a button named "Formatting" whose pressed state is announced; buttons in the row SHALL keep the note's selection and return focus to the note. Read-only notes SHALL show no toggle. Nothing about the toggle is stored in the note or synced, so offline behaviour and convergence of notes are unchanged.

#### Scenario: Bold with the mouse
- **WHEN** the user on a computer hovers a task's note, activates the Formatting toggle, selects a word in the note and activates Bold in the row
- **THEN** the word is bold, the toggle is announced as pressed, and the row stays shown above the note

#### Scenario: Remembered on the device
- **WHEN** the user turns the row on in one task's note and later opens a project's note on the same computer
- **THEN** the project note shows the row with the toggle pressed, and another computer of the same account does not

#### Scenario: Keyboard only
- **WHEN** the user presses Shift+Tab from inside a note, presses Enter on the Formatting toggle, then Tab into the row and Right twice
- **THEN** the row is shown, focus moves to the toggle, then to the row's first control and then to Link, and Escape returns focus to the note with its selection

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a task's note on a computer
- **THEN** no Formatting toggle is shown

#### Scenario: Phone unchanged
- **WHEN** the user taps into a note on a phone
- **THEN** no toggle is shown and the row appears while the note has focus, as before

### Requirement: Formatting button setting
Settings › Account › Profile › How you work SHALL have a Formatting button switch, on by default, stored as the synced additive preference `user_prefs.formatting_toggle` (`off` hides; empty or any other value shows, and is not rewritten). While it is off, the Formatting toggle SHALL not be shown in notes or in the comment composer on a fine pointer and the formatting row SHALL not be shown there, whatever the device remembered; keyboard shortcuts, Markdown input rules and the slash menu SHALL keep working, and touch screens SHALL keep their row. The preference SHALL be written offline and converge by last-writer-wins like every preference.

#### Scenario: Turned off on one device, everywhere
- **WHEN** the user turns the Formatting button off on a laptop and later opens a note on a desktop computer after sync
- **THEN** the desktop shows no Formatting toggle beside the note or in the composer

#### Scenario: Remembered row comes back
- **WHEN** the user had the row shown in notes, turns the switch off, and later turns it on again
- **THEN** the toggle is back, pressed, and the row is shown again

#### Scenario: Offline change
- **WHEN** the device is offline and the user turns the switch off
- **THEN** the toggle disappears at once, and the preference reaches the other devices on the next sync

## MODIFIED Requirements

### Requirement: Editing toolbar on touch screens
On a coarse pointer, while the editor has focus, one row of formatting controls (bold, italic, link, bullet list, checklist, and a More menu with the remaining commands) SHALL be shown above the editor inside the panel's own scroller; it SHALL not be shown at rest on a coarse pointer, it SHALL be shown on a fine pointer only through the Formatting toggle (`Formatting toggle on computers`, and the comment composer's toggle), it SHALL never be a new chrome row of any page, and every control SHALL have an accessible name. The row SHALL be a toolbar named "Formatting" that is one Tab stop, moves between its controls with the arrow keys, Home and End, and returns focus to the editor on Escape.

#### Scenario: Phone editing
- **WHEN** the user taps into the notes on a phone
- **THEN** the toolbar row appears above the notes, tapping Bold applies bold to the selection, and leaving the notes hides the row

#### Scenario: Arrow keys in the row
- **WHEN** focus is on the row's Bold control and the user presses Right, then End
- **THEN** focus moves to Italic, then to the More menu, and Tab leaves the row in one step
