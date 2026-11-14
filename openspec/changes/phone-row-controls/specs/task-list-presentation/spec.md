# Spec Delta

## ADDED Requirements

### Requirement: Row controls on touch do not overlap
On a coarse pointer the controls of a task row (the fold arrow of a task with subtasks, the checkbox, the open control that is the row's title and facts, the disclosure button where the row has one, and the grip) SHALL each take taps in an area of at least 44 by 44 CSS pixels, and no two of these areas, nor a row control's area and a control of the section header or the page header above the row, SHALL overlap by more than 4 CSS pixels on both axes. A tap SHALL act on the control whose area it is in. The fold arrow's area SHALL end where the checkbox's begins and reach back over the row's indent and the page's gutter; the grip's area SHALL lie inside the row, on the title's first line with the row's other controls. The checkbox and the start of the title SHALL NOT move, so the checkboxes of every list stay aligned; the fold arrow and the grip SHALL move by no more than 4 CSS pixels sideways, and the title SHALL lose no more than 4 CSS pixels of width to them. Where a row has both a disclosure button and a grip, the two SHALL stand far enough apart for their areas. A pressed control SHALL show its pressed colour as a 28 px circle around its glyph, wherever the glyph sits in its area. Nothing here changes what a control does or writes, so it is the same offline.

#### Scenario: Fold arrow beside the checkbox
- **WHEN** a project at 360 px on a touch screen shows a task with subtasks, and the user taps 8 px to the left of the fold arrow, then 8 px to the left of the checkbox's circle
- **THEN** the first tap folds the subtasks and completes nothing, and the second completes the task and folds nothing

#### Scenario: Grip under a section header
- **WHEN** the first row of a project section at 360 px is shown under the section's header with its Add a task button
- **THEN** the grip is level with the row's title, its area starts at the row's top edge, and a tap at the bottom of the Add a task button adds a task and selects nothing

#### Scenario: Disclosure beside the grip
- **WHEN** a row on an 820 px wide touch screen ends with its disclosure button and its grip, and the user taps the right-hand edge of the disclosure's area
- **THEN** the details open and the row is not selected

#### Scenario: Pressed fold arrow
- **WHEN** a finger is on the fold arrow of a row
- **THEN** a 28 px circle in the selected colour surrounds the arrow's glyph, the arrow is not dimmed and the row is not tinted

### Requirement: Add field hint on a phone
Below 768 px the hint in a list's add field and in a section's add line SHALL be the short "Add a task…", so it fits the field's one line at 360 px in every interface language; from 768 px the hint SHALL name where the task goes, as before ("Add a task to Home renovation…", "Add a task for today…"). The field's accessible name SHALL NOT change with the width, and where the task goes SHALL NOT change: it is the list or section the field belongs to.

#### Scenario: Long project name on a phone
- **WHEN** the project "Home renovation with a rather long project name" is shown at 360 px
- **THEN** the add field reads "Add a task…" on one line and a task typed there is added to that project

#### Scenario: Wide screen
- **WHEN** the same project is shown at 1280 px
- **THEN** the add field reads "Add a task to Home renovation with a rather long project name…"

## MODIFIED Requirements

### Requirement: Expanded rows
A task list row SHALL be able to show the task's details directly under it, inside the list, and hide them again, without opening the task page. This SHALL apply to the list layout of Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned, projects, labels, places, the Filter view and saved views; board cards, the timeline, calendar and Plan rows, the review screens, Close the day and dashboards SHALL NOT expand. With a row selected, → SHALL unfold its subtasks when they are folded and otherwise show its details; ← SHALL hide its details when shown, otherwise fold its subtasks, otherwise select its parent; Esc SHALL hide the details after closing any picker or panel and before clearing the selection; Enter SHALL still open the task page and Space SHALL still tick. On a fine pointer from 768 px the revealed actions SHALL offer Show details (Hide details while shown); on a coarse pointer from 768 px every row SHALL end with a disclosure button with a target of at least 44 by 44 CSS pixels, which a tap toggles and which SHALL NOT open the task, while a horizontal drag starting on it remains the row's swipe. Below 768 px a row SHALL have no disclosure button: a tap on the row opens the task, which shows everything the details would, and → and the "Expand the row" choice of "Click a task to" still expand it. A row whose details are shown SHALL end with the disclosure button as Hide details at every width, so details opened with the keyboard, by a click or before the window narrowed can always be closed with the pointer. The details SHALL be indented under the title, on the row's own surface with no border, and SHALL show, in this order: the notes rendered and clamped to about four lines with Show more and Show less when longer; the task's facts in the task panel's words, only those with a value (do date, evening, repeat, deadline, start, reminders, project, section, parent, origin, location, priority, estimate, labels, assignee, blocked by, blocks); the subtasks with their checkboxes, unless the list already shows them as rows under the task; the comment and attachment counts; and Open task. Ticking a subtask there SHALL be the only change made in place and SHALL write the same operation as on the task page, so it works offline and converges per field; viewers of a shared project SHALL see the checkboxes disabled. At most one row of a list SHALL be expanded: expanding another row SHALL hide the first, and moving the cursor SHALL NOT. The expanded row SHALL be kept only while the list is shown: leaving it or reloading SHALL hide it, and nothing SHALL be stored or synced. Ticking SHALL NOT change it; no row SHALL show details while a drag runs or while it is edited in place; a completed row that leaves takes its details with it. The row's open control and the disclosure SHALL expose `aria-expanded` and control the details, a group named after the task; → and ← SHALL leave focus on the row; Tab SHALL reach the details' controls after the row's own. The details SHALL fade in within the ui duration, and appear without motion under reduced motion. Only the expanded row SHALL load the details, and opening or closing them SHALL re-render only the rows that change.

#### Scenario: Expand with the keyboard
- **WHEN** Today lists "Pay rent" with notes and two labels, the user selects it with `j` and presses →
- **THEN** its notes, its facts and Open task appear under the row, focus stays on the row, and its open control is announced as expanded

#### Scenario: Collapse with the keyboard
- **WHEN** the details of the selected row are shown and the user presses ←
- **THEN** the details are hidden and the selection stays on the row

#### Scenario: Folded subtasks first
- **WHEN** a project row has folded subtasks and the user presses → twice
- **THEN** the first press shows the subtask rows and the second shows the details, which leave out the subtask list because the rows are shown

#### Scenario: Esc hides the details
- **WHEN** the details of the selected row are shown, no picker or panel is open, and the user presses Esc
- **THEN** the details are hidden and the row stays selected; a second Esc clears the selection

#### Scenario: Tap on a touch tablet
- **WHEN** an Inbox row on an 820 px wide touch screen is tapped on its disclosure button
- **THEN** the details open under it, the task page does not open, and a second tap hides them

#### Scenario: Tap on a phone
- **WHEN** the Inbox is shown at 360 px on a touch screen and a row is tapped
- **THEN** the task opens; no row has a Show details button, and a row ends with its date or other end cell and its grip

#### Scenario: An expanded row in a window that narrows
- **WHEN** a row's details are shown at 900 px and the window is narrowed to 600 px
- **THEN** the details stay, and the row ends with Hide details, which closes them

#### Scenario: Swipe still works
- **WHEN** on a touch screen the user drags a row 100 px to the right starting on its disclosure button
- **THEN** the task is completed as with any swipe and the details do not open

#### Scenario: Show details on hover
- **WHEN** the pointer is over a row on a 1280 px screen and the user clicks Show details in the revealed actions
- **THEN** the details open under the row and the action now reads Hide details

#### Scenario: Tick a subtask in place
- **WHEN** the details of a task in Today show its subtasks and the user ticks the first one while offline
- **THEN** the subtask is completed at once, the row's progress count updates, and other devices converge on it after the next sync

#### Scenario: One at a time
- **WHEN** the details of one row are shown and the user expands another row
- **THEN** the first row's details are hidden and the second row's are shown

#### Scenario: Long notes
- **WHEN** a task's notes are twenty lines long and its details are shown
- **THEN** about four lines are shown with Show more, which shows the rest in place

#### Scenario: Not remembered
- **WHEN** a row's details are shown and the user goes to another list and back
- **THEN** no row is expanded and nothing was written to the device's data or synced

#### Scenario: Viewer
- **WHEN** a viewer of a shared project expands a task with subtasks
- **THEN** the details show the subtasks with disabled checkboxes and no fact can be edited

#### Scenario: Drag
- **WHEN** a row's details are shown and the user starts dragging any row of the list
- **THEN** the details are hidden while the drag runs and the drop zones are those of one-line rows

#### Scenario: Board
- **WHEN** a project is shown as a board and the user presses → with a card selected
- **THEN** the selection moves to the next column and no card expands

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the user presses →
- **THEN** the details appear at once without fading

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold four actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface over the row's end, at every row width: over the end of the property column of a one-line row, and over the end of the title's first line of a narrower row, which keeps no room for them: Show details, which shows the task's details under the row as → does (Hide details while they are shown, see "Expanded rows"); Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key, and the selection bar's Actions after a long press ticks the row (`bulk-actions` "One ticked task on touch"); the details are shown by the row's disclosure button on a coarse pointer from 768 px, and by → at every width (see "Expanded rows"). Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field. A viewer's row SHALL offer Show details only.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** Show details, Schedule, Priority and More appear in a floating cluster at the row's right edge, the "2" beside the title stays, and the title does not move

#### Scenario: Reveal on focus
- **WHEN** the user presses `j` to focus a row's open control and then Tab
- **THEN** focus moves to Show details, the four actions are visible, Tab moves on to Schedule, Priority and More, Shift+Tab returns, and `j` from the open control skips them

#### Scenario: Schedule from the row
- **WHEN** the user activates Schedule on a row and picks Tomorrow
- **THEN** the task is due tomorrow, the row re-sorts or stays as the view requires, and a toast offers Undo, exactly as `s` then Tomorrow would

#### Scenario: Priority from the row
- **WHEN** the user activates Priority and chooses P1 while offline
- **THEN** the checkbox ring turns P1 at once and the change reaches other devices after the next sync

#### Scenario: Touch screen
- **WHEN** a row is shown on a coarse pointer at 1024 px
- **THEN** no action buttons are rendered, the counts stay, and a long press selects the row so its actions are in the phone bar (bulk-actions "Select with a pointer or on touch")

#### Scenario: Focus not obscured
- **WHEN** the focused More button of the last visible row sits under where a toast appears, and a toast appears
- **THEN** the list scrolls or the toast is placed so that the whole button stays visible

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer and hovers a row
- **THEN** only Show details appears, because the row has no edits to offer

#### Scenario: Reveal on a narrow row
- **WHEN** the pointer enters a two-line row of a list 30 rem wide on a 1100 px screen
- **THEN** the cluster appears over the end of the title's first line, the title does not move or rewrap, and the row's height does not change
