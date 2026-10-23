## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. The layout SHALL follow the width of the row itself, not of the screen. From 40 rem of row width a row SHALL be one line: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

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
- **THEN** "Home renovation" is muted text with the project's dot in the project cell of the right-hand column, aligned with the project of every other row, and on a 390 px screen the same name is in the metadata line under the title

#### Scenario: Counts on a touch screen
- **WHEN** the same row is shown on a device without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

### Requirement: Metadata language
Row metadata SHALL be one language in every list and on every card. A list row's properties SHALL be at the metadata size in the muted text colour: in the right-hand column of a one-line row, each in its cell (the date, the estimate and the subtask progress with their icons, the assignee as an avatar named in its tooltip and for assistive technology), and in a narrower row one run of text under the title, its items separated by a middle dot, in this order: the date words with evening as a suffix, the project, the labels or the deadline or the subtask progress, the estimate (`1h`, or `35m / 1h` once time was tracked, or `35m` alone without an estimate), the assignee, then the parent's name, the deadline countdown with its hourglass icon when the time column and the third cell do not already hold it, the start ("Starts 3 Nov", "Started 1 Nov", "Someday"), blocked ("Blocked by 2" with its lock icon), the habit streak with its flame icon, and up to three custom field values and "+n" for the rest. The repeat mark SHALL be the repeat icon beside the title, read as "repeats" (an occurrence: "occurrence"). A card's line SHALL keep one run in the order of the date words, the repeat word with its icon, the deadline, the start, the estimate, blocked, the streak, the field values, the assignee and the project. The origin (the icon for its kind and the external id, else the URL's host; a link opening in a new tab without passing the referrer when it has a URL, never opening the task) SHALL be in the row's trailing group and at the end of a card. Labels SHALL be chips: each a small chip with the label's colour as a dot and its name, at most two shown, then "+n"; the full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel. No other item of a row SHALL have a pill background. Counts SHALL use tabular figures, not a monospace face.

Colour SHALL carry meaning only: the priority ring on the checkbox is coloured for P1 and P2 and neutral for P3 and P4; the date text follows one due ladder by how close the task's day is to the user's logical today: a date after tomorrow in the muted tone; tomorrow, as "Tomorrow" or the time under the Tomorrow heading, in the default text tone; today, timed or not, in the accent tone; and a day before today in the danger tone. A heading that implies the day leaves the date text out, so the ladder shows on the parts that remain (a time, "evening", the repeat mark). The ladder is computed on the device from local data and changes with the logical day without a reload; the deadline keeps its neutral, warning and danger tones; the label dot is the label's colour; everything else in the row is the muted colour, and the counts the faint colour. Every colour is a token.

What the view or the group heading already says SHALL be left out, by this table; everything else is shown when set:

| View or group | Left out of the row | Kept |
| --- | --- | --- |
| Inbox | the project | everything else |
| Today, today's group | the date word "Today" | the time in the column, "evening", the repeat word |
| Today, This Evening group | "Today" and "evening" | the time, the repeat word |
| Today, Overdue and Blocked groups | nothing | the date, so how late it is stays visible |
| Upcoming, a date group | the date words of that day | the time, "evening", the repeat word, the deadline |
| A project, list layout | the project | sections are not on rows anyway |
| A project, board | the project and the section (the column says it) | the rest, including the field values |
| A project, Later group | nothing | "Starts" and "Someday" |
| A label's view | the chip of that label | other labels, the date, counts |
| Someday | "Someday" | the project |
| A saved view grouped by project | the project | everything else |
| Plan and the calendar's day lists | the date words (the column says the day) | the time, the estimate, the priority ring |
| Anytime, Assigned, Completed, filters, dashboards, Next, Waiting, the review and Loop screens, Close the day, Trash | nothing | everything |

A row SHALL never omit a value because of what it is, only because the heading or the view already states it. The omission is presentation only: nothing is written, and the same task shows the same row on every device.

#### Scenario: Recurring evening task
- **WHEN** a task is due today, repeats every day and is marked for the evening, and Today shows it under This Evening
- **THEN** its row shows only the repeat icon beside the title, read as "repeats", with no date text and no pill

#### Scenario: Timed task in Today
- **WHEN** a task is due today at 10:00
- **THEN** its Today row shows "10:00" in the accent colour in the time column and no "Today" in the line, while the same task in its project shows "10:00" in the column and "Today" in the accent colour in the line

