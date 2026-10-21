# Spec Delta

## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title, a metadata line shown only when there is metadata, and a trailing group at the end of the row holding, in this order, the project name when the view does not imply it, the counts (tracked time, subtask progress, the notes marker, comments, attachments) and the origin. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The trailing group SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; it is not a control and SHALL NOT add a touch or tab target. Below 640 px the project name SHALL end the metadata line instead of the trailing group, so the title keeps its width.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Titles align within a list
- **WHEN** Today lists a task due at 10:00 and a task with no time
- **THEN** both titles start at the same horizontal position, the first row's time in the column and the second row's column empty

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments
- **THEN** its row is one line tall

#### Scenario: Counts on demand
- **WHEN** a task has 2 of 3 subtasks done and 3 comments
- **THEN** "2/3" and "3" are at the end of the row in the faint text colour, become the muted text colour while the pointer is over the row or its open control has focus, and a screen reader hears "2 of 3 subtasks completed" and "3 comments" either way

#### Scenario: Project at the row's end
- **WHEN** Upcoming lists a task of the project "Home renovation" on a 1280 px screen
- **THEN** "Home renovation" is right-aligned muted text at the end of the row before the counts, and on a 390 px screen the same name ends the metadata line under the title

#### Scenario: Counts on a touch screen
- **WHEN** the same row is shown on a device without hover
- **THEN** the counts are shown at low contrast, still readable, and no extra tap target exists

