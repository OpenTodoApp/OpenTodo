# Spec Delta

## ADDED Requirements

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before.

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

### Requirement: Contextual edit bar
While a row is edited inline, a bar SHALL show under its title with Date, Priority, Labels and Project, each showing the task's value or a muted placeholder, and an Open details control. Each control SHALL open the same editor the task panel uses for that property and write the same change. Tab SHALL move from the title into the bar, and the bar's popovers SHALL not count as clicks outside the row.

#### Scenario: Make it tomorrow without the panel
- **WHEN** the user is editing "Call the bank" inline, chooses Date and then Tomorrow
- **THEN** the task is due tomorrow, the bar's Date reads "Tomorrow", the inline editor is still open, and no panel opened

#### Scenario: Labels from the bar
- **WHEN** the user opens Labels from the bar and ticks "errand"
- **THEN** the task gains the label "errand" and the editor stays open until the user saves or clicks away

#### Scenario: Details
- **WHEN** the user activates Open details in the bar
- **THEN** the title is saved and the panel opens on the task

### Requirement: Clearing the selection
A click on any empty part of the content column (between or below the rows, the page margins, the empty part of the page header) SHALL save an open inline edit, clear the selection and close the task panel. Clicks inside the panel, inside a popover, menu or dialog, or on a control SHALL NOT clear it. Esc SHALL keep closing the panel first and then clearing the selection.

#### Scenario: Click below the list
- **WHEN** a task is selected with the panel open and the user clicks the empty space below the last row
- **THEN** no row is selected, the panel is closed, and the list has its full width

#### Scenario: Click inside the panel
- **WHEN** a task is selected with the panel open and the user clicks the panel's notes
- **THEN** the task stays selected and the panel stays open

#### Scenario: Inline edit is saved
- **WHEN** the user has typed a new title inline and clicks the page margin
- **THEN** the new title is saved and no row is selected

### Requirement: Selected row indicator
The selected row SHALL be marked by an accent bar at its leading edge and a faint accent tint, with no border or ring around the row and no full-strength background. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar and tint, the hovered row only the hover background, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background
