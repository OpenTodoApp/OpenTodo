## MODIFIED Requirements

### Requirement: Metadata language
Row metadata SHALL be one language in every list and on every card. A list row's properties SHALL be at the metadata size in the muted text colour: in the right-hand column of a one-line row, each in its cell (the date, the estimate and the subtask progress with their icons, the assignee as an avatar named in its tooltip and for assistive technology), and in a narrower row one run of text under the title, its items separated by a middle dot, in this order: the date words with evening as a suffix, the project, the labels or the deadline or the subtask progress, the estimate (`1h`, or `35m / 1h` once time was tracked, or `35m` alone without an estimate), the assignee, then the parent's name, the deadline countdown with its hourglass icon when the time column and the third cell do not already hold it, the start ("Starts 3 Nov", "Started 1 Nov", "Someday"), blocked ("Blocked by 2" with its lock icon), the habit streak with its flame icon, and up to three custom field values and "+n" for the rest. The repeat mark SHALL be the repeat icon beside the title, read as "repeats" (an occurrence: "occurrence"). A card's line SHALL keep one run in the order of the date words, the repeat word with its icon, the deadline, the start, the estimate, blocked, the streak, the field values, the assignee and the project. The origin (the icon for its kind and the external id, else the URL's host; a link opening in a new tab without passing the referrer when it has a URL, never opening the task) SHALL be in the row's trailing group and at the end of a card, except on the Inbox's top-level rows, whose source line names it instead (see `inbox-triage` "Inbox source lines"). Labels SHALL be chips: each a small chip with the label's colour as a dot and its name, at most two shown, then "+n"; the full names in order SHALL be read by assistive technology, shown in a tooltip while the pointer is over the group or it has keyboard focus, and in the task panel. No other item of a row SHALL have a pill background. Counts SHALL use tabular figures, not a monospace face.

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