### Requirement: Metadata language
Row metadata SHALL be one language in every list and on every card. The metadata line SHALL be one run of text at the metadata size in the muted text colour, its items separated by a middle dot, in this order: the date words with evening as a suffix, the repeat word with its repeat icon (an occurrence: "occurrence"), the deadline countdown with its hourglass icon when the time column does not already hold it, the start ("Starts 3 Nov", "Started 1 Nov", "Someday"), the estimate (`1h`, or `35m / 1h` once time was tracked, or `35m` alone without an estimate), blocked ("Blocked by 2" with its lock icon), the habit streak with its flame icon, up to three custom field values and "+n" for the rest, the assignee, and the origin (the icon for its kind and the external id, else the URL's host; a link opening in a new tab without passing the referrer when it has a URL, never opening the task). Labels SHALL follow as chips: each a small chip with the label's colour as a dot and its name, at most two shown, then "+n"; the full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel. No other item of a row SHALL have a pill background. Counts SHALL use tabular figures, not a monospace face.

Colour SHALL carry meaning only: the priority ring on the checkbox is coloured for P1 and P2 and neutral for P3 and P4; the date is in the danger tone when overdue, in the accent when the task is due today at a time, and muted otherwise; the deadline keeps its neutral, warning and danger tones; the label dot is the label's colour; everything else in the row is the muted colour, and the counts the faint colour. Every colour is a token.

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
- **THEN** its metadata line reads only the repeat icon and "repeats" in the muted colour, with no date text and no pill

#### Scenario: Timed task in Today
- **WHEN** a task is due today at 10:00
- **THEN** its Today row shows "10:00" in the accent colour in the time column and no "Today" in the line, while the same task in its project shows "10:00" in the column and "Today" in the accent colour in the line

#### Scenario: Overdue stays loud, and only the date
- **WHEN** a task was due three days ago with an estimate and two labels
- **THEN** its row in Today's Overdue group and in its project shows the date in the danger colour, and the estimate and the label names in the muted colour

#### Scenario: One run of text
- **WHEN** a task in Upcoming's Friday group is due at 14:00 with a 45-minute estimate, repeats weekly and has the label "work"
- **THEN** the column shows "14:00", the line reads "repeats · 45m" in one muted run with the repeat icon, and "work" follows as a chip with its dot, with no grey pill around the estimate

#### Scenario: Tracked time stays one item
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its line reads `35m / 1h` as one item, with no second item and no glyph, and the number of visible properties is unchanged

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
- **THEN** the line shows "Cost 120 · Status Ordered · Paid" in the muted colour and "+2", whose accessible name lists the rest, with no pill around any of them

#### Scenario: Issue chip opens the issue
- **WHEN** a task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` and the user clicks its item
- **THEN** the issue opens in a new tab, the task panel does not open, and the item's accessible name says it opens the source "o/r#7"

#### Scenario: Captured page on a card
- **WHEN** a task captured from `https://example.org/post` with title "Interesting article" is shown on the board
- **THEN** the card's line carries a link reading "example.org", and a task without an origin carries no origin item

#### Scenario: Email origin without a link
- **WHEN** a task's origin is `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** its item shows the at sign and reads "Email", is not a link, and the Message-ID is not shown

### Requirement: Selected row indicator
The selected row SHALL be marked by a 2 px accent bar at its leading edge and a faint accent tint, with no border or ring around the row and no full-strength background. Hovering a row SHALL give it a neutral tint lighter than the selected row's tint and, on a fine pointer from 768 px, reveal the row actions (see "Revealed row actions") in the place of the trailing group; nothing else: no border, ring, shadow or size change, and the row's metadata line SHALL keep its colours while hovered. Hovering the selected row SHALL add nothing to its selection marks beyond the revealed actions. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar and tint, the hovered row only a neutral tint lighter than the selection's plus its revealed actions, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background

#### Scenario: Hover over a two-line row
- **WHEN** the pointer moves over a row with a title and a metadata line on a 1280 px screen
- **THEN** a light neutral tint appears behind it and the actions appear at its right edge in the place of the counts, nothing in the row moves or changes size, and the metadata keeps its colours

#### Scenario: Hover over the selected row
- **WHEN** the pointer moves over the selected row
- **THEN** the row keeps its bar and tint and shows only the revealed actions in addition

## ADDED Requirements

### Requirement: Time column
Every task list SHALL reserve, between the checkbox and the title, a column for the one value that places a task in the day: the due time in the user's time format, or, when the task has no due time and has a deadline, the deadline countdown (`3d`, `Today`, `2d over`) in its tone, or nothing. The column SHALL be shown for a whole list, at one width per list computed from the widest value the user's time format can produce, in tabular figures at the metadata size, when at least one visible row has a value for it, and SHALL be absent otherwise, so the checkbox position never changes and titles align within a list. The time SHALL take the date's tone rules: accent when the task is due today, danger when overdue, muted otherwise. A zone-fixed due SHALL show the viewer's local time in the column and its zone hint in the metadata line. The column is presentation only: it reads the row's own fields, writes nothing, and is the same offline and on every device. Below 640 px the column SHALL stay, at the same width rule, because a day on a phone is the day that most needs to scan.

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

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold three actions at its right edge, rendered in the place of the trailing group and shown while the pointer is over the row or focus is inside it: Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the metadata, or hide the counts from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key and long press. Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** the "2" count fades and Schedule, Priority and More appear at the row's right edge, and the title does not move

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
- **THEN** no action buttons are rendered, the counts stay, and a long press opens the row menu

#### Scenario: Focus not obscured
- **WHEN** the focused More button of the last visible row sits under where a toast appears, and a toast appears
- **THEN** the list scrolls or the toast is placed so that the whole button stays visible

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer and hovers a row
- **THEN** no actions appear, because the row has no edits to offer

### Requirement: One row on the board, in Plan and in the review screens
Board cards, the compact rows of Plan and the calendar's day lists, and the rows of the weekly review walk, the Daily check, the Monthly look and Close the day SHALL render from the one row component in one of three shapes (row, card, compact) and SHALL follow the same metadata language, tone rules and omission table. A card SHALL show the time or countdown first in its line instead of a column. A compact row SHALL show the time, the title, the estimate and the priority ring only. Nothing else SHALL draw a task row.

#### Scenario: Card content
- **WHEN** a task with a date and time, three labels, an estimate and two comments is shown as a card
- **THEN** the card shows the title, then "10:00 · 1h" in the muted colour with the time first, two label chips and "+1", and the comment count at the end of the line, and nothing else

#### Scenario: Plan row
- **WHEN** a task due Thursday at 08:30 with a 15-minute estimate and priority P2 is shown in the Plan's Thursday column
- **THEN** the compact row shows "08:30", the title, "15m" and the P2 ring, no date words and no project

#### Scenario: Close the day rows
- **WHEN** Close the day lists the day's unfinished tasks
- **THEN** each row has the same column, line and chips as in Today, with the decision controls after it

## REMOVED Requirements

### Requirement: Row detail in lists
**Reason**: There is one row language now; the Calm/Detailed split and the preference that switched it are retired, because the Detailed language reintroduced the pills and colours the design refresh removes.

**Migration**: The `row_detail` preference stays in the op schema and the client defaults as a retired field (see `appearance-preferences`); clients ignore its value. The Rows control leaves Settings → Appearance. The Detailed stories, the `detail` prop of the row and the rowDetail tests are removed; every list renders the one row.
