## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show a panel in the shell's panel slot (see `app-shell`) for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The panel SHALL show only the properties that have a value and offer the rest from an Add menu. A task SHALL open in the panel from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). Below 768 px the panel SHALL open as a bottom sheet over the dimmed list: a drag handle on its own strip above the sticky header, a height of at most 90 percent of the viewport, the same content and address as the panel. The sheet SHALL close on a drag down of more than 80 px or a flick on the handle or the header, on a drag down on its body only while the body is scrolled to its top, on a tap on the scrim, on its Close control and on Escape. With the on-screen keyboard up the focused field SHALL stay visible inside the sheet.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the detail panel opens with that task's fields and the address carries the task id

#### Scenario: Click edits in place on a desktop
- **WHEN** the panel is closed and the user clicks a task's title with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the panel does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the panel shows the title, the notes placeholder, the project, the When and priority values, the subtask line and the Add menu, and no other property

#### Scenario: Drag the handle to close
- **WHEN** the user opens a task on a 390 px phone and drags the handle down by 100 px
- **THEN** the sheet closes, the address loses the task id, and the list behind is where it was

#### Scenario: Reading comments does not close the sheet
- **WHEN** the user has scrolled the sheet's body down to the comments and drags down on a comment
- **THEN** the body scrolls back up and the sheet stays open; a further drag down once the body is at its top closes it

#### Scenario: Scrim and Close
- **WHEN** the user taps the dimmed list above the sheet, or the sheet's Close control
- **THEN** the sheet closes and focus returns to the row that opened it

### Requirement: Phone layout rules
From 360 px wide up no screen SHALL scroll horizontally, in every interface language, except designated regions (board columns, week grid, wide tables) that scroll inside themselves. On touch screens interactive controls SHALL be at least 48×48 px, or at least 44×44 px with 8 px of space to the next control, and controls shown on hover SHALL always be visible. Long words and URLs SHALL wrap, layouts SHALL follow the visible viewport height and safe areas, and the on-screen keyboard SHALL not hide the focused field, inside a sheet included. A fixed control SHALL NOT cover content: a list reserves the room a floating control needs under its last row.

#### Scenario: Narrow phone
- **WHEN** any screen is shown 360 px wide
- **THEN** the page has no horizontal scrollbar and nothing is cut off at the edges

#### Scenario: Narrow phone in German
- **WHEN** the interface language is German or French and Today, a project, Settings and the drawer are shown 360 px wide
- **THEN** no page scrolls sideways and no control is clipped, with the longer labels wrapped or truncated with their full name in the accessible name

#### Scenario: Row menu on a touch screen
- **WHEN** a touch-screen user looks at the sidebar views or labels
- **THEN** their menu buttons are visible without hovering and at least 48 px in both directions

#### Scenario: Long URL in a comment
- **WHEN** a comment contains a 120-character URL
- **THEN** it wraps inside the comment and the page does not scroll sideways

#### Scenario: Keyboard over a sheet
- **WHEN** the user focuses the comment composer at the bottom of the task sheet on a phone
- **THEN** the sheet scrolls so the composer stays above the keyboard and the sticky header stays visible

### Requirement: Overlays fit every screen
Every menu, popover, picker, dialog and toast SHALL be fully inside the viewport from 360 px wide up, with its close control visible and usable. Below 640 px menus, popovers and pickers SHALL open as bottom sheets across the screen width with a drag handle, at most 90 percent of the viewport height, closing on a drag down on the handle as well as on their close control and a tap outside; from 640 px up they SHALL open next to their trigger, shifted or flipped to stay inside the viewport. A dialog taller than the screen SHALL become a full-screen sheet with a pinned header and close button. A toast SHALL never cover the focused control (it sits above the tab bar on a phone and moves up while a sheet is open).

#### Scenario: Notifications on a phone
- **WHEN** a user on a 390 px wide screen taps the bell
- **THEN** the notifications open as a bottom sheet across the screen with a drag handle, every entry is fully visible and the sheet closes with its close button, a drag down on the handle or a tap outside

#### Scenario: Menu near the edge on a tablet
- **WHEN** a menu's trigger sits near the left edge of a 768 px screen
- **THEN** the menu opens shifted so that it is entirely on screen

#### Scenario: Long dialog
- **WHEN** a dialog's content is taller than the screen
- **THEN** it opens full screen, its content scrolls and its close button stays visible at the top

#### Scenario: Toast above the tab bar
- **WHEN** the user completes a task on a phone and the Undo toast appears
- **THEN** the toast sits above the tab bar and covers no row, and Undo is at least 48 px tall
