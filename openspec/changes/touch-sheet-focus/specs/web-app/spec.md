# Spec Delta

## ADDED Requirements

### Requirement: A sheet keeps the on-screen keyboard down until a field is asked for
On a device without a keyboard, an overlay (a sheet, a popover, a dialog) SHALL NOT focus a text field as it opens unless typing is what the overlay is for. A device counts as without a keyboard by the definition of "Keyboard hints only where a key can be pressed": it has no fine pointer and no pointer that hovers, and the page has received no hardware key press. On such a device:

- a picker whose content is a list or a calendar (the When sheet, the label, assignee, project, section, parent task, time zone and icon pickers, the keyboard cheat sheet) SHALL open with its choices visible and its search or date field unfocused;
- a dialog whose first control is a text field that did not ask for focus SHALL open with that field unfocused;
- an overlay for typing (quick add, the command bar, a comment, a rename or a name prompt, a confirmation or sign-in field) SHALL focus its field as it opens;
- focus SHALL still move into the overlay (to a control that is not a text field, or to the overlay itself, which carries its role and name), so assistive technology announces it and Escape and Back close it; from the overlay itself the next Tab stop SHALL be the field that would have been focused;
- a tap on the field SHALL focus it, and switching a segment inside the When sheet SHALL NOT focus the new segment's date field;
- a picker that replaces a menu's items inside an open sheet SHALL leave focus inside the sheet.

With a fine or hovering pointer, or once a hardware key was pressed, every overlay SHALL focus what it focused before this requirement. Focus SHALL return to the trigger on close in every case. This is presentation only: it reads and writes no data, needs no network and behaves the same offline; nothing syncs.

#### Scenario: The When sheet on a phone
- **WHEN** the user taps a task's Do on part on a phone with nothing attached
- **THEN** the When sheet opens with the calendar in view, the date field is not focused, no on-screen keyboard appears, and focus is inside the sheet

#### Scenario: The label picker on a phone
- **WHEN** the user opens a task's Labels on a phone with nothing attached
- **THEN** the labels are listed, the field "Type to find or create a label…" is not focused, and focus is on the sheet

#### Scenario: Asking for the field
- **WHEN** the user taps the label picker's field on that phone
- **THEN** the field is focused and the on-screen keyboard comes up, with the sheet above it

#### Scenario: Tab from the sheet
- **WHEN** the label picker opened with focus on the sheet and the user presses Tab on a keyboard just attached
- **THEN** focus moves to the picker's field, not to the Close button

#### Scenario: A sheet for typing
- **WHEN** the user taps the add button on a phone with nothing attached
- **THEN** quick add opens with its field focused and the on-screen keyboard up

#### Scenario: A rename prompt
- **WHEN** the user chooses Rename in a project's menu on a phone with nothing attached
- **THEN** the prompt opens with the name field focused

#### Scenario: A computer
- **WHEN** the user opens the When popover or the label picker on a computer
- **THEN** the date field or the picker's field is focused, as before

#### Scenario: A tablet with a keyboard and no pointer
- **WHEN** the user of a tablet with a keyboard case presses `j` in a list and then opens the label picker
- **THEN** the picker's field is focused

#### Scenario: A picker inside a menu
- **WHEN** the user opens a project's menu on a phone with nothing attached and chooses the step that picks an icon
- **THEN** the icon grid is shown, its search field is not focused, and focus is inside the sheet

#### Scenario: Closing
- **WHEN** the user closes the When sheet on that phone
- **THEN** focus returns to the part that opened it
