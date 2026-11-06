## MODIFIED Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash, Next, Waiting, the review screens, Close the day) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the time column (see "Time column"), the title with its marks beside it (the repeat mark and the counts: subtask progress, the notes marker, comments, attachments), the properties (see "Metadata language"), and a trailing group at the end of the row holding the origin. From 40 rem of row width the trailing group SHALL be one fixed width on every row of a list, with an origin or empty, so the right-hand column ends at the same place on every row whatever a row ends with; an origin longer than the group ends with an ellipsis, its whole text in its accessible name and the task's details. The layout SHALL follow the width of the row itself, not of the screen. The title SHALL use the width the row leaves it, wrap onto a second line when it is longer, and end with an ellipsis after two lines; on a very wide row it SHALL wrap at a readable measure of about 100 characters (48 rem). While the title is cut, a pointer resting on it SHALL show the whole title in a tooltip; the open control is named by the whole title at all times, and the task panel shows it in full. No room SHALL be kept at the row's end for controls that only appear on hover or focus. From 40 rem of row width a row SHALL be one line, or two while its title wraps: the title on the left and the properties in a right-hand column of fixed cells, in this order: the date, the project when the list shows projects, one cell holding the labels, else the deadline, else the subtask progress, the estimate, and the assignee; every row of a list SHALL use the same cell widths, so each property lines up down the list, and an empty cell keeps its width. As the row narrows the column SHALL drop cells from its end: under 56 rem the estimate and the assignee, and under 48 rem the third cell when the list shows projects; the task panel shows every property. Facts the column does not hold (the start, the deadline when the labels take its cell, blocked, the habit streak, field values, a parent's name, the sample mark) SHALL take a second line only when there are any. Under 40 rem of row width the properties and those facts SHALL form one metadata line under the title, except on a screen narrower than 768 px: there the row SHALL be one line at least 44 px tall, with the title at 14.5 px on one line ending with an ellipsis and one cell at its end, which is the date, else the deadline when it holds the third cell, else the assignee's avatar, else the project's colour dot; the project's and the assignee's names SHALL stay in the accessible text, and the other properties, the second line of facts and the counts SHALL be left to the task page. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views; within one list every title SHALL start at the same horizontal position. The counts SHALL be in the page and read by assistive technology at all times, at the faint text colour (still meeting text contrast) until the pointer is over the row or focus is inside it, then at the muted colour; they are not a control and SHALL NOT add a touch or tab target.

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

#### Scenario: Columns line up with and without an origin
- **WHEN** a project list at 1280 or 768 px holds tasks imported from Todoist, a task from a GitHub issue, a task captured from a page, a Trello card and a task without an origin, each with a date and a label
- **THEN** every row's date cell starts at the same horizontal position and so does every row's label cell, and at 390 px every row's date ends at the same position

