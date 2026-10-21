## MODIFIED Requirements

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before.

#### Scenario: Fix a typo in place
- **WHEN** the panel is closed and the user clicks inside the title "Renew pasport" between "pas" and "port", types `s` and presses Enter
- **THEN** the title is "Renew passport", no panel opened, and the row stays selected

#### Scenario: Cancel
- **WHEN** the user is editing a title inline and presses Esc
- **THEN** the title is unchanged, the editor closes and the row is still selected

#### Scenario: Keyboard start
- **WHEN** a row is selected with `j` and the user presses `F2`
- **THEN** the row's title becomes editable with the caret at the end

#### Scenario: Open the details from the editor
- **WHEN** the user is editing inline and presses `Shift+Enter`
- **THEN** the title is saved and the task panel opens on that task

#### Scenario: Panel open means switch
- **WHEN** the panel shows one task and the user clicks another task's title
- **THEN** the panel shows the clicked task and no inline editor opens

#### Scenario: Phone
- **WHEN** the user taps a task's title on a 390 px wide touch screen
- **THEN** the task opens in the panel sheet as before

#### Scenario: Preference to open details
- **WHEN** the user sets "Click a task to" to "Open details" on this device and clicks a title
- **THEN** the panel opens, and on another device the default is still "Edit in place"

#### Scenario: Selecting text does not drag
- **WHEN** the user is editing a title inline in a manually ordered list and drags across the words in its field
- **THEN** the words are selected, the row does not move, and every other row can still be dragged
