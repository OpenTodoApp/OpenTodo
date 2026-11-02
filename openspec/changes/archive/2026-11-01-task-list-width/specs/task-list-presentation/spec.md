## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. The layout SHALL follow the width of the row itself, not of the screen. The title SHALL use the width the row leaves it, wrap onto a second line when it is longer, and end with an ellipsis after two lines; on a very wide row it SHALL wrap at a readable measure of about 100 characters (48 rem). While the title is cut, a pointer resting on it SHALL show the whole title in a tooltip; the open control is named by the whole title at all times, and the task panel shows it in full. No room SHALL be kept at the row's end for controls that only appear on hover or focus. From 40 rem of row width a row SHALL be one line, or two while its title wraps: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title, except on a screen narrower than 768 px: there the row SHALL be one line at least 44 px tall, with the title at 14.5 px on one line ending with an ellipsis and one cell at its end, which is the date, else the deadline when it holds the third cell, else the assignee's avatar, else the project's colour dot; the project's and the assignee's names SHALL stay in the accessible text, and the other properties, the second line of facts and the counts SHALL be left to the task page. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Titles align within a list
- **WHEN** Today lists a task due at 10:00 and a task with no time
- **THEN** both titles start at the same horizontal position, the first row's time in the column and the second row's column empty

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments, or a list row is at least 40 rem wide and the task has only properties the column holds
- **THEN** its row is one line tall

#### Scenario: Counts on demand
- **WHEN** a task has 2 of 3 subtasks done and 3 comments
- **THEN** "2/3" and "3" are beside the title in the faint text colour, become the muted text colour while the pointer is over the row or its open control has focus, and a screen reader hears "2 of 3 subtasks completed" and "3 comments" either way

#### Scenario: Project at the row's end
- **WHEN** Upcoming lists a task of the project "Home renovation" on a 1280 px screen
- **THEN** "Home renovation" is muted text with the project's dot in the project cell of the right-hand column, aligned with the project of every other row, and on a 390 px screen a row with no date and no assignee ends with the project's dot alone, its name read by a screen reader

#### Scenario: Counts on a touch screen
- **WHEN** the same row is shown on a 1024 px tablet without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

#### Scenario: One line on a phone
- **WHEN** Today lists "Call the plumber about the boiler", assigned to Mia Lang in the project "Home renovation", on a 390×844 phone
- **THEN** the row is one line 44 px tall, the title at 14.5 px is followed by Mia Lang's avatar at the row's end, the project and the counts are not on the row, and a screen reader still hears "Mia Lang"

#### Scenario: The date wins on a phone
- **WHEN** a task due two days ago with a label, an estimate and a project is listed in Today's Earlier group on a 390 px phone
- **THEN** its row ends with the date in the danger tone and shows no label, estimate or project

#### Scenario: A narrow list on a wide screen
- **WHEN** a list narrower than 40 rem is shown beside other content on a 1280 px screen
- **THEN** its rows keep the metadata line under the title

#### Scenario: A long title on a medium window
- **WHEN** the Inbox lists "Email cutting board company (Babylonian Woodworks) about the warped board and the replacement they promised" in a 960 px window with a mouse
- **THEN** the title runs to the row's right end on two lines with no empty area beside it, and the row's height is the same with the pointer over it

#### Scenario: A title longer than two lines
- **WHEN** a task's title needs four lines at the row's width
- **THEN** the row shows its first two lines ending with an ellipsis, resting the pointer on the title shows the whole title in a tooltip, and a screen reader hears the whole title as the row's name

#### Scenario: Properties on the first line
- **WHEN** a list row 60 rem wide holds a task due tomorrow whose title takes two lines
- **THEN** "Tomorrow" stands in the date cell on the title's first line, aligned with the dates of the one-line rows

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold four actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface over the row's end, at every row width: over the end of the property column of a one-line row, and over the end of the title's first line of a narrower row, which keeps no room for them: Show details, which shows the task's details under the row as → does (Hide details while they are shown, see "Expanded rows"); Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key, and the selection bar's Actions after a long press ticks the row (`bulk-actions` "One ticked task on touch"), and the row's disclosure button shows the details. Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field. A viewer's row SHALL offer Show details only.

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