#### Scenario: Overdue stays loud
- **WHEN** a task was due three days ago with an estimate and two labels
- **THEN** its row in Today's Overdue group and in its project shows the date in the danger colour, and the estimate and the label names in the muted colour

#### Scenario: One run of text
- **WHEN** a task in Upcoming's Friday group is due at 14:00 with a 45-minute estimate, repeats weekly and has the label "work"
- **THEN** the time column shows "14:00", the repeat icon sits beside the title, "work" is a chip with its dot in the third cell and "45m" is muted text in the estimate cell, with no grey pill around the estimate

#### Scenario: Tracked time stays one chip
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its row reads `35m / 1h` as one item, with no second item and no glyph, and the number of visible properties is unchanged

#### Scenario: Neutral ring for P3 and P4
- **WHEN** a list holds a P1, a P2, a P3 and a P4 task
- **THEN** the P1 and P2 circles carry their priority colours and the P3 and P4 circles carry the neutral ring

#### Scenario: Three labels on a row
- **WHEN** a task carries the labels errand, call and home, in that order
- **THEN** the row shows the chips "errand" and "call" with their dots and "+1", a screen reader hears "Labels: errand, call, home", and hovering or focusing the group shows all three names

#### Scenario: Inside the label's view
- **WHEN** the errand label's view lists that task
- **THEN** the row shows the chips of call and home only

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" item

#### Scenario: Board card inside its project
- **WHEN** a project board shows a card with a section, a project, two labels and a deadline
- **THEN** the card shows no project and no section, and shows the deadline in the line and the two label chips

#### Scenario: Upcoming under Tomorrow
- **WHEN** Upcoming lists a task due tomorrow at 09:30 under the Tomorrow heading
- **THEN** the column shows "09:30" and the line has no "Tomorrow", and a task due tomorrow without a time has an empty column and no date text under that heading

#### Scenario: Custom field values as text
- **WHEN** a task in a project with the fields Cost, Status, Paid, Client and Vendor holds five non-empty values
- **THEN** the row's second line shows "Cost 120 · Status Ordered · Paid" in the muted colour and "+2", whose accessible name lists the rest, with no pill around any of them

#### Scenario: Issue chip opens the issue
- **WHEN** a task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` and the user clicks its item
- **THEN** the issue opens in a new tab, the task panel does not open, and the item's accessible name says it opens the source "o/r#7"

#### Scenario: Captured page on a card
- **WHEN** a task captured from `https://example.org/post` with title "Interesting article" is shown on the board
- **THEN** the card's line carries a link reading "example.org", and a task without an origin carries no origin item

#### Scenario: Email origin without a link
- **WHEN** a task's origin is `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** its item shows the at sign and reads "Email", is not a link, and the Message-ID is not shown

#### Scenario: Tomorrow in a project
- **WHEN** a project lists a task due tomorrow without a time
- **THEN** its row reads "Tomorrow" in the default text tone, while a task due in four days reads its date in the muted tone

#### Scenario: Today without a time
- **WHEN** a project lists a task due today without a time
- **THEN** its row reads "Today" in the accent tone, and the same task under Today's own group shows no date text

#### Scenario: Midnight moves a task up the ladder
- **WHEN** a task due tomorrow is shown in a project list and the user's logical day advances
- **THEN** the row's date turns to "Today" in the accent tone without a reload, and the day after that to the date in the danger tone

#### Scenario: Deadline keeps its countdown
- **WHEN** a task due tomorrow has a deadline in two days
- **THEN** "Tomorrow" is in the default text tone and the countdown "2d" is in the warning tone

### Requirement: Group headers
Date groups, section groups, project groups, the Earlier group, the "Later" group and the Completed group SHALL use one header: a label, a count, a collapse control, and trailing actions. In a list the header SHALL be a group bar: a 32 px strip filled with the raised surface, with the label at the metadata size in the medium weight and the default text tone, in sentence case whether the view generated the group (a date, Earlier, Today, This Evening, Blocked, Later, Completed, No section) or the user named it (a section, a project, a label); on a board column the header SHALL stay a plain heading on the column's surface. The count SHALL be in the faint tone with tabular figures. Trailing actions SHALL appear on hover, focus or touch, except the actions of the Earlier group, which SHALL be visible at all times. No group header SHALL use the danger tone. Collapse state SHALL be remembered per device; the Earlier group of Today SHALL be collapsed by default on a device that never opened or closed it while it holds more than five tasks, and open by default otherwise. This is presentation only and behaves the same offline.