### Requirement: Metadata language
Row metadata SHALL be one language in every list and on every card. A list row's properties SHALL be at the metadata size in the muted text colour: in the right-hand column of a one-line row, each in its cell (the date, the estimate and the subtask progress with their icons, the assignee as an avatar named in its tooltip and for assistive technology), and in a narrower row one run of text under the title, its items separated by a middle dot, in this order: the date words with evening as a suffix, the project, the labels or the deadline or the subtask progress, the estimate (`1h`, or `35m / 1h` once time was tracked, or `35m` alone without an estimate), the assignee, then the parent's name, the deadline countdown with its hourglass icon when the time column and the third cell do not already hold it, the start ("Starts 3 Nov", "Started 1 Nov", "Someday"), blocked ("Blocked by 2" with its lock icon), the habit streak with its flame icon, and up to three custom field values and "+n" for the rest. The repeat mark SHALL be the repeat icon beside the title, read as "repeats" (an occurrence: "occurrence"). A card's line SHALL keep one run in the order of the date words, the repeat word with its icon, the deadline, the start, the estimate, blocked, the streak, the field values, the assignee and the project. The origin (the icon for its kind and the external id, else the URL's host; a link opening in a new tab without passing the referrer when it has a URL, never opening the task) SHALL be in the row's trailing group and at the end of a card, except on the Inbox's top-level rows, whose source line names it instead (see `inbox-triage` "Inbox source lines"), and on a narrow row as "The title comes first on a narrow row" says. An imported origin (kind `import`) SHALL NOT show its id anywhere a person sees or hears it (rows, cards, the task's details and panel, its history, search results), since it is the key the importer keeps for duplicate detection: in a row or on a card without a URL it SHALL carry no origin item, and with one its item SHALL be the icon alone, a link named "Imported from <app>"; the task's details, panel and history SHALL read "Imported from <app>" (the app's name, such as Todoist or Microsoft To Do, else the provider as stored), or "Imported" without a provider. Labels SHALL be chips: each a small chip with the label's colour as a dot and its name, at most two shown, then "+n"; the full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel. No other item of a row SHALL have a pill background. Counts SHALL use tabular figures, not a monospace face.

Colour SHALL carry meaning only: the priority ring on the checkbox is coloured for P1 and P2 and neutral for P3 and P4; the date text follows one due ladder by how close the task's day is to the user's logical today: a date after tomorrow in the muted tone; tomorrow, as "Tomorrow" or the time under the Tomorrow heading, in the default text tone; today, timed or not, in the accent tone; and a day before today in the danger tone. A heading that implies the day leaves the date text out, so the ladder shows on the parts that remain (a time, "evening", the repeat mark). The ladder is computed on the device from local data and changes with the logical day without a reload; the deadline keeps its neutral, warning and danger tones; the label dot is the label's colour; everything else in the row is the muted colour, and the counts the faint colour. Every colour is a token.

What the view or the group heading already says SHALL be left out, by this table; everything else is shown when set:

| View or group | Left out of the row | Kept |
| --- | --- | --- |
| Inbox | the project, and the origin item (its source line says it) | everything else |
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

#### Scenario: The Inbox names the source instead
- **WHEN** an Inbox task has the origin `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}`
- **THEN** its Inbox row reads "From o/r#7" in its source line and carries no origin item at its end, while the same task in a project carries the issue item

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

#### Scenario: Imported origin in a project
- **WHEN** a project lists a task whose origin is `{kind: "import", provider: "todoist", id: "dfc92cb10aed05a4:1"}`
- **THEN** its row carries no origin item and no text "dfc92cb10aed05a4:1", and its expanded details and the task panel read "Imported from Todoist", never the id

#### Scenario: Imported card with a link
- **WHEN** a row shows a task whose origin is `{kind: "import", provider: "trello", id: "5f3a…", url: "https://trello.com/c/AbCd1234"}`
- **THEN** its item is the download icon alone, a link to the card whose accessible name is "Imported from Trello", and "5f3a…" is neither shown nor read out

### Requirement: The title comes first on a narrow row
A narrow row's title SHALL keep the width its checkbox, time column, marks, phone cell and disclosure leave. On a row under 30 rem the origin SHALL show as its icon only, its words in its accessible name. On the phone row (under 768 px of screen and 40 rem of row) the origin SHALL be left to the row's details and the task page, and the Inbox's source line SHALL be the line under the title, never beside it.

#### Scenario: Imported task on a phone
- **WHEN** a task imported from Todoist with a long title, a date and a repeat is shown at 390 px
- **THEN** the row shows the title up to its ellipsis, the repeat mark and the date, and nothing of its origin; its expanded details show the origin

#### Scenario: Inbox source line on a phone
- **WHEN** the Inbox shows an imported task at 390 px
- **THEN** the title is on the row's first line and "Imported from Todoist · 19 h ago" on the line under it

#### Scenario: Narrow list on a wide screen
- **WHEN** a list narrower than 30 rem on a 1280 px screen shows a task from a GitHub issue
- **THEN** its row ends with the link icon, a link whose name says it opens the source "o/r#7", while a 38 rem list still reads "o/r#7"
