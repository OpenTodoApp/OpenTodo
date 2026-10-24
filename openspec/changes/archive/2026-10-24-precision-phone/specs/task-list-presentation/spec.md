## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. The layout SHALL follow the width of the row itself, not of the screen. From 40 rem of row width a row SHALL be one line: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title, except on a screen narrower than 768 px: there the row SHALL be one line at least 44 px tall, with the title at 14.5 px and one cell at its end, which is the date, else the deadline when it holds the third cell, else the assignee's avatar, else the project's colour dot; the project's and the assignee's names SHALL stay in the accessible text, and the other properties, the second line of facts and the counts SHALL be left to the task page. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

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

### Requirement: Time column
Every task list SHALL reserve, between the checkbox and the title, a column for the one value that places a task in the day: the due time in the user's time format, or, when the task has no due time and has a deadline, the deadline countdown (`3d`, `Today`, `2d over`) in its tone, or nothing. The column SHALL be shown for a whole list, at one width per list computed from the widest value the user's time format can produce, in tabular figures at the metadata size, when at least one visible row has a value for it, and SHALL be absent otherwise, so the checkbox position never changes and titles align within a list. The time SHALL take the date's tone rules: accent when the task is due today, danger when overdue, muted otherwise. A zone-fixed due SHALL show the viewer's local time in the column and its zone hint in the metadata line. The column is presentation only: it reads the row's own fields, writes nothing, and is the same offline and on every device. Below 768 px the column SHALL take no room on a row without a value; a row with one SHALL show it before the title at its own width, so a day on a phone still scans by its times while an untimed row keeps the width for its title.

#### Scenario: A day scans as a schedule
- **WHEN** Today lists tasks due at 09:00, 11:30 and 14:00 and one without a time, in the 24-hour format
- **THEN** the three times are stacked in one column of equal width in tabular figures, the fourth row's column is empty, and all four titles start at the same position

#### Scenario: Width follows the time format
- **WHEN** the user switches the time format from 24-hour to 12-hour
- **THEN** every list's column widens at once to fit "12:00 PM" and the titles move together, without a reload

#### Scenario: Deadline in the column
- **WHEN** today is 2026-10-14 and a task with no due time has the deadline 2026-10-17
- **THEN** its column shows "3d" in the warning tone, and the metadata line does not repeat the countdown

#### Scenario: Time and deadline
- **WHEN** a task is due today at 10:00 and has the deadline 2026-10-17
- **THEN** the column shows "10:00" in the accent and the line shows the countdown "3d" with its hourglass

#### Scenario: No column for an untimed list
- **WHEN** a project lists six tasks, none with a due time or a deadline
- **THEN** no column is rendered and the titles start directly after the checkbox

#### Scenario: Overdue time
- **WHEN** a task was due yesterday at 18:00 and is listed in Today's Overdue group
- **THEN** the column shows "18:00" in the danger tone and the line shows yesterday's date in the danger tone

#### Scenario: Zone-fixed due
- **WHEN** a task is due at 15:00 fixed to Europe/Rome and the viewer is in America/New_York
- **THEN** the column shows "09:00" and the line shows "fixed to Europe/Rome" in the faint colour

#### Scenario: Times lead their rows on a phone
- **WHEN** Today lists "Standup" at 09:30 and "Water the plants" without a time on a 390 px phone
- **THEN** "09:30" stands before "Standup", and "Water the plants" starts right after its checkbox with no empty column before it

### Requirement: Phone header actions
Below 768 px a list SHALL show its actions in the shell's bar and its overflow menu, never as a row of controls between the bar and the quick add, so the rule "Nothing between the header and the list" holds at every width. The bar SHALL show at most two visible actions: Process the Inbox in the Inbox, the Ask action in Today when the assistant is available, and otherwise the duration filter where the view has one; Display mode, "Select tasks", the duration filter when the slots are taken, and the rest SHALL be in the overflow. The Inbox SHALL have no subtitle: its planned tasks without a project are the last group of its list (OpenSpec `web-app`, "Standard views"). An active filter SHALL show as one chip with a clear control in the bar, not above the list.

#### Scenario: Today on a phone
- **WHEN** Today with ten tasks opens on a 390×844 phone
- **THEN** the only chrome above the first task is the bar, Today's head (the title, the date line and the briefing) and the quick add, Display mode is in the bar's overflow, and at least four tasks are visible without scrolling

#### Scenario: Inbox on a phone
- **WHEN** the Inbox with eight tasks and three planned tasks without a project opens on a phone
- **THEN** the bar shows "Process 8" as a visible action, no subtitle, and no row of controls under it; the three planned tasks are the folded group at the end of the list

#### Scenario: Filter chip in the bar
- **WHEN** the user picks "Quick wins" from the filter in the bar of a project on a phone
- **THEN** the list is filtered and one chip with a clear control appears in the bar, and the first task keeps its place under the quick add