#### Scenario: Collapse a date group
- **WHEN** the user collapses "Tomorrow" in Upcoming and reloads
- **THEN** "Tomorrow" stays collapsed on this device and shows its count

#### Scenario: A generated and a named group
- **WHEN** Upcoming shows the "Tomorrow" group and a project shows its "Planning" section
- **THEN** "Tomorrow" and "Planning" are both group bars in sentence case at the metadata size, medium weight, in the default text tone, with their counts in the faint tone

#### Scenario: Earlier is quiet
- **WHEN** Today lists three tasks due before today
- **THEN** the first group bar reads "Earlier" in the default text tone with "3" in the faint tone, each task's date is in the danger tone, and no other part of the group is red

#### Scenario: Earlier collapsed by default
- **WHEN** a user who never touched the group opens Today with eight tasks due before today
- **THEN** the Earlier group shows its label, "8", "Move all to today" and "Reschedule…" and no rows, and opening it is remembered on this device

#### Scenario: Earlier open by default
- **WHEN** a user who never touched the group opens Today with two tasks due before today
- **THEN** the Earlier group shows its two rows

### Requirement: Completed group in a project
A project's Project menu SHALL offer "Show completed tasks" in the list layout, a preference of the device per project that is off by default and never synced. While it is on, the project's list SHALL end with a "Completed" group holding every completed (not skipped) task of the project, most recently completed first. The group SHALL be closed by default with its count on the heading, and its open or closed state SHALL be remembered on the device. Completing a task SHALL move it into the group; unticking a task in the group SHALL reopen it and return it among the open tasks. While it is off and the project has completed tasks, a list with open tasks SHALL end with one line, "n completed tasks hidden by display options" and a Show link that turns the preference on. The board and the timeline SHALL be unchanged. A completed task's circle SHALL show the filled check without the priority ring.

#### Scenario: Groceries reused
- **WHEN** a user turns on "Show completed tasks" in a Groceries project where Milk and Eggs were ticked off, Eggs last, and opens the Completed group
- **THEN** the group's heading reads "Completed 2", Eggs is listed above Milk, both show a ticked circle, and unticking Milk puts it back among the open tasks

#### Scenario: Off by default
- **WHEN** a user opens a project they never changed the setting for
- **THEN** no Completed group is shown, completed tasks are only in the Completed view, and the list ends with "2 completed tasks hidden by display options · Show" when two were completed

#### Scenario: Board layout
- **WHEN** the project is shown as a board
- **THEN** the Project menu does not offer "Show completed tasks" and the board shows open tasks only

### Requirement: Selected row indicator
The selected row SHALL be marked by a 2 px accent bar at its leading edge on the neutral selected-row surface, with no border or ring around the row. Hovering a row SHALL give it the neutral hover surface, lighter than the selected row's, and, on a fine pointer from 768 px, reveal the row actions (see "Revealed row actions") in the place of the trailing group; nothing else: no border, ring, shadow or size change, and the row's metadata line SHALL keep its colours while hovered. Hovering the selected row SHALL add nothing to its selection marks beyond the revealed actions. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar on the selected-row surface, the hovered row only the lighter hover surface plus its revealed actions, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background

#### Scenario: Hover over a two-line row
- **WHEN** the pointer moves over a row with a title and a metadata line on a 1280 px screen
- **THEN** the hover surface appears behind it and the actions appear at its right edge, nothing in the row moves or changes size, and the metadata keeps its colours

#### Scenario: Hover over the selected row
- **WHEN** the pointer moves over the selected row
- **THEN** the row keeps its bar and surface and shows only the revealed actions in addition

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold three actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface: over the end of the property column of a one-line row, and in the place of the trailing group of a narrower row, which keeps room for them: Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key and long press. Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** Schedule, Priority and More appear in a floating cluster at the row's right edge, the "2" beside the title stays, and the title does not move

#### Scenario: Reveal on focus
- **WHEN** the user presses `j` to focus a row's open control and then Tab
- **THEN** focus moves to Schedule, the three actions are visible, Tab moves on to Priority and More, Shift+Tab returns, and `j` from the open control skips them

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
- **THEN** no actions appear, because the row has no edits to offer
